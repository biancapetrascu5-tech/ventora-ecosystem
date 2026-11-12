import { guardBulkOp } from '@ventora/db-kit';
import { deleteFileAsSystem, listAnonymousFiles } from '@ventora/files';
import { deleteExpiredAnswerPhotos, deleteMarkedPhotos } from './forms';
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
 *   - B.11b (review #174): the clients' links revoked 30 days after their booking (revoked_at);
 *   - B.12 (S127): the photos of the settled holds (expired, refused, or confirmed with photos not
 *     moved to the booking) deleted through the system deletion of core/files (deleteFileAsSystem,
 *     C.4f: one deletion path, an audit row `system` per file), then has_photos = false; and the
 *     photos of erased clients still marked (photo_deleted_at NULL), deleted the same way;
 *   - B.12b (S146): the photos of the answers 30 days after the booking, deleted the same way
 *     (reason photo_retention); the answer stays, without its photo.
 * No DELETE, no withSystemContext, no audit (no personal action: housekeeping). One business that
 * fails does not stop the others; the job then fails (Sentry, retry), the rest stays done.
 */

export const PUBLIC_CLEANUP = {
  businessesPerRun: 500,
  hashHours: 24,
  linkDays: 30,
  photoHoldsPerBusiness: 200,
} as const;

export type PublicHoldCleanupReport = {
  businesses: number;
  expired: number;
  hashesCleared: number;
  /** B.11b (review #174): the clients' links revoked 30 days after their booking. */
  linksRevoked: number;
  /** B.12: the photos deleted (settled holds, not moved to a booking; erased clients, retried). */
  photosDeleted: number;
  /** B.12b (S146): the photos of the answers deleted 30 days after the booking. */
  photosExpired: number;
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
    photosDeleted: 0,
    photosExpired: 0,
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
      report.photosDeleted += await cleanHoldPhotos(organizationId);
      report.photosDeleted += (await deleteMarkedPhotos(organizationId, null)).deleted;
      report.photosExpired += (await deleteExpiredAnswerPhotos(organizationId)).deleted;
    } catch (error) {
      report.failed.push({ organizationId, error });
    }
  }
  return report;
}

/**
 * B.12 (S127): the settled holds with photos. A confirmed hold keeps the photos moved to its booking;
 * every other photo of the hold (expired, refused, or not moved) is deleted by the system deletion of
 * core/files (C.4f), file by file. One hold that fails stays marked for the next run.
 */
async function cleanHoldPhotos(organizationId: string): Promise<number> {
  const holds = await withBookingTx(
    organizationId,
    async (client) =>
      (
        await client.query<{ id: string; keep: string[] }>(
          `SELECT h.id,
                  COALESCE(array_agg(q.photo_file_id) FILTER (WHERE q.photo_file_id IS NOT NULL),
                           '{}') AS keep
             FROM booking.public_hold h
             LEFT JOIN booking.appointment_answer q
               ON q.appointment_id = h.appointment_id AND q.photo_deleted_at IS NULL
            WHERE h.has_photos AND h.state <> 'pending'
            GROUP BY h.id
            LIMIT $1`,
          [PUBLIC_CLEANUP.photoHoldsPerBusiness],
        )
      ).rows,
    true,
  );
  let deleted = 0;
  for (const h of holds) {
    const files = await listAnonymousFiles({ organizationId, anonymousKey: h.id });
    for (const f of files) {
      if (h.keep.includes(f.id)) continue;
      const done = await deleteFileAsSystem(organizationId, {
        fileId: f.id,
        module: 'booking',
        reason: 'public_hold_settled',
      });
      if (done) deleted += 1;
    }
    await withBookingTx(organizationId, (client) =>
      client.query(`UPDATE booking.public_hold SET has_photos = false WHERE id = $1`, [h.id]),
    );
  }
  return deleted;
}
