import type { PoolClient } from 'pg';
import {
  CommercialApplicationActivatedV1,
  CommercialSubscriptionChangedV1,
} from '@ventora/contracts';
import { getNotificationContactsInTx } from '@ventora/identity';
import {
  sendNotification,
  TEAM_RECOMMENDATION_ACTIVATED,
  type SqlClient,
} from '@ventora/notifications';
import { listManagersInTx } from '@ventora/organizations';
import {
  activateBundleRecommendationsInTx,
  activateRecommendationsInTx,
} from './team-recommendations';

/*
 * Lot 5.9e — consumatorul lui `commercial.application.activated` (aplicația a intrat în
 * abonament: cumpărată, activată la cerere sau după probă) și al lui `commercial.subscription.changed`
 * (o mutare de bundle a intrat în vigoare: aplicațiile noi din bundle; job-ul
 * commercial.subscription-changes): recomandările în așteptare devin
 * „Activată”, iar fiecare persoană care a recomandat-o primește „{owner} a activat {app}”
 * (decizia fondatoarei din 13.11.2026). Rulează în tranzacția dispecerului, în contextul
 * afacerii, ca commercial_rw. Livrat de două ori → o singură schimbare (doar cele în așteptare)
 * și o singură notificare (cheia de idempotență).
 */

type Envelope = { eventId: string; organizationId: string; payload: unknown };

export const teamRecommendationActivatedConsumer = {
  name: 'commercial.team-recommendation-activated',
  handles: [
    {
      type: CommercialApplicationActivatedV1.type,
      version: CommercialApplicationActivatedV1.version,
    },
    {
      type: CommercialSubscriptionChangedV1.type,
      version: CommercialSubscriptionChangedV1.version,
    },
  ],
  async handle(envelope: Envelope & { type?: string }, tx: SqlClient): Promise<void> {
    const organizationId = envelope.organizationId;
    // the dispatcher hands over its pg client (the entitlements read needs it)
    const client = tx as unknown as PoolClient;
    let activated: { id: string; applicationId: string; applicationName: string; userId: string }[];
    if (envelope.type === CommercialSubscriptionChangedV1.type) {
      const p = CommercialSubscriptionChangedV1.parse(envelope.payload);
      activated = await activateBundleRecommendationsInTx(
        client,
        organizationId,
        p.fromPlanVersionId,
        p.toPlanVersionId,
      );
    } else {
      const p = CommercialApplicationActivatedV1.parse(envelope.payload);
      activated = (await activateRecommendationsInTx(client, organizationId, p.applicationId)).map(
        (r) => ({ ...r, applicationId: p.applicationId }),
      );
    }
    if (activated.length === 0) return;

    const owners = (await listManagersInTx(tx, organizationId))
      .filter((m) => m.role === 'owner')
      .map((m) => m.userId);
    const contacts = await getNotificationContactsInTx(
      {
        query: async (sql, params) =>
          (await tx.query(sql, params)).rows as Record<string, unknown>[],
        exec: async (sql) => {
          await tx.query(sql);
        },
      },
      owners.slice(0, 1),
    );
    const owner = (owners[0] && contacts.get(owners[0])?.name) || '';

    for (const r of activated) {
      await sendNotification(tx, {
        category: 'operational',
        type: TEAM_RECOMMENDATION_ACTIVATED,
        version: 1,
        organizationId,
        recipientUserIds: [r.userId],
        ownerUserIds: owners.filter((o) => o === r.userId),
        idempotencyKey: `team_recommendation_activated:${r.id}`,
        params: { owner, app: r.applicationName, appId: r.applicationId },
      });
    }
  },
};
