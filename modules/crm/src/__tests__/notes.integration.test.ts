import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import { closeFilesPool, MemoryStorageAdapter, setStorageAdapter } from '@ventora/files';
import {
  createCompany,
  createContact,
  createNote,
  deleteAttachment,
  deleteContact,
  deleteNote,
  finishAttachmentUpload,
  getAttachmentLink,
  getTimeline,
  listMyMentions,
  mergeContacts,
  startAttachmentUpload,
  updateNote,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.6 on a real Postgres (plans/CRM.md; design S130 ClientDeskContact „Un singur istoric”):
 * notes and comments (the text, mentions only of people who see the record, the author edits, the
 * author or crm:admin deletes into the bin), the files through core/files, the history, the merge
 * (CR.5) carrying them, T1.
 */

const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];
const founder = uuid();
let planId: string | null = null;
type Role = 'owner' | 'admin' | 'member';

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `cr6-${id.slice(0, 8)}`, `CR6 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR6 ${role}`, `cr6-${userId}@test.local`, role === 'owner'],
  );
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'crm') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return { userId, token };
}

async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR6', $2) RETURNING id`,
      [`cr6-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'crm')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value) VALUES ($1, 'crm.contacts', NULL)`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor) VALUES ($1, 'RON', 'month', 100)`,
    [id],
  );
  await adminQuery(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [id, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status, created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', CURRENT_DATE, EXTRACT(DAY FROM CURRENT_DATE), 'active', $3)`,
    [organizationId, id, founder],
  );
}

async function business() {
  const org = await createOrg();
  const owner = await person(org, 'owner');
  await subscribe(org);
  return { org, owner, t: owner.token };
}

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof InvalidInput) return `${err.field}:${err.message}`;
    if (err instanceof Conflict) return err.message;
    return (err as Error).constructor.name;
  }
  return 'ok';
}

const storage = new MemoryStorageAdapter();
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]);

async function upload(
  t: string,
  org: string,
  subjectType: 'contact' | 'company',
  subjectId: string,
) {
  const { fileId } = await startAttachmentUpload({
    sessionToken: t,
    subjectType,
    subjectId,
    name: 'scan.png',
    contentType: 'image/png',
    sizeBytes: PNG.length,
  });
  storage.put(`${org}/${fileId}`, PNG, 'image/png');
  return finishAttachmentUpload({ sessionToken: t, fileId });
}

async function auditCount(org: string, action: string, targetId: string) {
  const rows = await adminQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit.audit_log
      WHERE organization_id = $1 AND category = 'crm' AND action = $2 AND target_id = $3`,
    [org, action, targetId],
  );
  return Number(rows[0]?.n ?? 0);
}

const noteIds = (items: { type: string; note?: { id: string }; file?: { id: string } }[]) =>
  items.map((i) => (i.type === 'file' ? i.file!.id : i.note!.id));

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  setStorageAdapter(storage);
  process.env.FILES_LINK_SECRET = 'integration-crm-link-secret-0123456789abcdef';
  process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://hub.example.test';
});

afterAll(async () => {
  for (const table of [
    'note',
    'contact_merge',
    'contact',
    'company',
    'settings',
    'outbox_events',
  ]) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(`DELETE FROM files.outbox_events WHERE organization_id = ANY($1::uuid[])`, [
    orgs,
  ]).catch(() => {});
  await adminQuery(`DELETE FROM files.file WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await closeFilesPool();
  await adminPool.end();
});

