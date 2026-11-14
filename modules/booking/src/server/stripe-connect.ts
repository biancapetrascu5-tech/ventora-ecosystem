import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions } from '@ventora/audit';
import { getConnectGateway, type ConnectAccountState } from '@ventora/billing';
import { Conflict, Forbidden } from '@ventora/errors';
import { platformLink } from '@ventora/notifications';
import { getOrganizationCard } from '@ventora/organizations';
import { hubOnly } from './actor';
import { audit, tx } from './appointments';
import { withBookingJobTx, withBookingTx } from './db';

/*
 * Lot B.22a — the salon's Stripe account (BOOKING.md B.22, D-B-7; design BookingPayments, S116 d).
 * Decision of the founder (14.11.2026), replacing S116-D13 (Express): direct charges on the salon's
 * own Stripe account (Accounts v2, merchant configuration, full Stripe Dashboard); the salon is the
 * merchant of record and Ventora Systems never holds the money.
 *
 * Only the owner connects, reconnects and disconnects it („conectat … de owner”); everyone with
 * booking:settings sees its status. The status comes from Stripe: read again on return from its
 * form, on the settings page (at most once a minute) and on the account's notifications.
 * Deposits (B.22b) are asked only while it is `active`.
 */

export type StripeConnectionStatus = 'not_connected' | ConnectAccountState['status'];

export type StripeConnection = {
  status: StripeConnectionStatus;
  /** The name Stripe shows for the account (the company), or null. */
  displayName: string | null;
  /** Deposits can be asked (B.22b): an active, connected account. */
  canTakeDeposits: boolean;
  /** Only the owner connects or disconnects (the others see the status). */
  canManage: boolean;
};

type Row = {
  stripe_account_id: string;
  status: ConnectAccountState['status'];
  display_name: string | null;
  ever_active: boolean;
  status_checked_at: Date;
  disconnected_at: Date | null;
};

const COLUMNS = `stripe_account_id, status, display_name, ever_active, status_checked_at,
  disconnected_at`;

/** How often the settings page reads the account again from Stripe. */
export const STRIPE_CONNECT_LIMITS = { refreshSeconds: 60 } as const;

/** Where Stripe's form sends the owner back (the routes refresh the status or make a new link). */
export const STRIPE_CONNECT_PATHS = {
  return: '/booking/settings/payments/stripe/return',
  refresh: '/booking/settings/payments/stripe/refresh',
} as const;

function owner(ctx: TenantContext): void {
  if (ctx.role !== 'owner') throw new Forbidden();
}

async function readRow(client: PoolClient): Promise<Row | null> {
  const { rows } = await client.query<Row>(`SELECT ${COLUMNS} FROM booking.stripe_account`);
  return rows[0] ?? null;
}

function toConnection(ctx: TenantContext, row: Row | null): StripeConnection {
  const connected = row !== null && row.disconnected_at === null;
  // after being active once, a first-onboarding answer from Stripe means problems
  const status: StripeConnectionStatus = !connected
    ? 'not_connected'
    : row.status === 'onboarding' && row.ever_active
      ? 'problems'
      : row.status;
  return {
    status,
    displayName: connected ? row.display_name : null,
    canTakeDeposits: connected && row.status === 'active',
    canManage: ctx.role === 'owner',
  };
}

/** The state Stripe gives, written to the row (in the business's context). */
async function writeState(client: PoolClient, state: ConnectAccountState): Promise<void> {
  await client.query(
    `UPDATE booking.stripe_account
        SET status = $2::varchar, display_name = $3, ever_active = ever_active OR $2::varchar = 'active',
            status_checked_at = now(), updated_at = now()
      WHERE stripe_account_id = $1`,
    [state.id, state.status, state.displayName],
  );
}

/** Setări · „Plăți și avans”: the account and its status (read again from Stripe if stale). */
export async function getStripeConnectionInOrg(ctx: TenantContext): Promise<StripeConnection> {
  hubOnly(ctx);
  const row = await tx(ctx, (client) => readRow(client), true);
  if (
    row &&
    !row.disconnected_at &&
    Date.now() - row.status_checked_at.getTime() > STRIPE_CONNECT_LIMITS.refreshSeconds * 1000
  ) {
    return refreshStripeConnectionInOrg(ctx);
  }
  return toConnection(ctx, row);
}

