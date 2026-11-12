import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { configureAccess } from '@ventora/access';
import { closeAuditPools } from '@ventora/audit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { CaptureEmailAdapter, setEmailChannel } from '@ventora/notifications';
import { MemoryStorageAdapter, closeFilesPool, setStorageAdapter } from '@ventora/files';
import {
  archiveFormQuestion,
  configurePublicBooking,
  createFormQuestion,
  createService,
  eraseClient,
  confirmPublicAnswerPhoto,
  getAnswerPhotoLink,
  getAppointmentAnswers,
  getClientLastAnswers,
  getPublicBookingPage,
  listFormQuestions,
  listStaff,
  reorderFormQuestions,
  requestPublicAnswerPhoto,
  saveAppointmentAnswers,
  setBusinessHours,
  startPublicBooking,
  updateFormQuestion,
  verifyPublicBooking,
} from '../contract/index.js';
import { closeBookingPool } from '../server/db.js';
import { runPublicHoldCleanupJob } from '../server/public-cleanup.js';

const storage = new MemoryStorageAdapter();
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

/*
 * Lot B.12 on a real Postgres: the questions at booking (BookingCustomForms, S127). The salon's
 * questions, the limits, the order; the answers on the public page (held with the hold, moved to the
 * booking, wiped from the hold), from the Hub, on the booking; T1, grants, the GDPR erasure. The
 * anti-robot check is a fake verifier, the code goes to an in-memory mailbox (as in B.11a).
 */

const mailbox = new CaptureEmailAdapter();
setEmailChannel(mailbox);

const runtimePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const adminPool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 2,
});

async function adminQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await adminPool.query(sql, params)).rows as T[];
}

const uuid = () => crypto.randomUUID();
const orgs: string[] = [];

async function createUser(name: string, twoFactorEnabled = false) {
  const id = uuid();
  await adminQuery(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, name, `b12-${id}@test.local`, twoFactorEnabled],
  );
  return id;
}

async function createSession(userId: string, organizationId: string) {
  const token = uuid();
  await adminQuery(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [uuid(), userId, token, organizationId],
  );
  return token;
}

async function createOrg() {
  const id = uuid();
  orgs.push(id);
  await adminQuery(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `b12-${id.slice(0, 8)}`, `B12 ${id.slice(0, 8)}`],
  );
  return id;
}

type Role = 'owner' | 'admin' | 'member' | 'external_collaborator';
type Person = { userId: string; token: string };

async function person(organizationId: string, role: Role, name: string): Promise<Person> {
  const userId = await createUser(name, role === 'owner');
  await adminQuery(
    `INSERT INTO organizations.membership (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'active', NOW())`,
    [uuid(), organizationId, userId, role],
  );
  await grantBooking(organizationId, userId);
  return { userId, token: await createSession(userId, organizationId) };
}

