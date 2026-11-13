import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import {
  closeFounderNotificationsPool,
  listFounderNotifications,
  markAllFounderNotificationsRead,
  markFounderNotificationRead,
  sendFounderNotification,
} from '@ventora/notifications';
import {
  closeGrowthPools,
  runGrowthAutoStopJob,
  syncPlacements,
  withFounderTx,
  type AutoStopped,
} from '../index';

// FounderNotifications (S136, P22; D4-29 a, D5-11 a): the Founder bell.
// - the new role notifications_founder, as approved on 13.11.2026: NOLOGIN, NOINHERIT, a member of
//   founder_runtime, no PUBLIC rights, no UPDATE / DELETE; notifications_rw ONLY INSERT on the
//   Ventora inbox (no SELECT); RLS on both tables, the read rows only for the current founder;
// - the automatic stop lands in the bell once per run, with what the Drawer needs;
// - read / unread per person; „Marchează toate ca citite”;
// - „Anunță-mă dacă se oprește din nou” off → no bell, no e-mail.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const RUN = newUuid().slice(0, 8);
const APP = `f${RUN}`;
const SLOT = `${APP}.today.aside`;
const FOUNDER = newUuid();
const BIANCA = `fa${RUN}`;
const ANA = `fb${RUN}`;
const ORG = newUuid();
let offerId: string;

async function campaign(name: string): Promise<string> {
  const id = newUuid();
  await q(
    `INSERT INTO growth.campaign (id, name, offer_id, mode, starts_at, ends_at, rule,
       created_by_founder_id)
     VALUES ($1, $2, $3, 'scheduled', now() - interval '1 day', now() + interval '30 days', $4, $5)`,
    [
      id,
      name,
      offerId,
      JSON.stringify({
        match: 'all',
        rules: [{ criterion: 'user.role', operator: 'is', value: 'owner' }],
      }),
      FOUNDER,
    ],
  );
  await q(`INSERT INTO growth.campaign_slot (campaign_id, slot_id) VALUES ($1, $2)`, [id, SLOT]);
  await q(`UPDATE growth.campaign SET status = 'active' WHERE id = $1`, [id]);
  return id;
}

async function seen(campaignId: string, n: number, dismissed: number): Promise<void> {
  await q(
    `INSERT INTO growth.impression (id, organization_id, user_id, campaign_id, offer_id, slot_id,
       locale, proactive, audience_role)
     SELECT gen_random_uuid(), $1, gen_random_uuid(), $2, $3, $4, 'ro', true, 'buyer'
       FROM generate_series(1, $5)`,
    [ORG, campaignId, offerId, SLOT, n],
  );
  await q(
    `INSERT INTO growth.interaction (id, organization_id, user_id, impression_id, kind, idempotency_key)
     SELECT gen_random_uuid(), i.organization_id, i.user_id, i.id, 'dismiss', 'd-' || i.id
       FROM growth.impression i
      WHERE i.campaign_id = $1
        AND NOT EXISTS (SELECT 1 FROM growth.interaction x WHERE x.impression_id = i.id)
      LIMIT $2`,
    [campaignId, dismissed],
  );
}

const bellRows = (campaignId: string) =>
  q(
    `SELECT id, type, params, action_url FROM notifications.founder_notification
      WHERE params->>'campaignId' = $1 ORDER BY created_at`,
    [campaignId],
  );

beforeAll(async () => {
  admin = await adminPool.connect();
  await syncPlacements(admin, [
    { applicationId: APP, placements: [{ id: SLOT, kind: 'card', critical: false }] },
  ]);
  offerId = newUuid();
  await q(
    `INSERT INTO growth.offer (id, code, type, application_id, created_by_founder_id)
     VALUES ($1, $2, 'app_activation', 'marketing', $3)`,
    [offerId, `fn-${RUN}`, FOUNDER],
  );
  await q(
    `INSERT INTO growth.offer_text (offer_id, locale, title, body, status, approved_by_founder_id,
       updated_by_founder_id) VALUES ($1, 'ro', 'CampaignKit pentru saloane', 'x', 'approved', $2, $2)`,
    [offerId, FOUNDER],
  );
  await q(`UPDATE growth.offer SET status = 'published' WHERE id = $1`, [offerId]);
});

afterAll(async () => {
  admin?.release();
  await adminPool.end();
  await appPool.end();
  await closeGrowthPools();
  await closeFounderNotificationsPool();
});

