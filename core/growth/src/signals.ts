import type { OutboxEnvelope, OutboxSqlClient } from '@ventora/db-kit';
import {
  CommercialAddonPurchasedV1,
  CommercialApplicationActivatedV1,
  CommercialFeatureLockedClickedV1,
  CommercialSubscriptionChangedV1,
  CommercialTrialEndingV1,
  CommercialTrialStartedV1,
  EVENT_CATALOG,
  GROWTH_ATTRIBUTION_DAYS,
  IntegrationTargetMissingV1,
  QuotaThresholdV1,
  type EventDefinition,
} from '@ventora/contracts';
import { withAppTx } from './db';

/*
 * Lot 5.7 — the signals and the conversions (GROWTH_ENGINE §2.3, §2.7; FAZA-5 D5-7, D5-12).
 *
 *   growthSignalConsumer     → a growthSafe signal from the outbox becomes a signal_hit of the
 *                              business (or of the person, for her own action), with a term; the
 *                              automatic campaigns read it (decide.ts). Delivered twice → one row.
 *   growthConversionConsumer → a commercial event (pack bought, app on, trial started, plan
 *                              changed) is attributed to the latest click of the same business on
 *                              an offer for that object, within 7 days (P24). No click → nothing.
 *                              Growth never records sales of its own: only these events.
 *   recordFeatureLockedClick → the Hub's own signal (a locked feature pressed), written directly:
 *                              it has no other consumer and must count at once.
 *
 * Only growthSafe events can be handled: a consumer listening to anything else is refused when it
 * is defined (`defineGrowthConsumer`), so no sensitive payload ever reaches the growth schema.
 */

const DAY_MS = 86_400_000;
const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

interface GrowthConsumer {
  name: string;
  handles: ReadonlyArray<{ type: string; version: number }>;
  handle(envelope: OutboxEnvelope, tx: OutboxSqlClient): Promise<void>;
}

export function defineGrowthConsumer(
  consumer: GrowthConsumer,
  catalog: readonly EventDefinition[] = EVENT_CATALOG,
): GrowthConsumer {
  for (const h of consumer.handles) {
    const def = catalog.find((d) => d.type === h.type && d.version === h.version);
    if (!def || !def.growthSafe) {
      throw new Error(
        `[growth] ${consumer.name}: ${h.type}@${h.version} is not a growthSafe event of the catalog`,
      );
    }
  }
  return consumer;
}

/** Runs `fn` as growth_rw inside the dispatcher's transaction (opened as the emitter's role). */
async function asGrowthRw<T>(tx: OutboxSqlClient, fn: () => Promise<T>): Promise<T> {
  const { rows } = await tx.query('SELECT current_user::text AS role');
  const previous = (rows[0] as { role: string }).role;
  if (!ROLE_RE.test(previous)) throw new Error(`[growth] unexpected role "${previous}"`);
  if (previous !== 'growth_rw') await tx.query('SET LOCAL ROLE growth_rw');
  try {
    return await fn();
  } finally {
    if (previous !== 'growth_rw') await tx.query(`SET LOCAL ROLE ${previous}`);
  }
}

/** How long a signal makes a business (or a person) eligible for its automatic campaigns. */
function signalTerm(envelope: OutboxEnvelope): Date {
  const at = envelope.occurredAt.getTime();
  const payload = envelope.payload as Record<string, unknown>;
  switch (envelope.type) {
    case CommercialTrialEndingV1.type: {
      // until the trial ends
      const ends = Date.parse(String(payload.endsAt));
      return new Date(Number.isFinite(ends) && ends > at ? ends : at + DAY_MS);
    }
    case CommercialFeatureLockedClickedV1.type:
      return new Date(at + DAY_MS);
    default:
      // the limit at 80 % / 100 %, a missing integration: a week
      return new Date(at + 7 * DAY_MS);
  }
}

export const GROWTH_SIGNALS = [
  QuotaThresholdV1,
  CommercialTrialEndingV1,
  CommercialFeatureLockedClickedV1,
  IntegrationTargetMissingV1,
] as const;

