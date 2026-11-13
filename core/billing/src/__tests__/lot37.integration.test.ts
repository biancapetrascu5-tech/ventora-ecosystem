import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { closeAuditPools } from '@ventora/audit';
import {
  closeCommercialPools,
  getActivePacks,
  listMyTeamRecommendations,
  listPendingTeamRecommendations,
  notifyOwner,
  ownerNotifiedConsumer,
  rejectTeamRecommendation,
  teamRecommendationActivatedConsumer,
  TeamRecommendationTooSoon,
} from '@ventora/commercial';
import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  closeBillingPools,
  handleStripeWebhook,
  listPayments,
  previewPurchase,
  purchase,
  setStripeGatewayForTests,
  signStripePayload,
  startCardSetup,
} from '../index';
import { eventFor, FakeStripe } from './fake-stripe';

// Lot 3.7 — the reads the Hub screens add, on the runtime roles (app_runtime → billing_rw /
// commercial_rw; org_rw, identity_rw and notifications_rw for the owner's notification), with a
// fake Stripe: the payments under „Facturi” (the invoice itself: Lot 3.6), the active packs in
// „Ce plătești”, the preview without a saved card (HubAppActivation), and „Recomandă” /
// „Anunță proprietarul” (only an admin or a member; the owner gets one notification a day per
// person and thing). Plus the isolation between businesses (T1/T2).

const SECRET = 'whsec_test_lot37_billing'; // gitleaks:allow
const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let admin: PoolClient;
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const newUuid = () => crypto.randomUUID();
const founderId = newUuid();
const fake = new FakeStripe();
const RUN = newUuid().slice(0, 6);
let versionId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function send(type: string, object: Record<string, unknown>) {
  const body = eventFor(type, object);
  return handleStripeWebhook(body, signStripePayload(body, SECRET));
}

async function user(name: string): Promise<string> {
  const id = newUuid();
  await q(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, false, now(), now())`,
    [id, name, `l37-${id}@test.local`],
  );
  return id;
}

/** A business in RON on the bundle, with its owner, an admin and a member. */
async function business() {
  const organizationId = newUuid();
  const ownerId = await user('Bianca Petrașcu');
  const adminId = await user('Ioana Pavel');
  const memberId = await user('Mara Enache');
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1, $2, 'Salon Aurora', 'founder', now())`,
    [organizationId, `l37-${organizationId.slice(0, 12)}`],
  );
  for (const [userId, role] of [
    [ownerId, 'owner'],
    [adminId, 'admin'],
    [memberId, 'member'],
  ] as const) {
    await q(
      `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'active', now())`,
      [organizationId, userId, role],
    );
  }
  await q(
    `INSERT INTO commercial.billing_account (organization_id, currency, set_by_founder_id)
     VALUES ($1, 'RON', $2)`,
    [organizationId, founderId],
  );
  const started = daysAgo(5);
  await q(
    `INSERT INTO commercial.subscription
       (organization_id, plan_version_id, interval, currency, started_on, anchor_day, status,
        created_by_founder_id)
     VALUES ($1, $2, 'month', 'RON', $3::date, EXTRACT(DAY FROM $3::date), 'active', $4)`,
    [organizationId, versionId, started, founderId],
  );
  const actor = (userId: string, role: string) => ({
    organizationId,
    userId,
    role,
    actor: 'user' as const,
  });
  return {
    organizationId,
    ownerId,
    adminId,
    memberId,
    ctx: { organizationId, userId: ownerId, actor: 'user' as const },
    owner: actor(ownerId, 'owner'),
    admin: actor(adminId, 'admin'),
    member: actor(memberId, 'member'),
  };
}

type Biz = Awaited<ReturnType<typeof business>>;

async function smsPack(name = '500 SMS în plus') {
  const [a] = await q(
    `INSERT INTO commercial.addon (code, name, quota_key, quantity, validity, purchase_mode, created_by_founder_id)
     VALUES ($1, $2, 'messaging.sms', 500, 'current_month', 'direct', $3) RETURNING id`,
    [`l37-${newUuid().slice(0, 8)}`, name, founderId],
  );
  await q(
    `INSERT INTO commercial.addon_price (addon_id, currency, amount_minor, setup_minor)
     VALUES ($1, 'RON', 4900, 0)`,
    [a!.id],
  );
  return a!.id as string;
}

