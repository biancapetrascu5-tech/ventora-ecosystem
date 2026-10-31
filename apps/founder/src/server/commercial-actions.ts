'use server';

import { headers } from 'next/headers';
import {
  addApplicationToSubscription,
  createAddon,
  createDiscount,
  createOverride,
  endDiscount,
  endOverride,
  extendOverride,
  getBusinessCommercialForFounder,
  getDiscountLineNamesForFounder,
  getIncludedMembersForFounder,
  getRegistry,
  getUsageTotalsForFounder,
  listActiveDiscountsForFounder,
  listAddonsForFounder,
  listApplicationsForFounder,
  listBusinessUsageForFounder,
  listExpiringOverridesForFounder,
  listPlansForFounder,
  listRequestsForFounder,
  listSubscriptionsForFounder,
  refuseRequest,
  resolveRequest,
  setApplicationActivationMode,
  setApplicationPrices,
  setApplicationQuotas,
  stopAddonSales,
  updateAddon,
  updateDiscount,
  type DiscountDurationInput,
  type DiscountTarget,
  type DiscountValue,
} from '@ventora/commercial';
import { getFounderNames } from '@ventora/identity';
import { listBusinessesForFounder } from '@ventora/access';
import { reportActionError } from './report-error';

/* Lotul 3.4: modelul comercial în Founder (D3-24: aplicațiile la bucată, pachetele, consumul,
   cererile din Hub, reducerile, partea comercială a unei afaceri, „Prezentare”). Sesiunea Founder
   vine din cookie (requireFounderSession în core/commercial, cu 2FA); fiecare scriere are rândul
   ei de audit pe persoana Founder, în aceeași tranzacție. Acțiunile nu înghit erori: o eroare
   ajunge în jurnalul serverului (și în Sentry, dacă nu e așteptată) și înapoi în ecran, ca
   rezultat cu câmpul greșit, dacă există. Datele trec spre ecrane fără Date (ISO). */

export type ActionResult = { ok: true } | { ok: false; field?: string; conflict?: boolean };

async function founderHeaders(): Promise<Headers> {
  return headers();
}

function fail(action: string, err: unknown): ActionResult {
  reportActionError(action, err);
  const e = err as { code?: string; field?: string };
  if (e.code === 'INVALID_INPUT') return { ok: false, field: e.field };
  if (e.code === 'CONFLICT') return { ok: false, conflict: true };
  return { ok: false };
}

async function run(action: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return fail(action, err);
  }
}

/** Numele afacerilor (lista din core/access), pentru coloanele „Afacerea”. */
async function businessNames(h: Headers) {
  const list = await listBusinessesForFounder({ founderHeaders: h });
  return Object.fromEntries(list.map((b) => [b.id, { name: b.name, owner: b.owner }]));
}

