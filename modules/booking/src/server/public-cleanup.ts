import { guardBulkOp } from '@ventora/db-kit';
import { withBookingJobTx, withBookingTx } from './db';
import { settleExpired } from './public';

/*
 * Review #164 (points 1 and 2) — the internal Booking job booking.public-hold-cleanup. Without it, a
 * hold left behind keeps the client's name, phone and e-mail until the next public request of the
 * same business, which may never come; and the hashes of the e-mail and the IP would stay forever.
 *
 * Each run, for each business with something to clean (booking.public_hold_cleanup_due: only ids,
 * across RLS), in that business's own context (withBookingTx: booking_rw + app.organization_id):
 *   - the pending holds whose 10 minutes passed → 'expired', personal data wiped (settleExpired);
 *   - email_hash and ip_hash set to NULL on the rows older than 24 hours;
 *   - B.11b (review #174): the clients' links revoked 30 days after their booking (revoked_at).
 * No DELETE, no withSystemContext, no audit (no personal action: housekeeping). One business that
 * fails does not stop the others; the job then fails (Sentry, retry), the rest stays done.
 */

export const PUBLIC_CLEANUP = { businessesPerRun: 500, hashHours: 24, linkDays: 30 } as const;

export type PublicHoldCleanupReport = {
  businesses: number;
  expired: number;
  hashesCleared: number;
  /** B.11b (review #174): the clients' links revoked 30 days after their booking. */
  linksRevoked: number;
  failed: Array<{ organizationId: string; error: unknown }>;
};

export async function runPublicHoldCleanupJob(): Promise<PublicHoldCleanupReport> {
  const due = await withBookingJobTx(
    async (client) =>
      (
        await client.query<{ organization_id: string }>(
          `SELECT organization_id::text FROM booking.public_hold_cleanup_due($1)`,
          [PUBLIC_CLEANUP.businessesPerRun],
        )
      ).rows,
  );
  const report: PublicHoldCleanupReport = {
    businesses: due.length,
    expired: 0,
    hashesCleared: 0,
    linksRevoked: 0,
    failed: [],
  };
  for (const { organization_id: organizationId } of due) {
    try {
      const done = await withBookingTx(organizationId, async (client) => {
        const expired = await settleExpired(client);
        const filter = { createdBefore: `${PUBLIC_CLEANUP.hashHours} hours` };
        guardBulkOp('booking.public_hold.clear_hashes', filter);
        const cleared = await client.query(
          `UPDATE booking.public_hold SET email_hash = NULL, ip_hash = NULL
            WHERE created_at < now() - make_interval(hours => $1)
              AND (email_hash IS NOT NULL OR ip_hash IS NOT NULL)`,
          [PUBLIC_CLEANUP.hashHours],
        );
        const linkFilter = { endedBefore: `${PUBLIC_CLEANUP.linkDays} days` };
        guardBulkOp('booking.manage_token.revoke_old', linkFilter);
        const revoked = await client.query(
          `UPDATE booking.manage_token t SET revoked_at = now()
            WHERE t.revoked_at IS NULL
              AND t.appointment_id IN (
                SELECT a.id FROM booking.appointment a
                 WHERE a.ends_at < now() - make_interval(days => $1))`,
          [PUBLIC_CLEANUP.linkDays],
        );
        return { expired, cleared: cleared.rowCount ?? 0, revoked: revoked.rowCount ?? 0 };
      });
      report.expired += done.expired;
      report.hashesCleared += done.cleared;
      report.linksRevoked += done.revoked;
    } catch (error) {
      report.failed.push({ organizationId, error });
    }
  }
  return report;
}