/** On return from Stripe's form (and on demand): the status read again from Stripe. */
export async function refreshStripeConnectionInOrg(ctx: TenantContext): Promise<StripeConnection> {
  hubOnly(ctx);
  const row = await tx(ctx, (client) => readRow(client), true);
  if (!row || row.disconnected_at) return toConnection(ctx, row);
  const state = await getConnectGateway().retrieveAccount(row.stripe_account_id);
  return tx(ctx, async (client) => {
    await writeState(client, state);
    return toConnection(ctx, await readRow(client));
  });
}

/**
 * „Conectează Stripe” / „Continuă în Stripe” / „Rezolvă în Stripe” (owner): the account is created
 * once (the business's id is the idempotency key; connecting again after a disconnect reuses it),
 * then a link to Stripe's hosted form — onboarding, or update once the account was active.
 */
export async function startStripeConnectionInOrg(ctx: TenantContext): Promise<{ url: string }> {
  hubOnly(ctx);
  owner(ctx);
  const gateway = getConnectGateway();
  let row = await tx(ctx, (client) => readRow(client), true);
  if (!row) {
    const card = await getOrganizationCard(ctx.organizationId);
    const state = await gateway.createAccount({
      organizationId: ctx.organizationId,
      displayName: card?.name ?? 'EasyBook',
      contactEmail: null,
      idempotencyKey: `booking-connect-${ctx.organizationId}`,
    });
    row = await tx(ctx, async (client, exec) => {
      await client.query(
        `INSERT INTO booking.stripe_account
                (organization_id, stripe_account_id, status, display_name, ever_active,
                 connected_by_user_id)
         VALUES ($1, $2, $3::varchar, $4, $3::varchar = 'active', $5)
         ON CONFLICT (organization_id) DO NOTHING`,
        [ctx.organizationId, state.id, state.status, state.displayName, ctx.userId],
      );
      await audit(
        exec,
        ctx,
        AuditActions.bookingSettingsUpdated,
        'booking_settings',
        ctx.organizationId,
        { stripe: 'connected' },
      );
      return readRow(client);
    });
    if (!row) throw new Conflict('stripe_account_missing');
  } else if (row.disconnected_at) {
    row = await tx(ctx, async (client, exec) => {
      await client.query(
        `UPDATE booking.stripe_account
            SET disconnected_at = NULL, connected_by_user_id = $1, updated_at = now()`,
        [ctx.userId],
      );
      await audit(
        exec,
        ctx,
        AuditActions.bookingSettingsUpdated,
        'booking_settings',
        ctx.organizationId,
        { stripe: 'reconnected' },
      );
      return readRow(client);
    });
    if (!row) throw new Conflict('stripe_account_missing');
  }
  const link = await gateway.createAccountLink({
    accountId: row.stripe_account_id,
    kind: row.ever_active ? 'update' : 'onboarding',
    refreshUrl: platformLink(STRIPE_CONNECT_PATHS.refresh),
    returnUrl: platformLink(STRIPE_CONNECT_PATHS.return),
  });
  return { url: link.url };
}

/**
 * „Deconectează…” (owner): EasyBook stops asking deposits on it; the Stripe account stays the
 * salon's (and the deposits already paid stay where they are). Connecting again reuses it.
 */
export async function disconnectStripeInOrg(ctx: TenantContext): Promise<StripeConnection> {
  hubOnly(ctx);
  owner(ctx);
  return tx(ctx, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE booking.stripe_account SET disconnected_at = now(), updated_at = now()
        WHERE disconnected_at IS NULL`,
    );
    if (rowCount) {
      await audit(
        exec,
        ctx,
        AuditActions.bookingSettingsUpdated,
        'booking_settings',
        ctx.organizationId,
        { stripe: 'disconnected' },
      );
    }
    return toConnection(ctx, await readRow(client));
  });
}

/** For B.22b: the active account deposits are charged on, or null (no deposit can be asked). */
export async function activeStripeAccount(client: PoolClient): Promise<string | null> {
  const row = await readRow(client);
  return row && !row.disconnected_at && row.status === 'active' ? row.stripe_account_id : null;
}

/**
 * The webhook of the connected accounts (no session): the business of the account, then its
 * status read again from Stripe and written in the business's context. An unknown account → false.
 */
export async function refreshStripeAccountFromNotification(accountId: string): Promise<boolean> {
  const organizationId = await withBookingJobTx(async (client) => {
    const { rows } = await client.query<{ organization_id: string | null }>(
      `SELECT booking.organization_of_stripe_account($1) AS organization_id`,
      [accountId],
    );
    return rows[0]?.organization_id ?? null;
  });
  if (!organizationId) return false;
  const state = await getConnectGateway().retrieveAccount(accountId);
  await withBookingTx(organizationId, (client) => writeState(client, state));
  return true;
}