async function grantBooking(organizationId: string, userId: string) {
  await adminQuery(
    `INSERT INTO access.application_access (organization_id, user_id, application_id)
     VALUES ($1::uuid, $2::uuid, 'booking') ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  );
}

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await errorOf(p);
  if (e instanceof InvalidInput) return `${e.field}:${e.message}`;
  if (e instanceof Conflict) return e.message;
  throw new Error(`expected a refusal, got ${String(e)}`);
}

const founder = uuid();
let planId: string | null = null;

/** A published plan version with booking and 1000 appointments a month, and a subscription. */
async function subscribe(organizationId: string) {
  planId ??= (
    await adminQuery<{ id: string }>(
      `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'B12', $2) RETURNING id`,
      [`b12-${uuid().slice(0, 8)}`, founder],
    )
  )[0]!.id;
  const [{ id }] = await adminQuery<{ id: string }>(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     SELECT $1, COALESCE(max(version_number), 0) + 1, $2 FROM commercial.plan_version WHERE plan_id = $1
     RETURNING id`,
    [planId, founder],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_application (plan_version_id, application_id) VALUES ($1, 'booking')`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'booking.appointments', 1000)`,
    [id],
  );
  await adminQuery(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 100)`,
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

const WEEK_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isOpen: true,
  opensAtMin: 480,
  closesAtMin: 1200,
}));

/** A time three days ahead (past any notice), at hh:00 UTC (10:00–18:00 in Bucharest). */
function at(hourUtc: number, minute = 0): Date {
  const d = new Date(Date.now() + 3 * 86_400_000);
  d.setUTCHours(hourUtc, minute, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');

let A: { org: string; slug: string; owner: Person };
let B: { org: string; slug: string; owner: Person };
let staffA: string;
let svcA: string;
let svc2: string;
let n = 0;

async function slugOf(org: string) {
  return (
    await adminQuery<{ slug: string }>(
      `SELECT slug FROM organizations.organization WHERE id = $1`,
      [org],
    )
  )[0]!.slug;
}

/** A fresh e-mail and phone for each attempt (the limits per e-mail are per day). */
function visitor() {
  n += 1;
  return {
    name: `Client Public ${n}`,
    phone: `+4072${String(1000000 + n)}`,
    email: `public-${n}-${uuid().slice(0, 6)}@test.local`,
  };
}

function lastCode(email: string): string {
  const m = mailbox.to(email).at(-1);
  if (!m) throw new Error('no e-mail');
  // the subject ends with the code (the business name may hold digits)
  return /: (\d{6})$/.exec(m.subject)![1]!;
}

async function start(
  slug: string,
  hourUtc: number,
  who = visitor(),
  extra: object = {},
  minute = 0,
) {
  n += 1;
  const hold = await startPublicBooking({
    slug,
    serviceId: svcA,
    staffMemberId: staffA,
    startsAt: iso(at(hourUtc, minute)),
    captchaToken: 'ok',
    ip: `203.0.113.${n % 250}`,
    ...who,
    ...extra,
  });
  return { hold, who };
}

beforeAll(async () => {
  setStorageAdapter(storage);
  process.env.FILES_LINK_SECRET = 'integration-files-link-secret-0123456789';
  process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://hub.example.test';
  configureAccess({ entitlementProvider: { isEnabled: async () => true } });
  configurePublicBooking({ captcha: async (token) => token === 'ok' });
  const orgA = await createOrg();
  A = { org: orgA, slug: await slugOf(orgA), owner: await person(orgA, 'owner', 'Ana Owner') };
  const orgB = await createOrg();
  B = { org: orgB, slug: await slugOf(orgB), owner: await person(orgB, 'owner', 'Bea Owner') };
  await subscribe(orgA);
  await subscribe(orgB);
  await setBusinessHours({ sessionToken: A.owner.token, days: WEEK_OPEN });
  staffA = (await listStaff({ sessionToken: A.owner.token })).members[0]!.id;
  svcA = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Tuns',
      durationMinutes: 30,
      priceMinor: 10000,
    } as never)
  ).id;
  svc2 = (
    await createService({
      sessionToken: A.owner.token,
      name: 'Vopsit',
      durationMinutes: 60,
      priceMinor: 20000,
    } as never)
  ).id;
  svcB2 = (
    await createService({
      sessionToken: B.owner.token,
      name: 'Tuns B',
      durationMinutes: 30,
      priceMinor: 10000,
    } as never)
  ).id;
});

afterAll(async () => {
  configurePublicBooking({});
  for (const table of [
    'appointment_answer',
    'form_question',
    'manage_token',
    'public_hold',
    'client_block',
    'appointment_resource',
    'appointment_history',
    'appointment',
    'appointment_counter',
    'client',
    'settings',
    'staff_member',
    'business_hours',
    'service',
    'outbox_events',
  ]) {
    await adminQuery(`DELETE FROM booking.${table} WHERE organization_id = ANY($1::uuid[])`, [
      orgs,
    ]).catch(() => {});
  }
  await adminQuery(
    `DELETE FROM access.application_access WHERE organization_id = ANY($1::uuid[])`,
    [orgs],
  );
  await adminQuery(`DELETE FROM organizations.organization WHERE id = ANY($1::uuid[])`, [orgs]);
  for (const table of ['outbox_events', 'file']) {
    await adminQuery(`DELETE FROM files.${table} WHERE organization_id = ANY($1::uuid[])`, [orgs]);
  }
  setStorageAdapter(null);
  await closeFilesPool();
  await closeBookingPool();
  await closeAuditPools();
  await runtimePool.end();
  await adminPool.end();
});

// ── B.12 ────────────────────────────────────────────────────────────────────────────────────

let svcB2: string;

async function asBookingRw<T>(organizationId: string, fn: (client: PoolClient) => Promise<T>) {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE booking_rw');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

/** The photo of a question on a pending hold, as the page does it: link, bytes, confirm. */
async function photo(holdId: string, questionId: string, bytes = JPEG, slug = A.slug) {
  const { fileId } = await requestPublicAnswerPhoto({
    slug,
    holdId,
    questionId,
    name: 'look.jpg',
    contentType: 'image/jpeg',
    sizeBytes: bytes.length,
  });
  storage.put(`${A.org}/${fileId}`, bytes, 'image/jpeg');
  return confirmPublicAnswerPhoto({ slug, holdId, fileId });
}

async function fileStatus(fileId: string) {
  return (
    await adminQuery<{ status: string }>(`SELECT status FROM files.file WHERE id = $1`, [fileId])
  )[0]?.status;
}

const q = (fields: Record<string, unknown>) =>
  createFormQuestion({ sessionToken: A.owner.token, ...fields } as never);

let qColor: string; // short text, required, all services
let qFirst: string; // yes / no, optional, in the Hub
let qPick: string; // one choice, required, only svcA
let qOther: string; // only the second service
let qNum: string; // number, optional

describe('B.12 — the questions (Setări)', () => {
  it('the seven types; errors: no question, fewer than two options, a service of another business', async () => {
    expect(await refusal(q({ label: '   ', kind: 'short_text' }))).toBe('label:required');
    expect(await refusal(q({ label: 'Ce culoare?', kind: 'choice', options: ['Doar una'] }))).toBe(
      'options:too_few',
    );
    expect(
      await refusal(q({ label: 'Ce culoare?', kind: 'choice', options: ['A', ' ', 'B'] })),
    ).toBe('options:invalid');
    expect(await refusal(q({ label: 'X', kind: 'file' }))).toBe('kind:invalid');
    expect(await refusal(q({ label: 'X', kind: 'short_text', serviceIds: [svcB2] }))).toBe(
      'serviceIds:invalid',
    );

    qColor = (
      await q({
        label: ' Ce culoare doriți? ',
        kind: 'short_text',
        required: true,
        helpText: 'De exemplu: blond cenușiu',
      })
    ).id;
    qFirst = (await q({ label: 'Prima vizită?', kind: 'yes_no', inHub: true })).id;
    const pick = await q({
      label: 'Lungimea părului',
      kind: 'choice',
      options: ['Scurt', 'Mediu', 'Lung'],
      serviceIds: [svcA],
      required: true,
      inHub: true,
      allowsPhoto: true,
    });
    qPick = pick.id;
    expect(pick).toMatchObject({
      label: 'Lungimea părului',
      options: ['Scurt', 'Mediu', 'Lung'],
      serviceIds: [svcA],
      required: true,
      inHub: true,
      allowsPhoto: true,
      archivedAt: null,
    });
    qOther = (await q({ label: 'Doar la vopsit', kind: 'long_text', serviceIds: [svc2] })).id;
    qNum = (await q({ label: 'Câți ani aveți?', kind: 'number', serviceIds: [] })).id;
    const all = await listFormQuestions({ sessionToken: A.owner.token });
    expect(all.map((x) => x.id)).toEqual([qColor, qFirst, qPick, qOther, qNum]);
    expect(all[0]).toMatchObject({
      label: 'Ce culoare doriți?',
      helpText: 'De exemplu: blond cenușiu',
    });
    // empty services = „Toate serviciile”
    expect(all[4]!.serviceIds).toBeNull();
  });

  it('a member reads the questions but does not change them', async () => {
    const member = await person(A.org, 'member', 'Mara Membru');
    expect((await listFormQuestions({ sessionToken: member.token })).length).toBe(5);
    expect(
      await errorOf(
        createFormQuestion({ sessionToken: member.token, label: 'X', kind: 'yes_no' } as never),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('S127 (proposed): at most 5 questions per service', async () => {
    // svcA has 4 (qColor, qFirst, qPick, qNum): one more fits, the sixth does not
    const fifth = await q({ label: 'A cincea', kind: 'date', serviceIds: [svcA] });
    expect(await refusal(q({ label: 'A șasea', kind: 'date' }))).toBe('serviceIds:too_many');
    expect(await refusal(q({ label: 'A șasea', kind: 'date', serviceIds: [svcA] }))).toBe(
      'serviceIds:too_many',
    );
    // the second service has 4 (qColor, qFirst, qOther, qNum): one for it alone still fits
    const forSvc2 = await q({ label: 'Doar vopsit 2', kind: 'yes_no', serviceIds: [svc2] });
    await archiveFormQuestion({ sessionToken: A.owner.token, questionId: forSvc2.id });
    // archived: out of the count, out of the list
    await archiveFormQuestion({ sessionToken: A.owner.token, questionId: fifth.id });
    const again = await q({ label: 'A cincea din nou', kind: 'date', serviceIds: [svcA] });
    await archiveFormQuestion({ sessionToken: A.owner.token, questionId: again.id });
    expect((await listFormQuestions({ sessionToken: A.owner.token })).length).toBe(5);
    expect(
      (await listFormQuestions({ sessionToken: A.owner.token, includeArchived: true })).length,
    ).toBe(8);
  });

  it('the order: every active question once; the client sees the new order', async () => {
    expect(
      await refusal(
        reorderFormQuestions({ sessionToken: A.owner.token, questionIds: [qColor, qFirst] }),
      ),
    ).toBe('questionIds:invalid');
    const order = [qPick, qColor, qFirst, qOther, qNum];
    const res = await reorderFormQuestions({ sessionToken: A.owner.token, questionIds: order });
    expect(res.map((x) => x.id)).toEqual(order);
    const page = await getPublicBookingPage({ slug: A.slug });
    expect(page.questions.map((x) => x.id)).toEqual(order);
    expect(page.questions[0]).not.toHaveProperty('inHub');
    expect(page.questions[0]).toMatchObject({ id: qPick, allowsPhoto: true });
  });
});

describe('B.12 — the answers on the public page and on the booking', () => {
  let appointmentId: string;
  let photoId: string;

  it('a required question left empty: „Răspundeți la această întrebare.”; wrong values refused', async () => {
    expect(await refusal(start(A.slug, 9, visitor(), { answers: [] }))).toBe(
      `answers:required:${qPick}`,
    );
    expect(
      await refusal(
        start(A.slug, 9, visitor(), {
          answers: [
            { questionId: qPick, value: 'Foarte lung' },
            { questionId: qColor, value: 'Roșu' },
          ],
        }),
      ),
    ).toBe(`answers:invalid:${qPick}`);
    // a question of another service
    expect(
      await refusal(
        start(A.slug, 9, visitor(), {
          answers: [
            { questionId: qPick, value: 'Lung' },
            { questionId: qColor, value: 'Roșu' },
            { questionId: qOther, value: 'Nu se cere aici' },
          ],
        }),
      ),
    ).toBe('answers:invalid');
    expect(
      await refusal(
        start(A.slug, 9, visitor(), {
          answers: [
            { questionId: qPick, value: 'Lung' },
            { questionId: qColor, value: 'Roșu' },
            { questionId: qNum, value: 'patruzeci' },
          ],
        }),
      ),
    ).toBe(`answers:invalid:${qNum}`);
  });

  it('the answers wait in the hold, go to the booking, and the hold keeps nothing', async () => {
    const { hold, who } = await start(A.slug, 9, visitor(), {
      answers: [
        { questionId: qPick, value: 'Lung' },
        { questionId: qColor, value: '  Blond cenușiu ' },
        { questionId: qNum, value: '41' },
      ],
    });
    const [pending] = await adminQuery<{ answers: unknown }>(
      `SELECT answers FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(pending!.answers).toHaveLength(3);
    // S127: the optional photo, only for a question that allows it, on this pending hold
    expect(await refusal(photo(hold.holdId, qColor))).toBe('questionId:invalid');
    await expect(
      requestPublicAnswerPhoto({
        slug: A.slug,
        holdId: hold.holdId,
        questionId: qPick,
        name: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    // T1: the hold of A is not found through the slug of B
    expect(await errorOf(photo(hold.holdId, qPick, JPEG, B.slug))).toBeInstanceOf(ResourceNotFound);
    const shot = await photo(hold.holdId, qPick);
    expect(shot.questionId).toBe(qPick);
    photoId = shot.fileId;
    // one per question
    expect(await refusal(photo(hold.holdId, qPick))).toBe('file_exists');
    const res = await verifyPublicBooking({
      slug: A.slug,
      holdId: hold.holdId,
      code: lastCode(who.email),
    });
    appointmentId = res.appointmentId;
    const [settled] = await adminQuery<{ answers: unknown }>(
      `SELECT answers FROM booking.public_hold WHERE id = $1`,
      [hold.holdId],
    );
    expect(settled!.answers).toBeNull();

    const answers = await getAppointmentAnswers({ sessionToken: A.owner.token, appointmentId });
    expect(answers).toEqual([
      {
        questionId: qPick,
        label: 'Lungimea părului',
        kind: 'choice',
        value: 'Lung',
        hasPhoto: true,
        source: 'client',
      },
      {
        questionId: qColor,
        label: 'Ce culoare doriți?',
        kind: 'short_text',
        value: 'Blond cenușiu',
        hasPhoto: false,
        source: 'client',
      },
      {
        questionId: qNum,
        label: 'Câți ani aveți?',
        kind: 'number',
        value: 41,
        hasPhoto: false,
        source: 'client',
      },
      // optional, left empty: „Fără răspuns”
      {
        questionId: qFirst,
        label: 'Prima vizită?',
        kind: 'yes_no',
        value: null,
        hasPhoto: false,
        source: null,
      },
    ]);
    const link = await getAnswerPhotoLink({
      sessionToken: A.owner.token,
      appointmentId,
      questionId: qPick,
    });
    expect(link.url).toContain('/files/');
    // a photo after the code: the hold is no longer pending
    expect(await refusal(photo(hold.holdId, qPick))).toBe('code_expired');
  });

  it('an edit of the question does not change what the client answered', async () => {
    await updateFormQuestion({
      sessionToken: A.owner.token,
      questionId: qColor,
      label: 'Ce nuanță doriți?',
      kind: 'short_text',
      required: true,
    });
    const answers = await getAppointmentAnswers({ sessionToken: A.owner.token, appointmentId });
    expect(answers.find((a) => a.questionId === qColor)!.label).toBe('Ce culoare doriți?');
  });

  it('the team answers from the Hub only the questions shown in the Hub', async () => {
    expect(
      await refusal(
        saveAppointmentAnswers({
          sessionToken: A.owner.token,
          appointmentId,
          answers: [{ questionId: qColor, value: 'Altă culoare' }],
        }),
      ),
    ).toBe('answers:invalid');
    const res = await saveAppointmentAnswers({
      sessionToken: A.owner.token,
      appointmentId,
      answers: [{ questionId: qFirst, value: 'yes' }],
    });
    expect(res.find((a) => a.questionId === qFirst)).toMatchObject({
      value: 'yes',
      source: 'team',
    });
    // a member without booking:admin: not on someone else's booking
    const member = await person(A.org, 'member', 'Mihai Membru');
    expect(
      await errorOf(
        saveAppointmentAnswers({
          sessionToken: member.token,
          appointmentId,
          answers: [{ questionId: qFirst, value: 'no' }],
        }),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it('T1: another business does not see the answers; the database refuses a cross-business answer', async () => {
    expect(
      await errorOf(getAppointmentAnswers({ sessionToken: B.owner.token, appointmentId })),
    ).toBeInstanceOf(ResourceNotFound);
    await asBookingRw(B.org, async (c) => {
      const { rows } = await c.query(`SELECT 1 FROM booking.appointment_answer`);
      expect(rows).toHaveLength(0);
    });
    // a question of B on a booking of A: the composite FK refuses it (as admin, past RLS)
    const qB = await createFormQuestion({
      sessionToken: B.owner.token,
      label: 'Întrebarea lui B',
      kind: 'yes_no',
    });
    await expect(
      adminQuery(
        `INSERT INTO booking.appointment_answer
           (id, organization_id, appointment_id, question_id, question_label, value, source)
         VALUES ($1, $2, $3, $4, 'X', '"yes"', 'client')`,
        [uuid(), A.org, appointmentId, qB.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('the cleanup job deletes the photos of an expired hold and keeps those on a booking', async () => {
    const { hold } = await start(A.slug, 13, visitor(), {
      answers: [
        { questionId: qPick, value: 'Scurt' },
        { questionId: qColor, value: 'Negru' },
      ],
    });
    const lost = await photo(hold.holdId, qPick);
    await adminQuery(
      `UPDATE booking.public_hold SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [hold.holdId],
    );
    const report = await runPublicHoldCleanupJob();
    expect(report.failed).toEqual([]);
    expect(report.photosDeleted).toBeGreaterThanOrEqual(1);
    expect(await fileStatus(lost.fileId)).toBe('deleted');
    expect(storage.objects.has(`${A.org}/${lost.fileId}`)).toBe(false);
    // the photo moved to the confirmed booking stays
    expect(await fileStatus(photoId)).toBe('ready');
    const left = await adminQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM booking.public_hold
        WHERE organization_id = $1 AND has_photos`,
      [A.org],
    );
    expect(left[0]!.n).toBe(0);
  });

  it('the client card: the last answer to each question, only for booking:admin', async () => {
    const [{ client_id }] = await adminQuery<{ client_id: string }>(
      `SELECT client_id FROM booking.appointment WHERE id = $1`,
      [appointmentId],
    );
    const last = await getClientLastAnswers({ sessionToken: A.owner.token, clientId: client_id });
    expect(last.map((a) => [a.questionId, a.value, a.hasPhoto])).toEqual([
      [qPick, 'Lung', true],
      [qColor, 'Blond cenușiu', false],
      [qFirst, 'yes', false],
      [qNum, 41, false],
    ]);
    expect(last.every((a) => a.appointmentId === appointmentId)).toBe(true);
    const member = await person(A.org, 'member', 'Mia Membru');
    expect(
      await errorOf(getClientLastAnswers({ sessionToken: member.token, clientId: client_id })),
    ).toBeInstanceOf(Forbidden);
    expect(
      await errorOf(getClientLastAnswers({ sessionToken: B.owner.token, clientId: client_id })),
    ).toBeInstanceOf(ResourceNotFound);
  });

  it('no DELETE for booking_rw; the answers are wiped by the GDPR erasure', async () => {
    await asBookingRw(A.org, async (c) => {
      await expect(
        c.query(`DELETE FROM booking.appointment_answer WHERE appointment_id = $1`, [
          appointmentId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await asBookingRw(A.org, async (c) => {
      await expect(
        c.query(`DELETE FROM booking.form_question WHERE id = $1`, [qFirst]),
      ).rejects.toMatchObject({ code: '42501' });
    });
    const [{ client_id }] = await adminQuery<{ client_id: string }>(
      `SELECT client_id FROM booking.appointment WHERE id = $1`,
      [appointmentId],
    );
    const erased = await eraseClient({ sessionToken: A.owner.token, clientId: client_id });
    // S127: the client's photos marked by erase_client and deleted through core/files
    expect(erased.photosPending).toBe(0);
    expect(await fileStatus(photoId)).toBe('deleted');
    const [marked] = await adminQuery<{ deleted: boolean }>(
      `SELECT photo_deleted_at IS NOT NULL AS deleted FROM booking.appointment_answer
        WHERE appointment_id = $1 AND question_id = $2`,
      [appointmentId, qPick],
    );
    expect(marked!.deleted).toBe(true);
    expect(
      await errorOf(
        getAnswerPhotoLink({ sessionToken: A.owner.token, appointmentId, questionId: qPick }),
      ),
    ).toBeInstanceOf(ResourceNotFound);
    expect(
      await getClientLastAnswers({ sessionToken: A.owner.token, clientId: client_id }),
    ).toEqual([]);
    // C.4f: one deletion path, an audit row `system` per photo (category booking, reason client_erased)
    const audit = await adminQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
        WHERE action = 'file.deleted_by_system' AND target_id = $1
          AND metadata->>'reason' = 'client_erased'`,
      [photoId],
    );
    expect(audit[0]!.n).toBe(1);
    // a photo still marked (the storage refused it at the erasure): the cleanup job retries it
    await adminQuery(
      `UPDATE booking.appointment_answer SET photo_deleted_at = NULL
        WHERE appointment_id = $1 AND question_id = $2`,
      [appointmentId, qPick],
    );
    const retry = await runPublicHoldCleanupJob();
    expect(retry.failed).toEqual([]);
    const [again] = await adminQuery<{ deleted: boolean }>(
      `SELECT photo_deleted_at IS NOT NULL AS deleted FROM booking.appointment_answer
        WHERE appointment_id = $1 AND question_id = $2`,
      [appointmentId, qPick],
    );
    expect(again!.deleted).toBe(true);
    const rows = await adminQuery<{ value: unknown; wiped: boolean }>(
      `SELECT value, wiped_at IS NOT NULL AS wiped FROM booking.appointment_answer
        WHERE appointment_id = $1`,
      [appointmentId],
    );
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.value === null && r.wiped)).toBe(true);
    const answers = await getAppointmentAnswers({ sessionToken: A.owner.token, appointmentId });
    expect(answers.every((a) => a.value === null)).toBe(true);
  });
});
