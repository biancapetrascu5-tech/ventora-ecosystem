import { CommercialSubscriptionChangedV1 } from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
import { withModuleRead, withOrganizationWrite } from './db';

/*
 * Lot 5.9e — job-ul `commercial.subscription-changes` (platforma): o mutare pe altă versiune de
 * bundle (subscription_change, programată din Founder) intră în vigoare la effective_at fără
 * niciun eveniment. Job-ul o anunță o singură dată, când ajunge la termen, prin
 * `commercial.subscription.changed` — evenimentul pe care îl ascultă consumatorul recomandărilor
 * („Activată” + „{owner} a activat {app}” pentru aplicațiile noi din bundle; decizia fondatoarei
 * din 13.11.2026) și Growth (conversia). Mutările anulate nu se anunță.
 */

export async function runSubscriptionChangeJob(opts: { limit?: number } = {}): Promise<{
  announced: number;
  errors: Array<{ subscriptionChangeId: string; error: unknown }>;
}> {
  const due = await withModuleRead((client) =>
    client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM commercial.subscription_changes_due($1)`,
      [opts.limit ?? 100],
    ),
  );
  let announced = 0;
  const errors: Array<{ subscriptionChangeId: string; error: unknown }> = [];
  for (const c of due.rows) {
    try {
      const done = await withOrganizationWrite(c.organization_id, async (client) => {
        const change = await client.query<{
          subscription_id: string;
          from_version_id: string;
          to_version_id: string;
        }>(
          `SELECT subscription_id, from_version_id, to_version_id
             FROM commercial.subscription_change
            WHERE id = $1 AND canceled_at IS NULL AND effective_at <= now()`,
          [c.id],
        );
        const ch = change.rows[0];
        if (!ch) return false;
        const { rows } = await client.query(
          `INSERT INTO commercial.subscription_change_announced (subscription_change_id, organization_id)
           VALUES ($1, $2) ON CONFLICT (subscription_change_id) DO NOTHING RETURNING 1`,
          [c.id, c.organization_id],
        );
        if (!rows[0]) return false;
        await writeOutboxEvent(client, 'commercial', CommercialSubscriptionChangedV1, {
          organizationId: c.organization_id,
          sourceApp: CommercialSubscriptionChangedV1.sourceApp,
          resourceId: c.id,
          payload: {
            subscriptionId: ch.subscription_id,
            fromPlanVersionId: ch.from_version_id,
            toPlanVersionId: ch.to_version_id,
          },
        });
        return true;
      });
      if (done) announced++;
    } catch (error) {
      errors.push({ subscriptionChangeId: c.id, error });
    }
  }
  return { announced, errors };
}
