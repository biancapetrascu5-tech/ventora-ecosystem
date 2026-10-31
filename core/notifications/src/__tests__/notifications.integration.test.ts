import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  NotificationCatalog,
  deliverPendingNotifications,
  sendNotification,
  type DeliveryContact,
  type EmailChannel,
  type NotificationTemplate,
  type SendNotificationInput,
} from '../index';

/*
 * Lot 4.3, „Gata când” (FAZA-4): the model and the delivery, on app_runtime (sending and
 * delivery switch to notifications_rw), fixtures as postgres.
 */

const APP_URL = process.env.DATABASE_URL ?? '';
const ADMIN_URL = process.env.DIRECT_URL ?? '';

const PHONE: NotificationTemplate = {
  type: 'messaging.phone_disconnected',
  version: 1,
  category: 'operational',
  group: 'operational',
  titleKey: 'sms.disconnected.title',
  bodyKey: 'sms.disconnected.body',
  channels: ['email'],
  actionPath: () => '/booking/settings/sms',
};
const SECURITY: NotificationTemplate = { ...PHONE, type: 'account.security_test', security: true };
const LIMITED: NotificationTemplate = {
  ...PHONE,
  type: 'messaging.phone_failing',
  titleKey: 'sms.failing.title',
  bodyKey: undefined,
  rateLimit: { max: 2, windowMinutes: 60 },
};
const OFFER: NotificationTemplate = {
  ...PHONE,
  type: 'growth.offer_test',
  category: 'commercial',
  group: 'recommendation',
};
const catalog = new NotificationCatalog([PHONE, SECURITY, LIMITED, OFFER]);
const PARAMS = { n: '6', time: '18:00' };

let admin: pg.Pool;
let app: pg.Pool;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

/** What a consumer does: in the organization's context, as the emitting module would. */
async function send(
  org: string,
  input: Omit<SendNotificationInput, 'organizationId' | 'category'> & {
    category?: 'operational' | 'commercial';
  },
) {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [org]);
    const result = await sendNotification(
      client,
      { category: 'operational', ...input, organizationId: org },
      { catalog },
    );
    const { rows } = await client.query('SELECT current_user::text AS role');
    await client.query('COMMIT');
    return { result, roleAfter: (rows[0] as { role: string }).role };
  } finally {
    client.release();
  }
}

/** A channel that records what it sends, or fails `failTimes` times first. */
function channel(failTimes = 0) {
  const sent: { to: string; subject: string; html: string }[] = [];
  let failures = 0;
  const c: EmailChannel = {
    async send(params) {
      if (failures < failTimes) {
        failures += 1;
        throw new Error(`provider down for ${params.to}`);
      }
      sent.push({ to: params.to, subject: params.subject, html: params.html });
    },
  };
  return { channel: c, sent };
}

const contacts =
  (locales: Record<string, string | null> = {}) =>
  async (_tx: unknown, ids: readonly string[]) =>
    new Map<string, DeliveryContact>(
      ids.map((id) => [
        id,
        { email: `${id.slice(0, 8)}@example.com`, name: 'Ana', locale: locales[id] ?? null },
      ]),
    );

const deliver = (c: EmailChannel, locales?: Record<string, string | null>) =>
  deliverPendingNotifications({
    pool: app,
    contacts: contacts(locales),
    channels: { email: c },
    catalog,
  });

const makeDue = () =>
  q(`UPDATE notifications.delivery SET next_attempt_at = now() WHERE status = 'pending'`);

const run = APP_URL && ADMIN_URL ? describe : describe.skip;