/** „Cereri · {n}” în Spine. */
export async function readNewRequestsCount(): Promise<number> {
  try {
    const rows = await listRequestsForFounder({
      founderHeaders: await founderHeaders(),
      onlyNew: true,
    });
    return rows.length;
  } catch (err) {
    reportActionError('readNewRequestsCount', err);
    return 0;
  }
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────

export type QuotaInfo = { key: string; kind: 'flow' | 'stock'; unit: string };

async function quotaKeys(): Promise<QuotaInfo[]> {
  const r = await getRegistry('founder');
  return r.quotas.map((q) => ({ key: q.key, kind: q.kind, unit: q.unit }));
}

/** Cheile cotelor din registru („Adaugă o excepție”: ce schimbi). */
export async function readQuotaKeys(): Promise<QuotaInfo[] | null> {
  try {
    return await quotaKeys();
  } catch (err) {
    reportActionError('readQuotaKeys', err);
    return null;
  }
}

// ── FounderPacks ───────────────────────────────────────────────────────────────────────────

export type PackData = {
  id: string;
  name: string;
  quotaKey: string;
  quantity: number;
  validity: 'current_month' | 'monthly';
  purchaseMode: 'direct' | 'on_request';
  stopped: boolean;
  prices: { currency: 'RON' | 'EUR'; amountMinor: number; setupMinor: number }[];
  plans: string[];
  allPlans: boolean;
  /** S117 „Disponibil pentru”: aplicația cotei; null = toate afacerile. */
  applicationId: string | null;
};

export type PacksData = {
  packs: PackData[];
  plans: { id: string; name: string }[];
  quotas: QuotaInfo[];
};

export async function readPacks(): Promise<PacksData | null> {
  try {
    const h = await founderHeaders();
    const [addons, plans, quotas] = await Promise.all([
      listAddonsForFounder({ founderHeaders: h }),
      listPlansForFounder({ founderHeaders: h }),
      quotaKeys(),
    ]);
    const planName = new Map(plans.map((p) => [p.id, p.name]));
    return {
      packs: addons.map((a) => ({
        id: a.id,
        name: a.name,
        quotaKey: a.quotaKey,
        quantity: a.quantity,
        validity: a.validity,
        purchaseMode: a.purchaseMode,
        stopped: !!a.salesStoppedAt,
        prices: a.prices,
        plans: a.eligiblePlanIds.map((id) => planName.get(id) ?? '').filter(Boolean),
        allPlans: plans.length > 0 && plans.every((p) => a.eligiblePlanIds.includes(p.id)),
        applicationId: a.applicationId,
      })),
      plans: plans.map((p) => ({ id: p.id, name: p.name })),
      quotas,
    };
  } catch (err) {
    reportActionError('readPacks', err);
    return null;
  }
}

export type PackInput = {
  id?: string;
  name: string;
  quotaKey: string;
  quantity: number;
  validity: 'current_month' | 'monthly';
  purchaseMode: 'direct' | 'on_request';
  prices: { currency: 'RON' | 'EUR'; amountMinor: number; setupMinor: number }[];
  /** Un pachet nou: pe toate planurile (D3-24: eligibilitatea pe bundle vine cu S117). */
  eligiblePlanIds?: string[];
};

export async function savePack(input: PackInput): Promise<ActionResult> {
  const h = await founderHeaders();
  const setup = input.prices.some((p) => p.setupMinor > 0);
  const mode = setup ? 'on_request' : input.purchaseMode;
  if (input.id) {
    return run('updateAddon', () =>
      updateAddon({
        founderHeaders: h,
        addonId: input.id!,
        purchaseMode: mode,
        validity: input.validity,
        prices: input.prices,
      }),
    );
  }
  return run('createAddon', async () => {
    const plans = await listPlansForFounder({ founderHeaders: h });
    await createAddon({
      founderHeaders: h,
      code: `${input.quotaKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${input.quantity}-${Date.now().toString(36)}`,
      name: input.name,
      quotaKey: input.quotaKey,
      quantity: input.quantity,
      validity: input.validity,
      purchaseMode: mode,
      prices: input.prices,
      eligiblePlanIds: input.eligiblePlanIds ?? plans.map((p) => p.id),
    });
  });
}

export async function stopPack(id: string): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('stopAddonSales', () => stopAddonSales({ founderHeaders: h, addonId: id }));
}

// ── FounderApps ────────────────────────────────────────────────────────────────────────────

export type AppData = {
  id: string;
  activationMode: 'direct' | 'on_request';
  prices: { currency: 'RON' | 'EUR'; kind: 'month' | 'year' | 'setup'; amountMinor: number }[];
  quotas: Record<string, number | null>;
};

export async function readApps(): Promise<{
  apps: AppData[];
  quotas: QuotaInfo[];
  includedMembers: number;
} | null> {
  try {
    const h = await founderHeaders();
    const [apps, quotas, includedMembers] = await Promise.all([
      listApplicationsForFounder({ founderHeaders: h }),
      quotaKeys(),
      getIncludedMembersForFounder({ founderHeaders: h }),
    ]);
    return {
      apps: apps.map((a) => ({
        id: a.id,
        activationMode: a.activationMode,
        prices: a.prices,
        quotas: a.quotas,
      })),
      quotas,
      includedMembers,
    };
  } catch (err) {
    reportActionError('readApps', err);
    return null;
  }
}

export async function setAppMode(id: string, direct: boolean): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('setApplicationActivationMode', () =>
    setApplicationActivationMode({
      founderHeaders: h,
      applicationId: id,
      mode: direct ? 'direct' : 'on_request',
    }),
  );
}

export async function saveAppPrices(input: {
  id: string;
  prices: { currency: 'RON' | 'EUR'; kind: 'month' | 'year' | 'setup'; amountMinor: number }[];
  quotas: Record<string, number | null>;
}): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('saveAppPrices', async () => {
    await setApplicationPrices({
      founderHeaders: h,
      applicationId: input.id,
      prices: input.prices,
    });
    await setApplicationQuotas({
      founderHeaders: h,
      applicationId: input.id,
      quotas: input.quotas,
    });
  });
}

