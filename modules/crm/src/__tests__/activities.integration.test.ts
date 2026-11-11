import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { configureAccess } from '@ventora/access';
import { Conflict, InvalidInput } from '@ventora/errors';
import {
  createActivity,
  createContact,
  deleteActivity,
  getActivity,
  getTimeline,
  listActivities,
  mergeContacts,
  setActivityDone,
  updateActivity,
} from '../contract/index';
import { closeCrmPool } from '../server/db';

/*
 * Lot CR.7 on a real Postgres (plans/CRM.md; design S131 ClientDeskActivities): tasks, logged calls
 * and meetings, reminders (the time they need), who sees and who changes, the tick and its undo,
 * the history, the lists and the calendar, the merge (CR.5) carrying them, T1.
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
    [id, `cr7-${id.slice(0, 8)}`, `CR7 ${id.slice(0, 8)}`],
  );
  return id;
}

async function person(organizationId: string, role: Role) {
  const userId = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [userId, `CR7 ${role}`, `cr7-${userId}@test.local`, role === 'owner'],
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
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'CR7', $2) RETURNING id`,
      [`cr7-${uuid().slice(0, 8)}`, founder],
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

async function audits(org: string, targetId: string) {
  return adminQuery<{ action: string; target_type: string; metadata: Record<string, unknown> }>(
    `SELECT action, target_type, metadata FROM audit.audit_log
      WHERE organization_id = $1 AND category = 'crm' AND target_id = $2 ORDER BY created_at, id`,
    [org, targetId],
  );
}

beforeAll(() => {
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
});

afterAll(async () => {
  for (const table of ['activity', 'note', 'contact_merge', 'contact', 'company', 'settings']) {
    await adminQuery(`DELETE FROM crm.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  await adminQuery(`DELETE FROM crm.outbox_events WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  await closeCrmPool();
  await adminPool.end();
});

const at = (iso: string) => new Date(iso);

describe('CR.7 — creating activities', () => {
  it('a task stands alone; the due day and time; the reminder needs the time', async () => {
    const b = await business();
    const t = await createActivity({
      sessionToken: b.t,
      kind: 'task',
      title: 'Trimite oferta',
      dueOn: '2026-12-01',
      dueAt: '2026-12-01T10:00:00Z',
      remindBeforeMinutes: 15,
      priority: 'high',
    });
    expect(t).toMatchObject({
      kind: 'task',
      status: 'open',
      ownerUserId: b.owner.userId,
      subjectType: null,
      dueOn: '2026-12-01',
      priority: 'high',
      remindBeforeMinutes: 15,
    });
    expect(t.remindAt?.toISOString()).toBe('2026-12-01T09:45:00.000Z');
    const base = { sessionToken: b.t, kind: 'task', title: 'x' };
    expect(await refusal(createActivity({ ...base, remindBeforeMinutes: 15 }))).toBe(
      'remindBeforeMinutes:needs_time',
    );
    expect(await refusal(createActivity({ ...base, dueAt: '2026-12-01T10:00:00Z' }))).toBe(
      'dueOn:required',
    );
    expect(await refusal(createActivity({ ...base, dueOn: '2026-02-30' }))).toBe('dueOn:invalid');
    expect(
      await refusal(
        createActivity({
          ...base,
          remindBeforeMinutes: 30,
          dueOn: '2026-12-01',
          dueAt: '2026-12-01T10:00:00Z',
        }),
      ),
    ).toBe('remindBeforeMinutes:invalid');
    expect(await refusal(createActivity({ ...base, callResult: 'answered' }))).toBe(
      'callResult:invalid',
    );
    expect(await refusal(createActivity({ ...base, kind: 'fax' }))).toBe('kind:invalid');
    expect(await refusal(createActivity({ ...base, title: '  ' }))).toBe('title:required');
    expect((await audits(b.org, t.id)).map((a) => [a.action, a.target_type])).toEqual([
      ['crm.task_created', 'crm_task'],
    ]);
  });

  it('a logged call or meeting is done at once and goes into the history', async () => {
    const b = await business();
    const admin = await person(b.org, 'admin');
    const c = await createContact({ sessionToken: b.t, name: 'Mihai Stanciu' });
    const call = await createActivity({
      sessionToken: b.t,
      kind: 'call',
      title: 'Apel',
      subjectType: 'contact',
      subjectId: c.id,
      callResult: 'no_answer',
      durationMinutes: 3,
      note: 'Nu a răspuns.\nRevin mâine.',
    });
    expect(call).toMatchObject({ status: 'done', callResult: 'no_answer', durationMinutes: 3 });
    expect(call.doneByUserId).toBe(b.owner.userId);
    expect(call.note).toBe('Nu a răspuns.\nRevin mâine.');
    const meeting = await createActivity({
      sessionToken: b.t,
      kind: 'meeting',
      title: 'Întâlnire',
      subjectType: 'contact',
      subjectId: c.id,
      meetingPlace: 'salon',
      participantUserIds: [admin.userId],
      outcome: 'A ales pachetul.',
    });
    expect(meeting.participantUserIds).toEqual([admin.userId]);
    const planned = await createActivity({
      sessionToken: b.t,
      kind: 'call',
      title: 'Sună-l pe Mihai',
      subjectType: 'contact',
      subjectId: c.id,
      done: false,
    });
    expect(planned.status).toBe('open');
    const tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    const ids = tl.items.map((i) => (i.type === 'activity' ? i.activity.id : null));
    expect(ids.sort()).toEqual([call.id, meeting.id].sort());
    expect((await audits(b.org, call.id)).map((a) => a.action)).toEqual(['crm.activity_created']);
  });
});

describe('CR.7 — who sees and who changes', () => {
  it('the owner must see the record; a member sees through the record, changes only their own', async () => {
    const b = await business();
    const member = await person(b.org, 'member');
    const other = await person(b.org, 'member');
    const outsider = await business();
    const mine = await createContact({ sessionToken: b.t, name: 'Al proprietarului' });
    const free = await createContact({ sessionToken: b.t, name: 'Liber', ownerUserId: null });

    const onMine = {
      sessionToken: b.t,
      kind: 'task',
      title: 'x',
      subjectType: 'contact',
      subjectId: mine.id,
    };
    expect(await refusal(createActivity({ ...onMine, ownerUserId: member.userId }))).toBe(
      'ownerUserId:cannot_see',
    );
    expect(await refusal(createActivity({ ...onMine, ownerUserId: outsider.owner.userId }))).toBe(
      'ownerUserId:not_member',
    );
    expect(
      await refusal(
        createActivity({
          sessionToken: member.token,
          kind: 'task',
          title: 'x',
          subjectType: 'contact',
          subjectId: mine.id,
        }),
      ),
    ).toBe('Forbidden');

    const task = await createActivity({
      sessionToken: b.t,
      kind: 'task',
      title: 'Sună clientul',
      subjectType: 'contact',
      subjectId: free.id,
      ownerUserId: member.userId,
      dueOn: '2026-12-02',
    });
    expect((await listActivities({ sessionToken: member.token })).map((a) => a.id)).toEqual([
      task.id,
    ]);
    // the other member sees it (the contact is unassigned) but cannot change it
    expect((await getActivity({ sessionToken: other.token, activityId: task.id })).id).toBe(
      task.id,
    );
    expect(
      await refusal(
        setActivityDone({ sessionToken: other.token, activityId: task.id, done: true }),
      ),
    ).toBe('Forbidden');
    expect(
      await refusal(updateActivity({ sessionToken: other.token, activityId: task.id, title: 'y' })),
    ).toBe('Forbidden');
    const ticked = await setActivityDone({
      sessionToken: member.token,
      activityId: task.id,
      done: true,
    });
    expect(ticked.status).toBe('done');

    // a standalone task of the owner: the members do not see it
    const alone = await createActivity({ sessionToken: b.t, kind: 'task', title: 'Doar a mea' });
    expect(await refusal(getActivity({ sessionToken: member.token, activityId: alone.id }))).toBe(
      'Forbidden',
    );
    const team = await listActivities({ sessionToken: member.token, who: 'team', status: 'all' });
    expect(team.map((a) => a.id)).toEqual([task.id]);
  });

  it('editing: the reminder follows the time; the audit names the fields; the tick and its undo', async () => {
    const b = await business();
    const c = await createContact({ sessionToken: b.t, name: 'Ana' });
    const t = await createActivity({
      sessionToken: b.t,
      kind: 'task',
      title: 'Ofertă',
      subjectType: 'contact',
      subjectId: c.id,
      dueOn: '2026-12-01',
      dueAt: '2026-12-01T10:00:00Z',
      remindBeforeMinutes: 60,
    });
    const moved = await updateActivity({
      sessionToken: b.t,
      activityId: t.id,
      dueOn: '2026-12-03',
      dueAt: '2026-12-03T08:00:00Z',
    });
    expect(moved.remindAt?.toISOString()).toBe('2026-12-03T07:00:00.000Z');
    const noTime = await updateActivity({ sessionToken: b.t, activityId: t.id, dueAt: null });
    expect(noTime).toMatchObject({ dueAt: null, remindBeforeMinutes: null, remindAt: null });
    const log = await audits(b.org, t.id);
    expect(log[1]).toMatchObject({
      action: 'crm.task_updated',
      metadata: { fields: ['due_on', 'due_at'] },
    });

    await setActivityDone({ sessionToken: b.t, activityId: t.id, done: true });
    let tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(tl.items.map((i) => i.type)).toEqual(['activity']);
    await setActivityDone({ sessionToken: b.t, activityId: t.id, done: false });
    tl = await getTimeline({ sessionToken: b.t, subjectType: 'contact', subjectId: c.id });
    expect(tl.items).toEqual([]);
    expect((await audits(b.org, t.id)).map((a) => a.action)).toEqual([
      'crm.task_created',
      'crm.task_updated',
      'crm.task_updated',
      'crm.task_completed',
      'crm.task_updated',
    ]);
  });

  it('delete: into the bin, out of the lists', async () => {
    const b = await business();
    const t = await createActivity({ sessionToken: b.t, kind: 'reminder', title: 'Amintește-mi' });
    const gone = await deleteActivity({ sessionToken: b.t, activityId: t.id });
    expect(gone.deletedAt).not.toBeNull();
    expect(await listActivities({ sessionToken: b.t, status: 'all' })).toEqual([]);
    expect(await refusal(updateActivity({ sessionToken: b.t, activityId: t.id, title: 'x' }))).toBe(
      'activity_deleted',
    );
    expect(await adminQuery(`SELECT id FROM crm.activity WHERE id = $1`, [t.id])).toHaveLength(1);
  });
});

describe('CR.7 — the lists and the calendar', () => {
  it('by due day and time; the calendar only the timed ones; a range of days', async () => {
    const b = await business();
    const mk = (title: string, extra: Record<string, unknown>) =>
      createActivity({ sessionToken: b.t, kind: 'task', title, ...extra });
    const noDue = await mk('fără termen', {});
    const d2 = await mk('ziua 2', { dueOn: '2026-12-02' });
    const d1late = await mk('ziua 1 la 15', {
      dueOn: '2026-12-01',
      dueAt: at('2026-12-01T15:00:00Z'),
    });
    const d1early = await mk('ziua 1 la 9', { dueOn: '2026-12-01', dueAt: '2026-12-01T09:00:00Z' });
    const all = await listActivities({ sessionToken: b.t });
    expect(all.map((a) => a.id)).toEqual([d1early.id, d1late.id, d2.id, noDue.id]);
    const calendar = await listActivities({
      sessionToken: b.t,
      timedOnly: true,
      from: '2026-12-01',
      to: '2026-12-07',
    });
    expect(calendar.map((a) => a.id)).toEqual([d1early.id, d1late.id]);
    const day2 = await listActivities({ sessionToken: b.t, from: '2026-12-02', to: '2026-12-02' });
    expect(day2.map((a) => a.id)).toEqual([d2.id]);
    expect(await refusal(listActivities({ sessionToken: b.t, who: 'someone' }))).toBe(
      'who:invalid',
    );
  });

  it('the merge (CR.5) carries the activities', async () => {
    const b = await business();
    const keep = await createContact({ sessionToken: b.t, name: 'Ana Pop' });
    const lost = await createContact({ sessionToken: b.t, name: 'Ana P.' });
    const t = await createActivity({
      sessionToken: b.t,
      kind: 'task',
      title: 'Sună',
      subjectType: 'contact',
      subjectId: lost.id,
    });
    await mergeContacts({ sessionToken: b.t, keepId: keep.id, mergeId: lost.id });
    expect((await getActivity({ sessionToken: b.t, activityId: t.id })).subjectId).toBe(keep.id);
    const onKeep = await listActivities({
      sessionToken: b.t,
      subjectType: 'contact',
      subjectId: keep.id,
    });
    expect(onKeep.map((a) => a.id)).toEqual([t.id]);
  });

  it('T1: an activity of another business is not found', async () => {
    const a = await business();
    const b = await business();
    const t = await createActivity({ sessionToken: a.t, kind: 'task', title: 'A' });
    expect(await refusal(getActivity({ sessionToken: b.t, activityId: t.id }))).toBe(
      'ResourceNotFound',
    );
    expect(
      await refusal(setActivityDone({ sessionToken: b.t, activityId: t.id, done: true })),
    ).toBe('ResourceNotFound');
    expect(await listActivities({ sessionToken: b.t, who: 'team', status: 'all' })).toEqual([]);
  });
});
