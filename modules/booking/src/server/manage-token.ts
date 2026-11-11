import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { hubOnly } from './actor';
import { withBookingTx } from './db';
import { isUuid } from './validation';

/*
 * Lot B.11b — the client's link for moving or cancelling a booking (/r/<slug>/m/<token>; design
 * BookingClientManage, S125). The token is 32 random bytes (base64url, 43 characters), given out
 * once and stored only as SHA-256 (booking.manage_token). A booking may have several links (the
 * page after the code; each e-mail of B.13 its own): all valid while the booking exists, revoked by
 * the GDPR erasure.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function manageTokenHash(token: string): string {
  return crypto.createHash('sha256').update(`manage:${token}`).digest('hex');
}

/** A token of the right shape, else null (the caller answers „not found”). */
export function parseManageToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN_RE.test(value) ? value : null;
}

/** A new link for the booking, in the caller's transaction; the token is returned only here. */
export async function issueManageToken(
  client: PoolClient,
  organizationId: string,
  appointmentId: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO booking.manage_token (id, organization_id, appointment_id, token_hash)
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), organizationId, appointmentId, manageTokenHash(token)],
  );
  return token;
}

/**
 * A new link for an existing booking of the business (B.13: the e-mails of a booking made in the
 * Hub). Not found for an id of another business (RLS) or a cancelled / finished booking.
 */
export async function issueManageLinkInOrg(
  ctx: TenantContext,
  appointmentId: unknown,
): Promise<string | null> {
  hubOnly(ctx);
  if (!isUuid(appointmentId)) return null;
  return withBookingTx(ctx.organizationId, async (client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM booking.appointment
        WHERE id = $1 AND status IN ('awaiting_payment', 'unconfirmed', 'confirmed')`,
      [appointmentId],
    );
    if (rows.length === 0) return null;
    return issueManageToken(client, ctx.organizationId, appointmentId);
  });
}