// ── FounderUsage, FounderBusinesses (consumul peste afaceri) ───────────────────────────────

export type BusinessUsageData = {
  organizationId: string;
  business: string;
  quotas: {
    key: string;
    used: number;
    limit: number | null;
    estimate: { state: 'reached' | 'date' | 'too_early' | 'none'; date?: string };
  }[];
  top: { key: string; pct: number } | null;
};

export async function readBusinessUsage(): Promise<BusinessUsageData[] | null> {
  try {
    const h = await founderHeaders();
    const [usage, names] = await Promise.all([
      listBusinessUsageForFounder({ founderHeaders: h }),
      businessNames(h),
    ]);
    return usage.map((u) => ({
      organizationId: u.organizationId,
      business: names[u.organizationId]?.name ?? '',
      quotas: u.quotas.map((q) => ({
        key: q.key,
        used: q.used,
        limit: q.limit,
        estimate: q.estimate,
      })),
      top: u.top,
    }));
  } catch (err) {
    reportActionError('readBusinessUsage', err);
    return null;
  }
}

export type UsageTotalsData = {
  from: string;
  to: string;
  totals: { key: string; amount: number; previous: number }[];
  daily: { day: string; amount: number }[];
  addonsSold: number;
};

export async function readUsageTotals(): Promise<UsageTotalsData | null> {
  try {
    return await getUsageTotalsForFounder({
      founderHeaders: await founderHeaders(),
      dailyKey: 'messaging.sms',
    });
  } catch (err) {
    reportActionError('readUsageTotals', err);
    return null;
  }
}

/** FounderBusinesses: ce cere atenție din abonament — perioada de probă în curs (D3-5). */
export async function readSubscriptionSignals(): Promise<
  { organizationId: string; trialEndsAt: string | null }[] | null
> {
  try {
    const subs = await listSubscriptionsForFounder({ founderHeaders: await founderHeaders() });
    return subs.map((x) => ({
      organizationId: x.organizationId,
      trialEndsAt:
        x.status === 'trialing' && x.trialEndsAt && x.trialEndsAt > new Date()
          ? x.trialEndsAt.toISOString()
          : null,
    }));
  } catch (err) {
    reportActionError('readSubscriptionSignals', err);
    return null;
  }
}

// ── FounderRequests ────────────────────────────────────────────────────────────────────────

export type RequestData = {
  id: string;
  organizationId: string;
  business: string;
  kind: 'activation' | 'plan_change';
  targetType: 'addon' | 'application' | 'plan';
  /** Numele pachetului sau al planului; pentru o aplicație, id-ul ei (APPS). */
  item: string;
  who: string;
  createdAt: string;
  status: 'new' | 'resolved' | 'refused';
};

export async function readRequests(): Promise<RequestData[] | null> {
  try {
    const h = await founderHeaders();
    const [rows, names, addons, plans] = await Promise.all([
      listRequestsForFounder({ founderHeaders: h }),
      businessNames(h),
      listAddonsForFounder({ founderHeaders: h }),
      listPlansForFounder({ founderHeaders: h }),
    ]);
    const addonName = new Map(addons.map((a) => [a.id, a.name]));
    const planName = new Map(plans.map((p) => [p.id, p.name]));
    return rows.map((r) => {
      const biz = names[r.organizationId];
      return {
        id: r.id,
        organizationId: r.organizationId,
        business: biz?.name ?? '',
        kind: r.kind,
        targetType: r.targetType,
        item:
          r.targetType === 'addon'
            ? (addonName.get(r.targetId) ?? '')
            : r.targetType === 'plan'
              ? (planName.get(r.targetId) ?? '')
              : r.targetId,
        // D3-8: only the owner asks, so the person is the business's owner
        who: biz?.owner?.userId === r.requestedByUserId ? biz.owner.name : '',
        createdAt: r.createdAt.toISOString(),
        status: r.status,
      };
    });
  } catch (err) {
    reportActionError('readRequests', err);
    return null;
  }
}

export async function markRequestResolved(
  organizationId: string,
  id: string,
): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('resolveRequest', () =>
    resolveRequest({ founderHeaders: h, organizationId, requestId: id }),
  );
}

export async function refuseRequestWithReason(
  organizationId: string,
  id: string,
  reason: string,
): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('refuseRequest', () =>
    refuseRequest({ founderHeaders: h, organizationId, requestId: id, reason }),
  );
}