async function saveCard(
  b: Biz,
  pm: 'pm_card_visa' | 'pm_card_chargeCustomerFail' = 'pm_card_visa',
) {
  const { setupIntentId } = await startCardSetup(b.ctx);
  const si = fake.confirmSetup(setupIntentId, pm);
  return send('setup_intent.succeeded', {
    id: si.id,
    object: 'setup_intent',
    status: 'succeeded',
    customer: si.customerId,
    payment_method: pm,
    metadata: si.metadata,
  });
}

/** Every pending `commercial.owner.notified` of the business, delivered; other events wait. */
async function dispatchCommercial(organizationId: string) {
  // The full local run shares one database: other suites leave pending commercial events, and the
  // dispatcher reads at most 100 per call (outbox_pending), so this business's could wait behind
  // them. The test sets the other businesses' pending events aside first (as the Growth tests do);
  // the dispatcher and the job are unchanged.
  await q(
    `UPDATE commercial.outbox_events SET status = 'dispatched', dispatched_at = now()
      WHERE status = 'pending' AND organization_id <> $1`,
    [organizationId],
  );
  await dispatchOutbox({
    pool: appPool,
    source: { schema: 'commercial', moduleRole: 'commercial_rw' },
    registry: new ConsumerRegistry().register(ownerNotifiedConsumer),
    limit: 1000,
  });
  // none of the business's events left behind: a consumer error would show here
  const left = await q(
    `SELECT status, last_error FROM commercial.outbox_events
      WHERE organization_id = $1 AND type = 'commercial.owner.notified' AND status <> 'dispatched'`,
    [organizationId],
  );
  expect(left).toEqual([]);
}