describe('CR.6 — notes and comments', () => {
  it('a note keeps its lines; the history shows it; the text is checked', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.t, name: 'Ana' });
    const n = await createNote({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: c.id,
      body: '  Prima linie\r\nA doua linie  ',
    });
    expect(n.kind).toBe('note');
    expect(n.body).toBe('Prima linie\nA doua linie');
    expect(n.authorUserId).toBe(b.owner.userId);
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(tl.items.map((i) => i.type)).toEqual(['note']);
    expect(tl.hasMore).toBe(false);

    const base = { sessionToken: b.t, subjectType: 'contact', subjectId: c.id };
    expect(await refusal(createNote({ ...base, body: '   ' }))).toBe('body:required');
    expect(await refusal(createNote({ ...base, body: 'x'.repeat(5001) }))).toBe('body:too_long');
    expect(await refusal(createNote({ ...base, body: 'x', kind: 'email' }))).toBe('kind:invalid');
    expect(await refusal(createNote({ ...base, subjectType: 'lead', body: 'x' }))).toBe(
      'subjectType:not_available',
    );
    expect(await auditCount(b.org, 'crm.note_created', n.id)).toBe(1);
  });

  it('a member writes only on the contacts they see; a contact in the bin takes no note', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const mine = await createContact({ sessionToken: b.t, name: 'Al meu' });
    const free = await createContact({ sessionToken: b.t, name: 'Liber', ownerUserId: null });
    const asMember = { sessionToken: member.token, subjectType: 'contact' };
    expect(await refusal(createNote({ ...asMember, subjectId: mine.id, body: 'x' }))).toBe(
      'Forbidden',
    );
    expect(await refusal(getTimeline({ ...asMember, subjectId: mine.id }))).toBe('Forbidden');
    const ok = await createNote({ ...asMember, subjectId: free.id, body: 'pe unul liber' });
    expect(ok.subjectId).toBe(free.id);

    await deleteContact({ sessionToken: b.t, contactId: free.id });
    expect(
      await refusal(
        createNote({ sessionToken: b.t, subjectType: 'contact', subjectId: free.id, body: 'x' }),
      ),
    ).toBe('contact_deleted');
  });

  it('mentions: only people who see the record (S130), at most 20', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const admin = await person(b.org, 'admin');
    const outsider = await business();
    const assigned = await createContact({ sessionToken: b.t, name: 'Atribuit' });
    const base = {
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: assigned.id,
      kind: 'comment',
    };
    expect(await refusal(createNote({ ...base, body: '@m', mentions: [member.userId] }))).toBe(
      'mentions:cannot_see',
    );
    expect(
      await refusal(createNote({ ...base, body: '@o', mentions: [outsider.owner.userId] })),
    ).toBe('mentions:not_member');
    const many = Array.from({ length: 21 }, () => uuid());
    expect(await refusal(createNote({ ...base, body: '@x', mentions: many }))).toBe(
      'mentions:too_many',
    );
    const c = await createNote({ ...base, body: '@admin', mentions: [admin.userId, admin.userId] });
    expect(c.kind).toBe('comment');
    expect(c.mentions).toEqual([admin.userId]);

    // a company: every member with access to ClientDesk sees it
    const co = await createCompany({ sessionToken: b.t, name: 'Firma SRL' });
    const onCo = await createNote({
      sessionToken: b.t,
      subjectType: 'company',
      subjectId: co.id,
      kind: 'comment',
      body: '@member',
      mentions: [member.userId],
    });
    expect((await listMyMentions({ sessionToken: member.token })).map((n) => n.id)).toEqual([
      onCo.id,
    ]);
    expect((await listMyMentions({ sessionToken: admin.token })).map((n) => n.id)).toEqual([c.id]);
  });

  it('the author edits; the author or crm:admin deletes, into the bin', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const other = await person(b.org, 'member');
    const c = await createContact({ sessionToken: b.t, name: 'Comun', ownerUserId: null });
    const n = await createNote({
      sessionToken: member.token,
      subjectType: 'contact',
      subjectId: c.id,
      body: 'v1',
    });
    expect(await refusal(updateNote({ sessionToken: other.token, noteId: n.id, body: 'v2' }))).toBe(
      'Forbidden',
    );
    expect(await refusal(updateNote({ sessionToken: b.t, noteId: n.id, body: 'v2' }))).toBe(
      'Forbidden',
    );
    const edited = await updateNote({ sessionToken: member.token, noteId: n.id, body: 'v2' });
    expect(edited.body).toBe('v2');
    expect(edited.editedAt).not.toBeNull();

    expect(await refusal(deleteNote({ sessionToken: other.token, noteId: n.id }))).toBe(
      'Forbidden',
    );
    const gone = await deleteNote({ sessionToken: b.t, noteId: n.id });
    expect(gone.deletedAt).not.toBeNull();
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(tl.items).toEqual([]);
    expect(
      await refusal(updateNote({ sessionToken: member.token, noteId: n.id, body: 'v3' })),
    ).toBe('note_deleted');
    expect(await adminQuery(`SELECT id FROM crm.note WHERE id = $1`, [n.id])).toHaveLength(1);
    expect(await auditCount(b.org, 'crm.note_updated', n.id)).toBe(1);
    expect(await auditCount(b.org, 'crm.note_deleted', n.id)).toBe(1);
  });

  it('T1: a note of another business is not found', async () => {
    const a = await business();
    const b = await business();
    const c = await createContact({ sessionToken: a.t, name: 'A' });
    const n = await createNote({
      sessionToken: a.t,
      subjectType: 'contact',
      subjectId: c.id,
      body: 'x',
    });
    expect(await refusal(updateNote({ sessionToken: b.t, noteId: n.id, body: 'y' }))).toBe(
      'ResourceNotFound',
    );
    expect(await refusal(deleteNote({ sessionToken: b.t, noteId: n.id }))).toBe('ResourceNotFound');
    expect(
      await refusal(getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id })),
    ).toBe('ResourceNotFound');
  });
});