// ── „Reduceri” ─────────────────────────────────────────────────────────────────────────────

export type ActiveDiscountData = {
  id: string;
  organizationId: string;
  business: string;
  scope: 'subscription' | 'application' | 'addon';
  lineName: string | null;
  kind: 'percent' | 'amount';
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: 'RON' | 'EUR';
  duration: 'once' | 'repeating' | 'forever';
  createdAt: string;
  reason: string;
  by: string;
};

export async function readActiveDiscounts(): Promise<ActiveDiscountData[] | null> {
  try {
    const h = await founderHeaders();
    const [rows, names] = await Promise.all([
      listActiveDiscountsForFounder({ founderHeaders: h }),
      businessNames(h),
    ]);
    const lines = await getDiscountLineNamesForFounder({
      founderHeaders: h,
      lines: rows
        .filter((r) => r.lineId)
        .map((r) => ({ organizationId: r.organizationId, lineId: r.lineId! })),
    });
    const founders = await getFounderNames(rows.map((r) => r.createdByFounderId));
    return rows.map((r) => ({
      id: r.discountId,
      organizationId: r.organizationId,
      business: names[r.organizationId]?.name ?? '',
      scope: r.scope,
      lineName: r.lineId ? (lines[r.lineId] ?? null) : null,
      kind: r.kind,
      percentOff: r.percentOff,
      amountOffMinor: r.amountOffMinor,
      currency: r.currency,
      duration: r.duration,
      createdAt: r.createdAt.toISOString(),
      reason: r.reason,
      by: founders[r.createdByFounderId] ?? '',
    }));
  } catch (err) {
    reportActionError('readActiveDiscounts', err);
    return null;
  }
}

// ── O afacere: partea comercială ───────────────────────────────────────────────────────────

export type BusinessCommercialData = {
  currency: 'RON' | 'EUR';
  subscription: null | {
    planName: string | null;
    versionNumber: number | null;
    interval: 'month' | 'year';
    status: string;
    priceMinor: number;
    nextBillingDate: string;
    quotaPeriod: { start: string; end: string };
    anchorDay: number;
    trialEndsAt: string | null;
  };
  applications: string[];
  quotas: (BusinessUsageData['quotas'][number] & { planLimit: number | null })[];
  overrides: {
    id: string;
    quotaKey: string | null;
    limit: number | null;
    planLimit: number | null;
    reason: string;
    expiresAt: string;
    createdAt: string;
    by: string;
  }[];
  discounts: {
    id: string;
    scope: 'subscription' | 'application' | 'addon';
    lineId: string | null;
    kind: 'percent' | 'amount';
    percentOff: number | null;
    amountOffMinor: number | null;
    duration: 'once' | 'repeating' | 'forever';
    durationMonths: number | null;
    firstInvoiceOn: string;
    lastInvoiceOn: string | null;
    reason: string;
    createdAt: string;
    by: string;
  }[];
  lines: {
    id: string;
    type: 'application' | 'addon';
    key: string;
    name: string;
    amountMinor: number;
  }[];
  nextInvoice: null | {
    date: string;
    lines: { kind: 'plan' | 'application' | 'addon'; lineId: string | null; amountMinor: number }[];
    subtotalMinor: number;
    totalMinor: number;
  };
};