beforeAll(async () => {
  admin = await adminPool.connect();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  setStripeGatewayForTests(fake);
  const [p] = await q(
    `INSERT INTO commercial.plan (code, name, created_by_founder_id) VALUES ($1, 'Business', $2) RETURNING id`,
    [`l37-${RUN}`, founderId],
  );
  const [v] = await q(
    `INSERT INTO commercial.plan_version (plan_id, version_number, created_by_founder_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [p!.id, founderId],
  );
  versionId = v!.id;
  await q(
    `INSERT INTO commercial.plan_version_price (plan_version_id, currency, kind, amount_minor)
     VALUES ($1, 'RON', 'month', 30000)`,
    [versionId],
  );
  await q(`INSERT INTO commercial.plan_version_application VALUES ($1, 'booking')`, [versionId]);
  await q(
    `INSERT INTO commercial.plan_version_quota (plan_version_id, quota_key, limit_value)
     VALUES ($1, 'platform.members', 10), ($1, 'messaging.sms', 1000)`,
    [versionId],
  );
  await q(
    `UPDATE commercial.plan_version SET published_at = now(), published_by_founder_id = $2 WHERE id = $1`,
    [versionId, founderId],
  );
  await q(`UPDATE commercial.application SET activation_mode = 'direct' WHERE id = 'crm'`);
  await q(
    `INSERT INTO commercial.application_price (application_id, currency, kind, amount_minor)
     VALUES ('crm', 'RON', 'month', 6900), ('crm', 'RON', 'setup', 30000)
     ON CONFLICT (application_id, currency, kind) DO UPDATE SET amount_minor = EXCLUDED.amount_minor`,
  );
});

afterAll(async () => {
  setStripeGatewayForTests(null);
  admin.release();
  await adminPool.end();
  await appPool.end();
  await closeBillingPools();
  await closeCommercialPools();
  await closeAuditPools();
});

describe('Lot 3.7 — „Facturi”: the payments of the business (the invoice: Lot 3.6)', () => {
  it('a pack paid → one row, newest first, with „Factura se emite” (invoice null); a refused one is not listed', async () => {
    const b = await business();
    expect(await listPayments(b.ctx)).toEqual([]);
    await saveCard(b);
    const addonId = await smsPack();
    const paid = await purchase(b.ctx, { kind: 'addon', addonId, packs: 2 });
    expect(paid.status).toBe('succeeded');

    const rows = await listPayments(b.ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'purchase',
      item: { kind: 'addon', name: '500 SMS în plus', packs: 2 },
      amountMinor: 9800,
      currency: 'RON',
      invoice: null,
    });
    expect(Date.parse(rows[0]!.paidAt)).not.toBeNaN();

    // a card the bank refuses: the payment is recorded as failed, not listed
    const c = await business();
    await saveCard(c, 'pm_card_chargeCustomerFail');
    const refused = await purchase(c.ctx, { kind: 'addon', addonId });
    expect(refused.status).toBe('failed');
    expect(await listPayments(c.ctx)).toEqual([]);
  });

  it('T1/T2: a business sees only its own payments and packs', async () => {
    const a = await business();
    const b = await business();
    await saveCard(a);
    const addonId = await smsPack();
    await purchase(a.ctx, { kind: 'addon', addonId });
    expect(await listPayments(a.ctx)).toHaveLength(1);
    expect(await listPayments(b.ctx)).toEqual([]);
    expect((await getActivePacks(a.organizationId)).map((p) => p.addonId)).toContain(addonId);
    expect(await getActivePacks(b.organizationId)).toEqual([]);
    await expect(listPayments({ organizationId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});

describe('Lot 3.7 — „Ce plătești”: the active packs', () => {
  it('a pack bought this period: its units (quantity × packs), not recurring, until the period end', async () => {
    const b = await business();
    await saveCard(b);
    const addonId = await smsPack('500 SMS');
    await purchase(b.ctx, { kind: 'addon', addonId, packs: 3 });
    const [pack] = (await getActivePacks(b.organizationId)).filter((p) => p.addonId === addonId);
    expect(pack).toMatchObject({
      name: '500 SMS',
      quotaKey: 'messaging.sms',
      units: 1500,
      packs: 3,
      recurring: false,
      amountMinor: 14700,
    });
    expect(pack!.endsAt).not.toBeNull();
  });
});

describe('Lot 3.7 — HubAppActivation: the price before the card is saved', () => {
  it('an application on „Direct” without a card: the preview has the amount and no card; the purchase needs the card saved first', async () => {
    const b = await business();
    await expect(
      previewPurchase(b.ctx, { kind: 'application', applicationId: 'crm' }),
    ).rejects.toMatchObject({ field: 'card' });
    const noCard = await previewPurchase(
      b.ctx,
      { kind: 'application', applicationId: 'crm' },
      { withoutCard: true },
    );
    expect(noCard.card).toBeNull();
    expect(noCard.quote.setupMinor).toBe(30000);
    expect(noCard.recurringMinor).toBe(6900);
    expect(noCard.amountDueMinor).toBeGreaterThan(30000);
    await expect(
      purchase(b.ctx, { kind: 'application', applicationId: 'crm' }),
    ).rejects.toMatchObject({ field: 'card' });

    // the dialog saves the card (Stripe Elements), then pays the same amount with it
    await saveCard(b);
    const withCard = await previewPurchase(b.ctx, { kind: 'application', applicationId: 'crm' });
    expect(withCard.amountDueMinor).toBe(noCard.amountDueMinor);
    expect((await purchase(b.ctx, { kind: 'application', applicationId: 'crm' })).status).toBe(
      'succeeded',
    );
  });

  it('„La cerere” and manual payment stay refused, with or without a card', async () => {
    const b = await business();
    await q(`UPDATE commercial.application SET activation_mode = 'on_request' WHERE id = 'crm'`);
    try {
      await expect(
        previewPurchase(
          b.ctx,
          { kind: 'application', applicationId: 'crm' },
          { withoutCard: true },
        ),
      ).rejects.toMatchObject({ reason: 'on_request' });
    } finally {
      await q(`UPDATE commercial.application SET activation_mode = 'direct' WHERE id = 'crm'`);
    }
  });
});

describe('Lot 3.7 — „Recomandă” / „Anunță proprietarul” (D3-8: only the owner buys)', () => {
  it('the owner is refused (they buy or ask); an admin and a member reach the owner, once a day per thing', async () => {
    const b = await business();
    await expect(
      notifyOwner(b.owner, { targetType: 'quota', targetId: 'messaging.sms' }),
    ).rejects.toBeInstanceOf(Forbidden);

    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    await notifyOwner(b.admin, { targetType: 'quota', targetId: 'messaging.sms' });
    const addonId = await smsPack('1.000 SMS în plus');
    await notifyOwner(b.admin, { targetType: 'addon', targetId: addonId });
    await dispatchCommercial(b.organizationId);

    const rows = await q(
      `SELECT type, recipient_user_id::text AS recipient, params, display_group
         FROM notifications.notification WHERE organization_id = $1 ORDER BY created_at, type`,
      [b.organizationId],
    );
    // the member asked twice for the same application the same day: one notification
    expect(rows.map((r) => r.type).sort()).toEqual([
      'owner_notice.addon',
      'owner_notice.application',
      'owner_notice.quota',
    ]);
    expect(rows.every((r) => r.recipient === b.ownerId)).toBe(true);
    expect(rows.every((r) => r.display_group === 'activity')).toBe(true);
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.params]));
    expect(byType['owner_notice.application']).toMatchObject({
      name: 'Mara Enache',
      app: 'ClientDesk',
      appId: 'crm',
    });
    expect(byType['owner_notice.quota']).toMatchObject({
      name: 'Ioana Pavel',
      resource: { type: 'key', key: 'quota.messaging_sms.resource' },
    });
    expect(byType['owner_notice.addon']).toMatchObject({
      name: 'Ioana Pavel',
      pack: '1.000 SMS în plus',
    });
  });

  it('the target is checked on the server: an application already active, an unknown one, a limit the business does not have', async () => {
    const b = await business();
    await expect(
      notifyOwner(b.member, { targetType: 'application', targetId: 'booking' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      notifyOwner(b.member, { targetType: 'application', targetId: 'nu-exista' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      notifyOwner(b.member, { targetType: 'quota', targetId: 'marketing.campaigns' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      notifyOwner(
        { ...b.member, actor: 'support' },
        { targetType: 'application', targetId: 'crm' },
      ),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it('T1/T2: a member of A names A in the event; the notification reaches only A’s owner', async () => {
    const a = await business();
    const b = await business();
    await notifyOwner(a.member, { targetType: 'application', targetId: 'crm' });
    await dispatchCommercial(a.organizationId);
    expect(
      await q(`SELECT 1 FROM notifications.notification WHERE organization_id = $1`, [
        b.organizationId,
      ]),
    ).toEqual([]);
    const [row] = await q(
      `SELECT recipient_user_id::text AS r FROM notifications.notification
        WHERE organization_id = $1 AND type = 'owner_notice.application'`,
      [a.organizationId],
    );
    expect(row!.r).toBe(a.ownerId);
    // commercial_rw in B's context cannot write an event for A (RLS on the outbox)
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE commercial_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [b.organizationId]);
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM commercial.outbox_events WHERE organization_id = $1`,
        [a.organizationId],
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('Lot 5.9e — „Recomandările mele” / „Recomandare de la echipă” (S136)', () => {
  /** Every pending commercial event of the business, delivered with both consumers. */
  async function dispatchAll(organizationId: string) {
    await q(
      `UPDATE commercial.outbox_events SET status = 'dispatched', dispatched_at = now()
        WHERE status = 'pending' AND organization_id <> $1`,
      [organizationId],
    );
    await dispatchOutbox({
      pool: appPool,
      source: { schema: 'commercial', moduleRole: 'commercial_rw' },
      registry: new ConsumerRegistry()
        .register(ownerNotifiedConsumer)
        .register(teamRecommendationActivatedConsumer),
      limit: 1000,
    });
    const left = await q(
      `SELECT type, status, last_error FROM commercial.outbox_events
        WHERE organization_id = $1 AND status <> 'dispatched'`,
      [organizationId],
    );
    expect(left).toEqual([]);
  }

  it('the recommendation stays with its state: pending (once per person and app), the note optional and at most 300 characters', async () => {
    const b = await business();
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    await notifyOwner(b.member, {
      targetType: 'application',
      targetId: 'crm',
      note: 'încă o dată',
    });
    const mine = await listMyTeamRecommendations(b.member);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      applicationId: 'crm',
      applicationName: 'ClientDesk',
      status: 'pending',
      note: null,
      answer: null,
      decidedAt: null,
    });
    // the owner and the admins see it in the bell; a member does not
    expect((await listPendingTeamRecommendations(b.owner)).map((r) => r.id)).toEqual([mine[0]!.id]);
    expect((await listPendingTeamRecommendations(b.admin)).map((r) => r.id)).toEqual([mine[0]!.id]);
    await expect(listPendingTeamRecommendations(b.member)).rejects.toBeInstanceOf(Forbidden);
    // only the person's own list
    expect(await listMyTeamRecommendations(b.admin)).toEqual([]);

    const c = await business();
    await notifyOwner(c.admin, {
      targetType: 'application',
      targetId: 'crm',
      note: '  Ne-ar ajuta.  ',
    });
    expect((await listMyTeamRecommendations(c.admin))[0]).toMatchObject({
      note: 'Ne-ar ajuta.',
      recommendedByRole: 'admin',
    });
    await expect(
      notifyOwner(c.member, { targetType: 'application', targetId: 'crm', note: 'x'.repeat(301) }),
    ).rejects.toBeInstanceOf(InvalidInput);
    expect(await listMyTeamRecommendations(c.member)).toEqual([]);
    // each business sees only its own (RLS)
    expect(await listPendingTeamRecommendations(b.owner)).toHaveLength(1);
    expect(await listPendingTeamRecommendations(c.owner)).toHaveLength(1);
  });

  it('„Respinge” (owner or admin): „Nu acum”, no notification to the member, once; sent again only after 30 days', async () => {
    const b = await business();
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    const [r] = await listMyTeamRecommendations(b.member);
    await expect(rejectTeamRecommendation(b.member, r!.id)).rejects.toBeInstanceOf(Forbidden);
    await rejectTeamRecommendation(b.admin, r!.id);
    await expect(rejectTeamRecommendation(b.owner, r!.id)).rejects.toBeInstanceOf(ResourceNotFound);
    const [after] = await listMyTeamRecommendations(b.member);
    expect(after).toMatchObject({ status: 'not_now', decidedByUserId: b.adminId });
    expect(after!.decidedAt).toBeInstanceOf(Date);
    expect(await listPendingTeamRecommendations(b.owner)).toEqual([]);

    await expect(
      notifyOwner(b.member, { targetType: 'application', targetId: 'crm' }),
    ).rejects.toBeInstanceOf(TeamRecommendationTooSoon);

    // 31 days later (the decision moved back by the admin connection, past the guard)
    await q(`ALTER TABLE commercial.team_recommendation DISABLE TRIGGER team_recommendation_guard`);
    try {
      await q(
        `UPDATE commercial.team_recommendation SET decided_at = now() - interval '31 days' WHERE id = $1`,
        [r!.id],
      );
    } finally {
      await q(
        `ALTER TABLE commercial.team_recommendation ENABLE TRIGGER team_recommendation_guard`,
      );
    }
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    const list = await listMyTeamRecommendations(b.member);
    expect(list.map((x) => x.status)).toEqual(['pending', 'not_now']);

    await dispatchAll(b.organizationId);
    const toMember = await q(
      `SELECT type FROM notifications.notification WHERE organization_id = $1 AND recipient_user_id = $2`,
      [b.organizationId, b.memberId],
    );
    expect(toMember).toEqual([]);
  });

  it('the app enters the subscription: „Activată” and „{owner} a activat {app}” to whoever recommended it, once', async () => {
    const b = await business();
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    await notifyOwner(b.admin, { targetType: 'application', targetId: 'crm' });
    await saveCard(b);
    expect((await purchase(b.ctx, { kind: 'application', applicationId: 'crm' })).status).toBe(
      'succeeded',
    );
    await dispatchAll(b.organizationId);
    // delivered again (a retry): nothing more
    await q(
      `UPDATE commercial.outbox_events SET status = 'pending', dispatched_at = NULL
        WHERE organization_id = $1 AND type = 'commercial.application.activated'`,
      [b.organizationId],
    );
    await dispatchAll(b.organizationId);

    for (const who of [b.member, b.admin]) {
      const [r] = await listMyTeamRecommendations(who);
      expect(r).toMatchObject({ status: 'active', decidedByUserId: null });
    }
    const rows = await q(
      `SELECT recipient_user_id::text AS recipient, params, action_url
         FROM notifications.notification
        WHERE organization_id = $1 AND type = 'team_recommendation.activated'`,
      [b.organizationId],
    );
    expect(rows.map((r) => r.recipient).sort()).toEqual([b.adminId, b.memberId].sort());
    expect(rows[0]).toMatchObject({
      params: { owner: 'Bianca Petrașcu', app: 'ClientDesk', appId: 'crm' },
      action_url: '/applications/crm',
    });
    expect(await listPendingTeamRecommendations(b.owner)).toEqual([]);
  });

  it('the database: commercial_rw cannot delete or change what was recommended; decided once', async () => {
    const b = await business();
    await notifyOwner(b.member, { targetType: 'application', targetId: 'crm' });
    const [r] = await listMyTeamRecommendations(b.member);
    const c = await appPool.connect();
    const inTenant = async (sql: string) => {
      await c.query('BEGIN');
      try {
        await c.query('SET LOCAL ROLE commercial_rw');
        await c.query(`SELECT set_config('app.organization_id', $1, true)`, [b.organizationId]);
        await c.query(sql, [r!.id]);
      } finally {
        await c.query('ROLLBACK');
      }
    };
    try {
      await expect(
        inTenant(`DELETE FROM commercial.team_recommendation WHERE id = $1`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        inTenant(`UPDATE commercial.team_recommendation SET note = 'alt' WHERE id = $1`),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      c.release();
    }
    // decided once: after „Nu acum” nothing changes it back
    await rejectTeamRecommendation(b.owner, r!.id);
    await expect(
      q(`UPDATE commercial.team_recommendation SET status = 'active' WHERE id = $1`, [r!.id]),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});