describe('CR.6 — files and the history', () => {
  it('upload, history, link, delete (the uploader or crm:admin), audit', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const c = await createContact({ sessionToken: b.t, name: 'Cu fișiere', ownerUserId: null });
    const note = await createNote({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: c.id,
      body: 'n',
    });
    const f = await upload(member.token, b.org, 'contact', c.id);
    expect(f.subjectId).toBe(c.id);
    expect(f.contentType).toBe('image/png');
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(noteIds(tl.items).sort()).toEqual([f.id, note.id].sort());
    expect(await getAttachmentLink({ sessionToken: b.t, fileId: f.id })).toMatch(
      /^https:\/\/hub\.example\.test\/files\//,
    );
    expect(await auditCount(b.org, 'crm.attachment_added', f.id)).toBe(1);

    const own = await upload(b.t, b.org, 'contact', c.id);
    expect(await refusal(deleteAttachment({ sessionToken: member.token, fileId: own.id }))).toBe(
      'Forbidden',
    );
    await deleteAttachment({ sessionToken: b.t, fileId: f.id });
    expect(await auditCount(b.org, 'crm.attachment_deleted', f.id)).toBe(1);
    const after = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(noteIds(after.items.filter((i) => i.type === 'file'))).toEqual([own.id]);

    // a type outside PNG / JPEG / PDF is refused before the upload
    expect(
      await refusal(
        startAttachmentUpload({
          sessionToken: b.t,
          subjectType: 'contact',
          subjectId: c.id,
          name: 'x.exe',
          contentType: 'application/x-msdownload',
          sizeBytes: 10,
        }),
      ),
    ).not.toBe('ok');
  });

  it('a member does not reach the files of a contact they do not see; a company file works', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const hidden = await createContact({ sessionToken: b.t, name: 'Ascuns' });
    const f = await upload(b.t, b.org, 'contact', hidden.id);
    expect(await refusal(getAttachmentLink({ sessionToken: member.token, fileId: f.id }))).toBe(
      'Forbidden',
    );
    const co = await createCompany({ sessionToken: b.t, name: 'Acme SRL' });
    const cf = await upload(member.token, b.org, 'company', co.id);
    const tl = await getTimeline({
      sessionToken: member.token,
      subjectType: 'company',
      subjectId: co.id,
    });
    expect(noteIds(tl.items)).toEqual([cf.id]);
  });

  it('the merge (CR.5) carries the notes and shows the files of the merged contact', async () => {
    const b = await business();
    const keep = await createContact({ sessionToken: b.t, name: 'Ana Pop' });
    const lost = await createContact({ sessionToken: b.t, name: 'Ana P.' });
    const n = await createNote({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: lost.id,
      body: 'veche',
    });
    const f = await upload(b.t, b.org, 'contact', lost.id);
    await mergeContacts({ sessionToken: b.t, keepId: keep.id, mergeId: lost.id });
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: keep.id });
    expect(noteIds(tl.items).sort()).toEqual([f.id, n.id].sort());
    // the file of the merged contact is reached through the contact that stayed
    expect(await getAttachmentLink({ sessionToken: b.t, fileId: f.id })).toContain('/files/');
    const moved = await updateNote({ sessionToken: b.t, noteId: n.id, body: 'mutată' });
    expect(moved.subjectId).toBe(keep.id);
  });

  it('the history pages, newest first', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.t, name: 'Multe' });
    const made: string[] = [];
    for (let i = 0; i < 5; i++) {
      const n = await createNote({
        sessionToken: b.t,
        subjectType: 'contact',
        subjectId: c.id,
        body: `n${i}`,
      });
      made.push(n.id);
    }
    const base = { sessionToken: b.t, subjectType: 'contact', subjectId: c.id, limit: 2 };
    const p1 = await getTimeline(base);
    const p3 = await getTimeline({ ...base, offset: 4 });
    expect(noteIds(p1.items)).toEqual([made[4], made[3]]);
    expect(p1.hasMore).toBe(true);
    expect(noteIds(p3.items)).toEqual([made[0]]);
    expect(p3.hasMore).toBe(false);
  });
});