export async function readBusinessCommercial(
  organizationId: string,
): Promise<BusinessCommercialData | null> {
  try {
    const h = await founderHeaders();
    const b = await getBusinessCommercialForFounder({ founderHeaders: h, organizationId });
    const founders = await getFounderNames([
      ...b.overrides.map((o) => o.createdByFounderId),
      ...b.discounts.map((d) => d.createdByFounderId),
    ]);
    return {
      currency: b.currency,
      subscription: b.subscription && {
        planName: b.subscription.planName,
        versionNumber: b.subscription.versionNumber,
        interval: b.subscription.interval,
        status: b.subscription.status,
        priceMinor: b.subscription.priceMinor,
        nextBillingDate: b.subscription.nextBillingDate,
        quotaPeriod: b.subscription.quotaPeriod,
        anchorDay: b.subscription.anchorDay,
        trialEndsAt: b.subscription.trialEndsAt,
      },
      applications: b.applications,
      quotas: b.quotas.map((q) => ({
        key: q.key,
        used: q.used,
        limit: q.limit,
        planLimit: q.planLimit,
        estimate: q.estimate,
      })),
      overrides: b.overrides
        .filter((o) => o.kind === 'quota')
        .map((o) => ({
          id: o.id,
          quotaKey: o.quotaKey,
          limit: o.limit,
          planLimit: o.planLimit,
          reason: o.reason,
          expiresAt: o.expiresAt.toISOString(),
          createdAt: o.createdAt.toISOString(),
          by: founders[o.createdByFounderId] ?? '',
        })),
      discounts: b.discounts.map((d) => ({
        id: d.id,
        scope: d.scope,
        lineId: d.lineId,
        kind: d.kind,
        percentOff: d.percentOff,
        amountOffMinor: d.amountOffMinor,
        duration: d.duration,
        durationMonths: d.durationMonths,
        firstInvoiceOn: d.firstInvoiceOn,
        lastInvoiceOn: d.lastInvoiceOn,
        reason: d.reason,
        createdAt: d.createdAt.toISOString(),
        by: founders[d.createdByFounderId] ?? '',
      })),
      lines: b.lines.map((l) => ({
        id: l.id,
        type: l.type,
        key: l.key,
        name: l.name,
        amountMinor: l.amountMinor,
      })),
      nextInvoice: b.nextInvoice && {
        date: b.nextInvoice.date,
        lines: b.nextInvoice.lines.map((l) => ({
          kind: l.kind,
          lineId: l.lineId,
          amountMinor: l.amountMinor,
        })),
        subtotalMinor: b.nextInvoice.subtotalMinor,
        totalMinor: b.nextInvoice.totalMinor,
      },
    };
  } catch (err) {
    reportActionError('readBusinessCommercial', err);
    return null;
  }
}

export async function addException(input: {
  organizationId: string;
  quotaKey: string;
  limit: number;
  expiresAt: string;
  reason: string;
}): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('createOverride', () =>
    createOverride({
      founderHeaders: h,
      organizationId: input.organizationId,
      kind: 'quota',
      quotaKey: input.quotaKey,
      limit: input.limit,
      reason: input.reason,
      expiresAt: new Date(input.expiresAt),
    }),
  );
}

export async function extendException(input: {
  organizationId: string;
  overrideId: string;
  expiresAt: string;
}): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('extendOverride', () =>
    extendOverride({
      founderHeaders: h,
      organizationId: input.organizationId,
      overrideId: input.overrideId,
      expiresAt: new Date(input.expiresAt),
    }),
  );
}

export async function endException(
  organizationId: string,
  overrideId: string,
): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('endOverride', () => endOverride({ founderHeaders: h, organizationId, overrideId }));
}

export async function addDiscount(input: {
  organizationId: string;
  target: DiscountTarget;
  value: DiscountValue;
  duration: DiscountDurationInput;
  reason: string;
}): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('createDiscount', () => createDiscount({ founderHeaders: h, ...input }));
}

export async function editDiscount(input: {
  organizationId: string;
  discountId: string;
  value: DiscountValue;
  reason: string;
}): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('updateDiscount', () => updateDiscount({ founderHeaders: h, ...input }));
}

export async function finishDiscount(
  organizationId: string,
  discountId: string,
): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('endDiscount', () => endDiscount({ founderHeaders: h, organizationId, discountId }));
}

/** O aplicație la bucată adăugată la abonamentul afacerii (D3-24, după o cerere rezolvată). */
export async function addAppLine(
  organizationId: string,
  applicationId: string,
): Promise<ActionResult> {
  const h = await founderHeaders();
  return run('addApplicationToSubscription', () =>
    addApplicationToSubscription({ founderHeaders: h, organizationId, applicationId }),
  );
}

// ── „Prezentare” ───────────────────────────────────────────────────────────────────────────

export type ExpiringData = {
  id: string;
  organizationId: string;
  business: string;
  quotaKey: string | null;
  limit: number | null;
  expiresAt: string;
};

export async function readExpiringExceptions(): Promise<ExpiringData[] | null> {
  try {
    const h = await founderHeaders();
    const [rows, names] = await Promise.all([
      listExpiringOverridesForFounder({ founderHeaders: h }),
      businessNames(h),
    ]);
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      business: names[r.organizationId]?.name ?? '',
      quotaKey: r.quotaKey,
      limit: r.limit,
      expiresAt: r.expiresAt.toISOString(),
    }));
  } catch (err) {
    reportActionError('readExpiringExceptions', err);
    return null;
  }
}
