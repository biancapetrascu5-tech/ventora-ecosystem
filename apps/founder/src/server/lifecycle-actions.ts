'use server';

import { headers } from 'next/headers';
import {
  cancelSetupByFounder,
  confirmSetup,
  getSetupOfferDefaults,
  getSetupRequestForFounder,
  goLiveSetup,
  listSetupRequestsForFounder,
  sendSetupOffer,
  startSetupWork,
  type SetupStatus,
} from '@ventora/commercial';
import {
  BillingProfileInvalid,
  confirmTransferReceipt,
  createSetupTransferInvoice,
  getBillingProfileForFounder,
  getPaymentSettingsForFounder,
  getSavedCardLast4ForFounder,
  listInvoicesForFounder,
  markInvoiceManual,
  reconcileSubscription,
  refundSetupRequest,
  retryInvoice,
  saveBillingProfile,
  setPaymentSettings,
  type BillingProfileError,
  type BillingProfileInput,
  type FounderInvoiceRow,
} from '@ventora/billing';
import { listBusinessesForFounder } from '@ventora/access';
import { reportActionError } from './report-error';

/* Lotul 3.8 (S121): datele de facturare (D-3.6-1), factura neemisă (D-3.6-5), plata prin
   transfer (D3-11), cererile cu implementare. Sesiunea Founder vine din cookie
   (requireFounderSession, cu 2FA); fiecare scriere are auditul ei în aceeași tranzacție, în
   core/billing sau core/commercial. Datele trec spre ecrane fără Date (ISO). */

export type LifecycleResult =
  | { ok: true }
  | {
      ok: false;
      field?: string;
      conflict?: string;
      /** Erorile formularului de date de facturare, cu numele din S121. */
      profileErrors?: BillingProfileError[];
    };

function fail(action: string, err: unknown): LifecycleResult {
  if (err instanceof BillingProfileInvalid) return { ok: false, profileErrors: err.errors };
  reportActionError(action, err);
  const e = err as { code?: string; field?: string; message?: string };
  if (e.code === 'INVALID_INPUT') return { ok: false, field: e.field };
  if (e.code === 'CONFLICT') return { ok: false, conflict: e.message ?? 'conflict' };
  return { ok: false };
}

async function run(action: string, fn: () => Promise<unknown>): Promise<LifecycleResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return fail(action, err);
  }
}

// ── „Plăți și facturi” ──────────────────────────────────────────────────────────────────────

export type InvoiceData = Omit<FounderInvoiceRow, 'createdAt'> & { createdAt: string };

export interface BillingTabData {
  profile: (BillingProfileInput & { updatedAt: string }) | null;
  payment: { method: 'card' | 'manual'; paymentTermsDays: number };
  invoices: InvoiceData[];
}