run('Lot 4.3 — notifications: the model and the delivery', () => {
  beforeAll(() => {
    admin = new pg.Pool({ connectionString: ADMIN_URL, max: 2 });
    app = new pg.Pool({ connectionString: APP_URL, max: 3 });
  });
  beforeEach(async () => {
    // other tests may have left pending deliveries; this suite only looks at its own rows
    await q(`UPDATE notifications.delivery SET status = 'cancelled' WHERE status = 'pending'`);
  });
  afterAll(async () => {
    await admin?.end();
    await app?.end();
  });

  it('the same notification twice with the same key → one per recipient; the role is restored', async () => {
    const org = crypto.randomUUID();
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    const first = await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [a, b],
      idempotencyKey: 'evt-1',
      params: PARAMS,
    });
    const second = await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [a, b],
      idempotencyKey: 'evt-1',
      params: PARAMS,
    });
    expect(first.result.created.sort()).toEqual([a, b].sort());
    expect(second.result.duplicates.sort()).toEqual([a, b].sort());
    expect(second.roleAfter).toBe('app_runtime');
    const rows = await q(
      `SELECT recipient_user_id::text, category, display_group FROM notifications.notification WHERE organization_id = $1`,
      [org],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: 'operational', display_group: 'operational' });
    expect(
      await q(`SELECT 1 FROM notifications.delivery WHERE organization_id = $1`, [org]),
    ).toHaveLength(2);
  });

  it('the limit per type: at most 2 an hour per recipient', async () => {
    const org = crypto.randomUUID();
    const r = crypto.randomUUID();
    const results = [];
    for (const key of ['k1', 'k2', 'k3']) {
      results.push(
        (
          await send(org, {
            type: LIMITED.type,
            version: 1,
            recipientUserIds: [r],
            idempotencyKey: key,
            params: { n: '3', phone: 'A' },
          })
        ).result,
      );
    }
    expect(results.map((x) => x.created.length)).toEqual([1, 1, 0]);
    expect(results[2]!.rateLimited).toEqual([r]);
  });

  it('preferences (D4-6): email off per category; security ignores it; commercial in-app toggle, commercial email never', async () => {
    const org = crypto.randomUUID();
    const [off, on] = [crypto.randomUUID(), crypto.randomUUID()];
    await q(
      `INSERT INTO notifications.notification_preference (user_id, category, channel, enabled)
       VALUES ($1, 'operational', 'email', false), ($1, 'commercial', 'in_app', false)`,
      [off],
    );
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [off, on],
      idempotencyKey: 'p1',
      params: PARAMS,
    });
    await send(org, {
      type: SECURITY.type,
      version: 1,
      recipientUserIds: [off],
      idempotencyKey: 'p2',
      params: PARAMS,
    });
    const offer = await send(org, {
      category: 'commercial',
      type: OFFER.type,
      version: 1,
      recipientUserIds: [off, on],
      idempotencyKey: 'p3',
      params: PARAMS,
    });
    expect(offer.result.skipped).toEqual([off]);
    const deliveries = await q(
      `SELECT d.recipient_user_id::text AS who, n.type FROM notifications.delivery d
         JOIN notifications.notification n ON n.id = d.notification_id
        WHERE d.organization_id = $1 ORDER BY n.type, who`,
      [org],
    );
    expect(deliveries).toEqual(
      [
        { who: on, type: PHONE.type },
        { who: off, type: SECURITY.type },
      ].sort((x, y) => (x.type + x.who).localeCompare(y.type + y.who)),
    );
  });

  it('the email leaves once, in the recipient language; a second run sends nothing', async () => {
    const org = crypto.randomUUID();
    const [ro, de] = [crypto.randomUUID(), crypto.randomUUID()];
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [ro, de],
      idempotencyKey: 'd1',
      params: PARAMS,
    });
    const ok = channel();
    const report = await deliver(ok.channel, { [de]: 'de' });
    expect(report.sent).toBe(2);
    const subjects = Object.fromEntries(ok.sent.map((m) => [m.to.slice(0, 8), m.subject]));
    expect(subjects[ro.slice(0, 8)]).toBe('Telefonul afacerii e deconectat');
    expect(subjects[de.slice(0, 8)]).not.toBe('Telefonul afacerii e deconectat');
    expect((await deliver(ok.channel)).sent).toBe(0);
    expect(ok.sent).toHaveLength(2);
  });

  it('a provider failure is retried, then marked failed, without a duplicate', async () => {
    const org = crypto.randomUUID();
    const r = crypto.randomUUID();
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [r],
      idempotencyKey: 'f1',
      params: PARAMS,
    });
    const down = channel(10);
    expect((await deliver(down.channel)).retried).toBe(1);
    let [row] = await q(
      `SELECT status, attempts, last_error, next_attempt_at > now() AS later FROM notifications.delivery WHERE organization_id = $1`,
      [org],
    );
    expect(row).toMatchObject({ status: 'pending', attempts: 1, later: true });
    expect(row!.last_error).toContain('[email]'); // the address is not kept in the reason
    await makeDue();
    expect((await deliver(down.channel)).retried).toBe(1);
    await makeDue();
    expect((await deliver(down.channel)).failed).toBe(1);
    [row] = await q(
      `SELECT status, attempts FROM notifications.delivery WHERE organization_id = $1`,
      [org],
    );
    expect(row).toMatchObject({ status: 'failed', attempts: 3 });
    await makeDue();
    const ok = channel();
    await deliver(ok.channel);
    expect(ok.sent).toHaveLength(0);
  });

  it('a delivery that recovers after a failure is sent exactly once', async () => {
    const org = crypto.randomUUID();
    const r = crypto.randomUUID();
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [r],
      idempotencyKey: 'f2',
      params: PARAMS,
    });
    const flaky = channel(1);
    await deliver(flaky.channel);
    await makeDue();
    expect((await deliver(flaky.channel)).sent).toBe(1);
    await makeDue();
    await deliver(flaky.channel);
    expect(flaky.sent).toHaveLength(1);
  });

  it('two delivery runs at once send each email once (FOR UPDATE SKIP LOCKED)', async () => {
    const org = crypto.randomUUID();
    const rs = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: rs,
      idempotencyKey: 'c1',
      params: PARAMS,
    });
    const shared = channel();
    await Promise.all([deliver(shared.channel), deliver(shared.channel)]);
    expect(shared.sent).toHaveLength(3);
    expect(new Set(shared.sent.map((m) => m.to)).size).toBe(3);
  });

  it('past valid_until a delivery is cancelled, not sent; a channel without adapter fails at once', async () => {
    const org = crypto.randomUUID();
    const [late, sms] = [crypto.randomUUID(), crypto.randomUUID()];
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [late],
      idempotencyKey: 'v1',
      params: PARAMS,
      validUntil: new Date(Date.now() - 1000),
    });
    const ok = channel();
    expect((await deliver(ok.channel)).cancelled).toBe(1);
    expect(ok.sent).toHaveLength(0);
    // an SMS delivery (D4-26: no adapter yet), on a notification that is still valid
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [sms],
      idempotencyKey: 'v2',
      params: PARAMS,
    });
    await q(`UPDATE notifications.delivery SET status = 'cancelled' WHERE recipient_user_id = $1`, [
      sms,
    ]);
    const [n] = await q(
      `SELECT id FROM notifications.notification WHERE organization_id = $1 AND recipient_user_id = $2`,
      [org, sms],
    );
    await q(
      `INSERT INTO notifications.delivery (id, notification_id, organization_id, recipient_user_id, channel)
       VALUES ($1, $2, $3, $4, 'sms')`,
      [crypto.randomUUID(), n!.id, org, sms],
    );
    const report = await deliver(ok.channel);
    expect(report.failed).toBe(1);
    expect(
      await q(
        `SELECT status, last_error FROM notifications.delivery WHERE channel = 'sms' AND organization_id = $1`,
        [org],
      ),
    ).toEqual([{ status: 'failed', last_error: 'not_configured' }]);
  });

  it('RLS: a person reads only their own notifications; another organization writes nothing here', async () => {
    const org = crypto.randomUUID();
    const [mine, other] = [crypto.randomUUID(), crypto.randomUUID()];
    await send(org, {
      type: PHONE.type,
      version: 1,
      recipientUserIds: [mine, other],
      idempotencyKey: 'r1',
      params: PARAMS,
    });
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE notifications_rw');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [mine]);
      const { rows } = await client.query(
        `SELECT recipient_user_id::text AS who FROM notifications.notification WHERE organization_id = $1`,
        [org],
      );
      expect(rows).toEqual([{ who: mine }]);
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [
        crypto.randomUUID(),
      ]);
      await expect(
        client.query(
          `INSERT INTO notifications.notification (id, organization_id, recipient_user_id, category, display_group, type, version, dedup_key)
           VALUES ($1, $2, $3, 'operational', 'activity', 'x.y', 1, 'k')`,
          [crypto.randomUUID(), org, mine],
        ),
      ).rejects.toThrow(/row-level security/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
