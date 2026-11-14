import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  disconnectStripeInOrg,
  getStripeConnectionInOrg,
  refreshStripeAccountFromNotification,
  refreshStripeConnectionInOrg,
  startStripeConnectionInOrg,
  STRIPE_CONNECT_PATHS,
  type StripeConnection,
  type StripeConnectionStatus,
} from '../server/stripe-connect';

/*
 * Lot B.22a — the public contract of the salon's Stripe account (Setări · „Plăți și avans”,
 * BookingPayments S116 d). Reading with booking:settings; connecting, reconnecting and
 * disconnecting by the owner only (Forbidden for the others). Direct charges on the salon's own
 * account (decision of the founder, 14.11.2026).
 */

type Session = { sessionToken: string };

const settings = (params: Session): Promise<TenantContext> =>
  authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });

/** The account and its status (read again from Stripe when older than a minute). */
export async function getStripeConnection(params: Session): Promise<StripeConnection> {
  return getStripeConnectionInOrg(await settings(params));
}

/** On return from Stripe's form: the status read again now. */
export async function refreshStripeConnection(params: Session): Promise<StripeConnection> {
  return refreshStripeConnectionInOrg(await settings(params));
}

/** „Conectează Stripe” / „Continuă” / „Rezolvă în Stripe” (owner): the link to Stripe's form. */
export async function startStripeConnection(params: Session): Promise<{ url: string }> {
  return startStripeConnectionInOrg(await settings(params));
}

/** „Deconectează…” (owner). */
export async function disconnectStripe(params: Session): Promise<StripeConnection> {
  return disconnectStripeInOrg(await settings(params));
}

/** The webhook of the connected accounts (no session): the account's status read again. */
export { refreshStripeAccountFromNotification, STRIPE_CONNECT_PATHS };
export type { StripeConnection, StripeConnectionStatus };
