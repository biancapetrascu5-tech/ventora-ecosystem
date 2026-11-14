import Stripe from 'stripe';

/*
 * Lot B.22a — Stripe Connect for the businesses' own payments (EasyBook deposits). Decision of the
 * founder (14.11.2026), replacing S116-D13 (Express): direct charges on the salon's own account —
 * Accounts v2 with the merchant configuration, the full Stripe Dashboard, Stripe fees and losses
 * on the salon's account (fees_collector / losses_collector = stripe). The salon is the merchant
 * of record; the money goes straight to it and Ventora Systems never holds it.
 *
 * Like stripe.ts, the only place that talks to Stripe for Connect: a small gateway, the real one
 * over the official SDK, a fake in the tests (CI has no Stripe keys). Nothing about the salon's
 * company or bank is stored by Ventora beyond the account id, its display name and its status.
 */

/**
 * The account as EasyBook shows it (BookingPayments, S116 d):
 * - `onboarding`: created, the salon has not finished Stripe's form („Conectează Stripe” again);
 * - `in_review`: submitted, Stripe checks it (1–2 working days; clients book without a deposit);
 * - `active`: card payments active — deposits can be asked;
 * - `problems`: Stripe paused the payments (requirements due, restricted or rejected).
 */
export type ConnectAccountStatus = 'onboarding' | 'in_review' | 'active' | 'problems';

export interface ConnectAccountState {
  id: string;
  status: ConnectAccountStatus;
  displayName: string | null;
}

/** A notification about a connected account (a thin v2 event): which account to read again. */
export interface ConnectAccountNotification {
  eventId: string;
  type: string;
  accountId: string | null;
}

export interface ConnectGateway {
  createAccount(input: {
    organizationId: string;
    displayName: string;
    contactEmail: string | null;
    idempotencyKey: string;
  }): Promise<ConnectAccountState>;
  /** Stripe's hosted onboarding (first time) or update (requirements due) form. */
  createAccountLink(input: {
    accountId: string;
    kind: 'onboarding' | 'update';
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string; expiresAt: Date }>;
  retrieveAccount(accountId: string): Promise<ConnectAccountState>;
  /** Verifies the signature of a v2 event notification; throws on a bad one. */
  parseAccountNotification(
    rawBody: string,
    signature: string,
    secret: string,
  ): ConnectAccountNotification;
}

// ── The real gateway ───────────────────────────────────────────────────────────────────────

const ACCOUNT_INCLUDE = ['configuration.merchant', 'requirements'] as const;

type V2Account = Stripe.V2.Core.Account;

/** The EasyBook status from the v2 account (capability status, then the requirements). */
export function connectStatusOf(account: {
  configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string } } } } | null;
  requirements?: { entries?: Array<{ awaiting_action_from?: string }> } | null;
}): ConnectAccountStatus {
  const card = account.configuration?.merchant?.capabilities?.card_payments?.status;
  if (card === 'active') return 'active';
  const userDue = (account.requirements?.entries ?? []).some(
    (e) => e.awaiting_action_from === 'user',
  );
  if (card === 'restricted' || card === 'rejected') return 'problems';
  // pending (or not yet reported): Stripe checks it, unless the salon still has fields to fill
  return userDue ? 'onboarding' : 'in_review';
}

function accountState(a: V2Account): ConnectAccountState {
  return {
    id: a.id,
    status: connectStatusOf(a as unknown as Parameters<typeof connectStatusOf>[0]),
    displayName: a.display_name ?? null,
  };
}

export class SdkConnectGateway implements ConnectGateway {
  constructor(private readonly stripe: Stripe) {}

  async createAccount(input: {
    organizationId: string;
    displayName: string;
    contactEmail: string | null;
    idempotencyKey: string;
  }): Promise<ConnectAccountState> {
    const account = await this.stripe.v2.core.accounts.create(
      {
        display_name: input.displayName,
        ...(input.contactEmail ? { contact_email: input.contactEmail } : {}),
        dashboard: 'full',
        identity: { country: 'ro' },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        defaults: {
          currency: 'ron',
          responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
        },
        metadata: { ventora_organization_id: input.organizationId },
        include: [...ACCOUNT_INCLUDE],
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return accountState(account);
  }

  async createAccountLink(input: {
    accountId: string;
    kind: 'onboarding' | 'update';
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const urls = { refresh_url: input.refreshUrl, return_url: input.returnUrl };
    const link = await this.stripe.v2.core.accountLinks.create({
      account: input.accountId,
      use_case:
        input.kind === 'onboarding'
          ? { type: 'account_onboarding', account_onboarding: urls }
          : { type: 'account_update', account_update: urls },
    });
    return { url: link.url, expiresAt: new Date(link.expires_at) };
  }

  async retrieveAccount(accountId: string): Promise<ConnectAccountState> {
    return accountState(
      await this.stripe.v2.core.accounts.retrieve(accountId, { include: [...ACCOUNT_INCLUDE] }),
    );
  }

  parseAccountNotification(
    rawBody: string,
    signature: string,
    secret: string,
  ): ConnectAccountNotification {
    const n = this.stripe.parseEventNotification(rawBody, signature, secret) as unknown as {
      id: string;
      type: string;
      related_object?: { id?: string; type?: string } | null;
    };
    const related = n.related_object;
    return {
      eventId: n.id,
      type: n.type,
      accountId: related?.type === 'v2.core.account' ? (related.id ?? null) : null,
    };
  }
}

// ── Which gateway ──────────────────────────────────────────────────────────────────────────

let current: ConnectGateway | null = null;

/** The gateway in use: the tests set a fake; otherwise the SDK with STRIPE_SECRET_KEY. */
export function getConnectGateway(): ConnectGateway {
  if (current) return current;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('[billing] STRIPE_SECRET_KEY is not set');
  current = new SdkConnectGateway(
    new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: 'Ventora' } }),
  );
  return current;
}

export function setConnectGatewayForTests(gateway: ConnectGateway | null): void {
  current = gateway;
}

export class ConnectNotificationSignatureError extends Error {
  constructor() {
    super('Invalid Stripe Connect notification signature');
    this.name = 'ConnectNotificationSignatureError';
  }
}

/**
 * The webhook of the connected accounts' notifications (STRIPE_CONNECT_WEBHOOK_SECRET): the
 * account to read again, or null for another kind of object. A bad signature → the error class.
 */
export function parseConnectNotification(
  rawBody: string,
  signature: string | null,
): ConnectAccountNotification {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw new Error('[billing] STRIPE_CONNECT_WEBHOOK_SECRET is not set');
  try {
    return getConnectGateway().parseAccountNotification(rawBody, signature ?? '', secret);
  } catch {
    throw new ConnectNotificationSignatureError();
  }
}