describe('FounderNotifications — the role and the rights (approved on 13.11.2026)', () => {
  it('notifications_founder: NOLOGIN, NOINHERIT, a member of founder_runtime, not of app_runtime', async () => {
    const [role] = await q(
      `SELECT rolcanlogin, rolinherit, rolsuper, rolbypassrls FROM pg_roles
        WHERE rolname = 'notifications_founder'`,
    );
    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolsuper: false,
      rolbypassrls: false,
    });
    const members = await q(
      `SELECT m.rolname FROM pg_auth_members a
         JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
        WHERE r.rolname = 'notifications_founder' ORDER BY 1`,
    );
    expect(members.map((m) => m.rolname)).toEqual(['founder_runtime']);
  });

  it('the exact table rights: no PUBLIC, no UPDATE / DELETE; notifications_rw only INSERT', async () => {
    const rights = await q(
      `SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS p
         FROM information_schema.role_table_grants
        WHERE table_schema = 'notifications'
          AND table_name IN ('founder_notification', 'founder_notification_read')
          AND grantee <> 'postgres'
        GROUP BY table_name, grantee ORDER BY table_name, grantee`,
    );
    expect(rights).toEqual([
      { table_name: 'founder_notification', grantee: 'notifications_founder', p: 'SELECT' },
      { table_name: 'founder_notification', grantee: 'notifications_rw', p: 'INSERT' },
      {
        table_name: 'founder_notification_read',
        grantee: 'notifications_founder',
        p: 'INSERT,SELECT',
      },
    ]);
    const rls = await q(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relnamespace = 'notifications'::regnamespace
          AND relname IN ('founder_notification', 'founder_notification_read') ORDER BY 1`,
    );
    expect(rls.every((r) => r.relrowsecurity === true)).toBe(true);
    expect(rls).toHaveLength(2);
  });

  it('a business (app_runtime → notifications_rw) cannot read the Ventora inbox', async () => {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE notifications_rw');
      await expect(c.query(`SELECT 1 FROM notifications.founder_notification`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});

describe('FounderNotifications — sending', () => {
  it('the same key twice → one row; the calling transaction goes on, with its role back', async () => {
    const c = await appPool.connect();
    const key = `dup-${RUN}`;
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE growth_rw');
      const send = () =>
        sendFounderNotification(c, {
          type: 'founder.setup.request_new',
          params: { organizationId: ORG, applicationId: 'events', setupRequestId: key },
          idempotencyKey: key,
          actionPath: '/requests',
        });
      expect(await send()).toEqual({ created: true });
      expect(await send()).toEqual({ created: false });
      const { rows } = await c.query(`SELECT current_user::text AS role`);
      expect(rows[0].role).toBe('growth_rw');
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    const rows = await q(
      `SELECT params, action_url FROM notifications.founder_notification
        WHERE dedup_key = $1`,
      [`founder.setup.request_new:${key}`],
    );
    expect(rows).toEqual([
      {
        params: { organizationId: ORG, applicationId: 'events', setupRequestId: key },
        action_url: '/requests',
      },
    ]);
  });
});

describe('FounderNotifications — the automatic stop in the bell', () => {
  it('stops once → one notification with what the Drawer needs; unread per person; „Marchează toate”', async () => {
    const id = await campaign('Marketing pentru saloane');
    await seen(id, 100, 7);
    const alerts: AutoStopped[] = [];
    const r0 = await runGrowthAutoStopJob(async (s) => {
      alerts.push(s);
    });
    expect(r0.errors).toEqual([]);
    expect(alerts.filter((a) => a.campaignId === id)).toHaveLength(1);
    // the job runs again: nothing new (already stopped; the key is per run)
    await runGrowthAutoStopJob(async () => undefined);
    const rows = await bellRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'founder.growth.auto_stopped',
      action_url: null,
      params: {
        campaign: 'Marketing pentru saloane',
        campaignId: id,
        offer: 'CampaignKit pentru saloane',
        reason: 'disturbance',
        rate: 0.07,
        impressions: 100,
        threshold: 0.05,
        businesses: 1,
      },
    });
    const nid = rows[0]!.id as string;

    const mine = async (founderId: string, unreadOnly = false) =>
      (await listFounderNotifications({ founderId, unreadOnly })).items.find((i) => i.id === nid);
    expect(await mine(BIANCA)).toMatchObject({ kind: 'auto', read: false });
    await markFounderNotificationRead({ founderId: BIANCA, notificationId: nid });
    await markFounderNotificationRead({ founderId: BIANCA, notificationId: nid });
    expect(await mine(BIANCA)).toMatchObject({ read: true });
    expect(await mine(BIANCA, true)).toBeUndefined();
    // Ana has not read it
    expect(await mine(ANA, true)).toMatchObject({ read: false });
    const before = (await listFounderNotifications({ founderId: ANA })).unread;
    expect(before).toBeGreaterThan(0);
    await markAllFounderNotificationsRead({ founderId: ANA });
    expect((await listFounderNotifications({ founderId: ANA })).unread).toBe(0);
    expect(
      (await listFounderNotifications({ founderId: ANA, kind: 'support' })).items.some(
        (i) => i.id === nid,
      ),
    ).toBe(false);
  });

  it('the read rows: a founder sees and writes only his own (RLS on app.founder_id)', async () => {
    const [n] = await q(
      `SELECT id FROM notifications.founder_notification ORDER BY created_at DESC LIMIT 1`,
    );
    const founder = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER, max: 1 });
    const c = await founder.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE notifications_founder');
      await c.query(`SELECT set_config('app.founder_id', $1, true)`, [ANA]);
      const visible = await c.query(
        `SELECT DISTINCT founder_id FROM notifications.founder_notification_read`,
      );
      expect(visible.rows.map((r) => r.founder_id)).toEqual([ANA]);
      await expect(
        c.query(
          `INSERT INTO notifications.founder_notification_read (founder_id, notification_id)
           VALUES ($1, $2)`,
          [`other${RUN}`, n!.id],
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await c.query('ROLLBACK');
      c.release();
      await founder.end();
    }
  });

  it('„Anunță-mă dacă se oprește din nou” off → the next stop is audited, without bell or e-mail', async () => {
    const id = await campaign('Fără anunț');
    // growth_founder may change only this column (and the ones of 5.10)
    await withFounderTx(null, async (c) => {
      await c.query(`UPDATE growth.campaign SET notify_on_auto_stop = false WHERE id = $1`, [id]);
    });
    await seen(id, 100, 9);
    const alerts: AutoStopped[] = [];
    const report = await runGrowthAutoStopJob(async (s) => {
      alerts.push(s);
    });
    expect(report.stopped.find((s) => s.campaignId === id)).toMatchObject({ notify: false });
    expect(alerts.filter((a) => a.campaignId === id)).toEqual([]);
    expect(await bellRows(id)).toEqual([]);
    const audit = await q(
      `SELECT 1 FROM audit.audit_log WHERE target_id = $1 AND action = 'growth.campaign_auto_stopped'`,
      [id],
    );
    expect(audit).toHaveLength(1);
  });
});
