import type { PoolClient } from 'pg';
import { CommercialApplicationActivatedV1 } from '@ventora/contracts';
import { getNotificationContactsInTx } from '@ventora/identity';
import {
  sendNotification,
  TEAM_RECOMMENDATION_ACTIVATED,
  type SqlClient,
} from '@ventora/notifications';
import { listManagersInTx } from '@ventora/organizations';
import { activateRecommendationsInTx } from './team-recommendations';

/*
 * Lot 5.9e — consumatorul lui `commercial.application.activated` (aplicația a intrat în
 * abonament: cumpărată, activată la cerere sau după probă): recomandările ei în așteptare devin
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
  ],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = CommercialApplicationActivatedV1.parse(envelope.payload);
    const organizationId = envelope.organizationId;
    // the dispatcher hands over its pg client (the entitlements read needs it)
    const activated = await activateRecommendationsInTx(
      tx as unknown as PoolClient,
      organizationId,
      p.applicationId,
    );
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
        params: { owner, app: r.applicationName, appId: p.applicationId },
      });
    }
  },
};