export async function readBillingTab(organizationId: string): Promise<BillingTabData | null> {
  try {
    const h = await headers();
    const p = { founderHeaders: h, organizationId };
    const [profile, payment, invoices] = await Promise.all([
      getBillingProfileForFounder(p),
      getPaymentSettingsForFounder(p),
      listInvoicesForFounder(p),
    ]);
    return {
      profile: profile
        ? {
            entityType: profile.entityType,
            name: profile.name,
            country: profile.country,
            taxId: profile.taxId,
            regCom: profile.regCom,
            street: profile.street,
            city: profile.city,
            county: profile.county,
            email: profile.email,
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
      payment,
      invoices: invoices.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    };
  } catch (err) {
    reportActionError('readBillingTab', err);
    return null;
  }
}

/** „Salvează datele” (FounderBillingProfile; FounderNewBusiness la creare, fără motiv). */
export async function saveProfile(input: {
  organizationId: string;
  profile: BillingProfileInput;
  reason: string | null;
}): Promise<LifecycleResult> {
  return run('saveProfile', async () =>
    saveBillingProfile({ founderHeaders: await headers(), ...input }),
  );
}

/** Plata manuală prin transfer / înapoi pe card, cu termenul de plată (N6: 1–90 de zile). */
export async function savePaymentSettings(input: {
  organizationId: string;
  method: 'card' | 'manual';
  paymentTermsDays: number;
}): Promise<LifecycleResult> {
  return run('savePaymentSettings', async () =>
    setPaymentSettings({ founderHeaders: await headers(), ...input }),
  );
}

/** „Reîncearcă”: rezultatul emiterii (issued / pending / failed), ca rândul să-l arate. */
export async function retryNotIssued(input: {
  organizationId: string;
  invoiceId: string;
}): Promise<{ ok: true; outcome: string } | { ok: false; conflict?: string }> {
  try {
    const outcome = await retryInvoice({ founderHeaders: await headers(), ...input });
    return { ok: true, outcome };
  } catch (err) {
    const r = fail('retryNotIssued', err);
    return { ok: false, conflict: 'conflict' in r ? r.conflict : undefined };
  }
}

/** „Marchează emisă manual”. */
export async function markManual(input: {
  organizationId: string;
  invoiceId: string;
  series: string;
  number: string;
  issueDate: string;
  reason: string;
}): Promise<LifecycleResult> {
  return run('markManual', async () =>
    markInvoiceManual({ founderHeaders: await headers(), ...input }),
  );
}

/** „Confirmă încasarea” (factura de transfer). */
export async function confirmTransfer(input: {
  organizationId: string;
  invoiceId: string;
  receivedOn: string;
}): Promise<LifecycleResult> {
  return run('confirmTransfer', async () =>
    confirmTransferReceipt({ founderHeaders: await headers(), ...input }),
  );
}

// ── cererile cu implementare ────────────────────────────────────────────────────────────────

export interface SetupListData {
  id: string;
  organizationId: string;
  business: string;
  applicationId: string;
  who: string;
  createdAt: string;
  updatedAt: string;
  status: SetupStatus;
}

export async function readSetupRequests(): Promise<SetupListData[] | null> {
  try {
    const h = await headers();
    const [rows, list] = await Promise.all([
      listSetupRequestsForFounder({ founderHeaders: h }),
      listBusinessesForFounder({ founderHeaders: h }),
    ]);
    const names = new Map(list.map((b) => [b.id, b]));
    return rows.map((r) => {
      const b = names.get(r.organizationId);
      return {
        id: r.id,
        organizationId: r.organizationId,
        business: b?.name ?? '',
        applicationId: r.applicationId,
        // only the owner asks (D3-8)
        who: b?.owner?.userId === r.requestedByUserId ? b.owner.name : '',
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        status: r.status,
      };
    });
  } catch (err) {
    reportActionError('readSetupRequests', err);
    return null;
  }
}

export interface SetupDetailData {
  id: string;
  organizationId: string;
  applicationId: string;
  currency: 'RON' | 'EUR';
  status: SetupStatus;
  setupMinor: number | null;
  maintenanceMinor: number | null;
  maintenanceInterval: 'month' | 'year' | null;
  estimatedStartOn: string | null;
  startOn: string | null;
  offerSentAt: string | null;
  acceptedAt: string | null;
  paidAt: string | null;
  paymentMethod: 'card' | 'transfer' | null;
  liveAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  refundedAt: string | null;
  /** The saved card's last 4 digits (the refund line of a card payment). */
  cardLast4: string | null;
  /** N7: the catalog's prices, precompleted in the offer. */
  defaults: { setupMinor: number; maintenanceMinor: number; interval: 'month' | 'year' } | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function readSetupRequest(
  organizationId: string,
  setupRequestId: string,
): Promise<SetupDetailData | null> {
  try {
    const p = { founderHeaders: await headers(), organizationId, setupRequestId };
    const r = await getSetupRequestForFounder(p);
    const defaults = r.status === 'requested' ? await getSetupOfferDefaults(p) : null;
    const cardLast4 = r.paymentMethod === 'card' ? await getSavedCardLast4ForFounder(p) : null;
    return {
      id: r.id,
      organizationId: r.organizationId,
      applicationId: r.applicationId,
      currency: r.currency,
      status: r.status,
      setupMinor: r.setupMinor,
      maintenanceMinor: r.maintenanceMinor,
      maintenanceInterval: r.maintenanceInterval,
      estimatedStartOn: r.estimatedStartOn,
      startOn: r.startOn,
      offerSentAt: iso(r.offerSentAt),
      acceptedAt: iso(r.acceptedAt),
      paidAt: iso(r.paidAt),
      paymentMethod: r.paymentMethod,
      liveAt: iso(r.liveAt),
      cancelledAt: iso(r.cancelledAt),
      cancelReason: r.cancelReason,
      refundedAt: iso(r.refundedAt),
      cardLast4,
      defaults,
    };
  } catch (err) {
    reportActionError('readSetupRequest', err);
    return null;
  }
}

type Step = { organizationId: string; setupRequestId: string };

export async function sendOffer(
  input: Step & {
    setupMinor: number;
    maintenanceMinor: number;
    estimatedStartOn: string;
    note: string;
  },
): Promise<LifecycleResult> {
  return run('sendOffer', async () =>
    sendSetupOffer({
      founderHeaders: await headers(),
      organizationId: input.organizationId,
      setupRequestId: input.setupRequestId,
      offer: {
        setupMinor: input.setupMinor,
        maintenanceMinor: input.maintenanceMinor,
        estimatedStartOn: input.estimatedStartOn,
        note: input.note,
      },
    }),
  );
}

/** „Confirmă”: data de început; pe transfer, factura implementării se emite întâi. */
export async function confirmStart(input: Step & { startOn: string }): Promise<LifecycleResult> {
  return run('confirmStart', async () => {
    const h = await headers();
    await confirmSetup({ founderHeaders: h, ...input });
    await createSetupTransferInvoice({ founderHeaders: h, ...input });
  });
}

/**
 * „Retrimite linkul de plată”: pe transfer, factura (dacă nu e încă); pe card, plata o face
 * owner-ul din Hub (HubSetupRequest) — notificarea e evenimentul cererii, deja trimis.
 */
export async function resendPayment(input: Step): Promise<LifecycleResult> {
  return run('resendPayment', async () =>
    createSetupTransferInvoice({ founderHeaders: await headers(), ...input }),
  );
}

export async function startWork(input: Step): Promise<LifecycleResult> {
  return run('startWork', async () =>
    startSetupWork({ founderHeaders: await headers(), ...input }),
  );
}

/** „Pornește aplicația”: linia recurentă de azi; pe card, Stripe o adaugă proporțional. */
export async function goLive(input: Step): Promise<LifecycleResult> {
  return run('goLive', async () => {
    await goLiveSetup({ founderHeaders: await headers(), ...input });
    await reconcileSubscription(input.organizationId).catch((err) =>
      reportActionError('goLive.reconcile', err),
    );
  });
}

/** „Anulează cererea…” (înainte de plată) / „Anulează și rambursează…” (după plată). */
export async function cancelSetup(
  input: Step & { reason: string; refund: boolean },
): Promise<LifecycleResult> {
  return run('cancelSetup', async () => {
    const h = await headers();
    if (input.refund) await refundSetupRequest({ founderHeaders: h, ...input });
    else await cancelSetupByFounder({ founderHeaders: h, ...input });
  });
}