export const growthSignalConsumer = defineGrowthConsumer({
  name: 'growth.signals',
  handles: GROWTH_SIGNALS.map((d) => ({ type: d.type, version: d.version })),
  async handle(envelope, tx) {
    const payload = envelope.payload as Record<string, unknown>;
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    await asGrowthRw(tx, () =>
      tx.query(
        `INSERT INTO growth.signal_hit (id, organization_id, user_id, event_id, event_type,
           event_version, payload, received_at, expires_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          envelope.organizationId,
          userId,
          envelope.eventId,
          envelope.type,
          envelope.version,
          JSON.stringify(payload),
          envelope.occurredAt,
          signalTerm(envelope),
        ],
      ),
    );
  },
});

export const GROWTH_CONVERSIONS = [
  CommercialAddonPurchasedV1,
  CommercialApplicationActivatedV1,
  CommercialTrialStartedV1,
  CommercialSubscriptionChangedV1,
] as const;

/** The offers that lead to this commercial event: `[SQL condition on o.*, params]`. */
function offerMatch(envelope: OutboxEnvelope): [string, unknown[]] | null {
  const p = envelope.payload as Record<string, unknown>;
  switch (envelope.type) {
    case CommercialAddonPurchasedV1.type:
      return [`o.type = 'addon' AND o.addon_code = $4`, [p.addonCode]];
    case CommercialApplicationActivatedV1.type:
      // the app itself, or its trial converted
      return [`o.type IN ('app_activation', 'trial') AND o.application_id = $4`, [p.applicationId]];
    case CommercialTrialStartedV1.type:
      return p.applicationId
        ? [`o.type = 'trial' AND o.application_id = $4`, [p.applicationId]]
        : [`o.type = 'trial' AND o.feature_key = $4`, [p.featureKey]];
    case CommercialSubscriptionChangedV1.type:
      return p.toPlanVersionId
        ? [`o.type IN ('plan_upgrade', 'bundle') AND o.plan_version_id = $4`, [p.toPlanVersionId]]
        : null;
    default:
      return null;
  }
}

export const growthConversionConsumer = defineGrowthConsumer({
  name: 'growth.conversions',
  handles: GROWTH_CONVERSIONS.map((d) => ({ type: d.type, version: d.version })),
  async handle(envelope, tx) {
    const match = offerMatch(envelope);
    if (!match) return;
    const [condition, params] = match;
    await asGrowthRw(tx, async () => {
      const since = new Date(envelope.occurredAt.getTime() - GROWTH_ATTRIBUTION_DAYS * DAY_MS);
      const { rows } = await tx.query(
        `SELECT x.id, i.campaign_id, i.offer_id
           FROM growth.interaction x
           JOIN growth.impression i ON i.id = x.impression_id
           JOIN growth.offer o ON o.id = i.offer_id
          WHERE x.kind = 'click' AND x.organization_id = $1
            AND x.created_at >= $2 AND x.created_at <= $3 AND ${condition}
          ORDER BY x.created_at DESC
          LIMIT 1`,
        [envelope.organizationId, since, envelope.occurredAt, ...params],
      );
      const click = rows[0] as { id: string; campaign_id: string; offer_id: string } | undefined;
      if (!click) return;
      await tx.query(
        `INSERT INTO growth.conversion (id, organization_id, campaign_id, offer_id,
           click_interaction_id, event_id, event_type, converted_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          envelope.organizationId,
          click.campaign_id,
          click.offer_id,
          click.id,
          envelope.eventId,
          envelope.type,
          envelope.occurredAt,
        ],
      );
    });
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Hub: the person pressed a locked feature (the common component). Her own action, so the
 * slot that follows is user-initiated and her automatic campaigns on this signal come first.
 * Payload as `commercial.feature.locked_clicked` v1 (growthSafe). Never throws into the page.
 */
export async function recordFeatureLockedClick(input: {
  organizationId: string;
  userId: string;
  applicationId: string | null;
  featureKey: string;
}): Promise<boolean> {
  try {
    if (!UUID_RE.test(input.organizationId) || !UUID_RE.test(input.userId)) return false;
    const payload = CommercialFeatureLockedClickedV1.parse({
      userId: input.userId,
      applicationId: input.applicationId,
      featureKey: input.featureKey,
    });
    const now = new Date();
    await withAppTx(input.organizationId, (c) =>
      c.query(
        `INSERT INTO growth.signal_hit (id, organization_id, user_id, event_id, event_type,
           event_version, payload, received_at, expires_at)
         VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, $4, $5::jsonb, $6, $7)`,
        [
          input.organizationId,
          input.userId,
          CommercialFeatureLockedClickedV1.type,
          CommercialFeatureLockedClickedV1.version,
          JSON.stringify(payload),
          now,
          new Date(now.getTime() + DAY_MS),
        ],
      ),
    );
    return true;
  } catch {
    return false;
  }
}
