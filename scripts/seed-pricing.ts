/**
 * seed-pricing.ts — D3-1, the launch prices for 2027 (docs/plans/PRETURI-2027.md, approved by the
 * founder on 03.11.2026).
 *
 * Writes the prices through the Founder contracts of core/commercial only, the same ones the
 * Founder screens call (no SQL on the tables, no new commercial code): a real Founder session with
 * 2FA, commercial_founder on founder_runtime, an audit row for every change.
 *
 *   - the 13 applications: monthly, yearly (12 × monthly × 0.85, whole lei / euro) and setup, in lei
 *     and euro; „La cerere”; their limits only on the keys that already exist;
 *   - the bundles Programări, Echipă, Operațiuni, Complet (plan + published version 1, open sale
 *     period): applications, prices, setup, the extra seats;
 *   - the packs in plus;
 *   - included_members stays 3 (checked, never written).
 *
 * Idempotent: it reads everything first. A value already there and equal is left alone; a value
 * there and different stops the script before it writes anything (nothing is overwritten). A
 * second run changes nothing.
 *
 * Usage (the founder's Founder session, from the Founder app's cookie; never logged):
 *   FOUNDER_SESSION_COOKIE='<name>=<value>' pnpm tsx scripts/seed-pricing.ts           # check only
 *   FOUNDER_SESSION_COOKIE='<name>=<value>' pnpm tsx scripts/seed-pricing.ts --apply   # write
 * It also needs what the Founder app needs: DATABASE_URL_FOUNDER, DATABASE_URL, FOUNDER_AUTH_SECRET,
 * BETTER_AUTH_SECRET.
 */

import {
  closeCommercialPools,
  createAddon,
  createPlan,
  createPlanVersion,
  getIncludedMembersForFounder,
  listAddonsForFounder,
  listApplicationsForFounder,
  listPlansForFounder,
  publishVersion,
  setApplicationActivationMode,
  setApplicationPrices,
  setApplicationQuotas,
  setOfferPeriod,
  updateDraftVersion,
} from '../core/commercial/src/index.js';

type Currency = 'RON' | 'EUR';
type Kind = 'month' | 'year' | 'setup';
type Price = { currency: Currency; kind: Kind; amountMinor: number };
type Quotas = Record<string, number | null>;

// ── The approved values (PRETURI-2027.md), in whole lei and euro ─────────────────────────────

/** D3-1: yearly = 12 × monthly × 0.85, rounded to the whole leu / euro. */
export const yearly = (monthly: number) => Math.round(12 * monthly * 0.85);

const money = (lei: number, eur: number, kind: Kind): Price[] => [
  { currency: 'RON', kind, amountMinor: lei * 100 },
  { currency: 'EUR', kind, amountMinor: eur * 100 },
];

/** Monthly, yearly and setup, in lei and euro. */
function prices(monthly: [number, number], setup: [number, number]): Price[] {
  return [
    ...money(monthly[0], monthly[1], 'month'),
    ...money(yearly(monthly[0]), yearly(monthly[1]), 'year'),
    ...money(setup[0], setup[1], 'setup'),
  ];
}

export interface AppPricing {
  /** The registry id (commercial.application). */
  id: string;
  /** The name in the approved list (checked against the registry). */
  name: string;
  prices: Price[];
  /** Only the keys that exist in the registry today. */
  quotas: Quotas;
}

export const APPS: readonly AppPricing[] = [
  {
    id: 'booking',
    name: 'EasyBook',
    prices: prices([195, 39], [495, 99]),
    quotas: { 'booking.appointments': 1000 },
  },
  { id: 'crm', name: 'ClientDesk', prices: prices([195, 39], [495, 99]), quotas: {} },
  { id: 'finance', name: 'MoneyDesk', prices: prices([225, 45], [495, 99]), quotas: {} },
  { id: 'hr', name: 'TeamSpace', prices: prices([245, 49], [745, 149]), quotas: {} },
  { id: 'shifts', name: 'ShiftPlan', prices: prices([145, 29], [395, 79]), quotas: {} },
  { id: 'projects', name: 'TaskBoard', prices: prices([145, 29], [395, 79]), quotas: {} },
  { id: 'inventory', name: 'StockDesk', prices: prices([195, 39], [495, 99]), quotas: {} },
  {
    id: 'documents',
    name: 'DocSpace',
    prices: prices([145, 29], [395, 79]),
    quotas: { 'documents.storage': 20 },
  },
  { id: 'contracts', name: 'ContractDesk', prices: prices([195, 39], [495, 99]), quotas: {} },
  {
    id: 'events',
    name: 'EventSpace',
    prices: prices([195, 39], [495, 99]),
    quotas: { 'events.active': 20 },
  },
  { id: 'assets', name: 'AssetDesk', prices: prices([195, 39], [495, 99]), quotas: {} },
  {
    id: 'marketing',
    name: 'CampaignKit',
    prices: prices([175, 35], [395, 79]),
    quotas: { 'marketing.campaigns': 20, 'messaging.email': 2000 },
  },
  {
    id: 'analytics',
    name: 'DataView',
    prices: prices([175, 35], [395, 79]),
    quotas: { 'ai.analyses': 20 },
  },
];

/** D3-1: every application on „La cerere” for now (assisted sale). */
export const APP_MODE = 'on_request' as const;

export interface BundlePricing {
  code: string;
  name: string;
  applications: string[];
  prices: Price[];
  /** The seats in the team the bundle adds on top of the 3 every account includes. */
  extraSeats: number;
}

const ALL_APPS = APPS.map((a) => a.id);

export const BUNDLES: readonly BundlePricing[] = [
  {
    code: 'programari',
    name: 'Programări',
    applications: ['booking', 'crm'],
    prices: prices([369, 74], [890, 178]),
    extraSeats: 2,
  },
  {
    code: 'echipa',
    name: 'Echipă',
    applications: ['hr', 'shifts', 'projects'],
    prices: prices([479, 96], [1380, 276]),
    extraSeats: 7,
  },
  {
    code: 'operatiuni',
    name: 'Operațiuni',
    applications: ['inventory', 'assets', 'contracts', 'documents'],
    prices: prices([655, 131], [1595, 319]),
    extraSeats: 2,
  },
  {
    code: 'complet',
    name: 'Complet',
    applications: ALL_APPS,
    prices: prices([1940, 388], [5340, 1068]),
    extraSeats: 7,
  },
];

/**
 * What a bundle version includes. An application inside a bundle does not bring the limits it has
 * à la carte (entitlements.ts: those count only for à la carte lines), so the bundle carries them:
 * the limits of its applications, the extra seats (`platform.members`, added to the 3 included),
 * and the 1 location every account includes (`platform.locations`; no setting includes it outside
 * a bundle — see the report). DE VALIDAT: the approved list gives the bundles no limits of their own.
 */
export function bundleQuotas(bundle: BundlePricing): Quotas {
  const quotas: Quotas = { 'platform.members': bundle.extraSeats, 'platform.locations': 1 };
  for (const app of APPS.filter((a) => bundle.applications.includes(a.id))) {
    Object.assign(quotas, app.quotas);
  }
  return quotas;
}

export interface PackPricing {
  code: string;
  name: string;
  quotaKey: string;
  quantity: number;
  /** „pe lună” → monthly; without it, for the current month only. */
  validity: 'monthly' | 'current_month';
  ron: number;
  eur: number;
}

export const PACKS: readonly PackPricing[] = [
  {
    code: 'loc-echipa-1',
    name: '+1 loc în echipă',
    quotaKey: 'platform.members',
    quantity: 1,
    validity: 'monthly',
    ron: 35,
    eur: 7,
  },
  {
    code: 'locatie-1',
    name: '+1 locație',
    quotaKey: 'platform.locations',
    quantity: 1,
    validity: 'monthly',
    ron: 125,
    eur: 25,
  },
  {
    code: 'sms-500',
    name: '+500 SMS',
    quotaKey: 'messaging.sms',
    quantity: 500,
    validity: 'current_month',
    ron: 75,
    eur: 15,
  },
  {
    code: 'email-1000',
    name: '+1.000 e-mailuri',
    quotaKey: 'messaging.email',
    quantity: 1000,
    validity: 'monthly',
    ron: 25,
    eur: 5,
  },
  {
    code: 'analize-ai-20',
    name: '+20 analize AI',
    quotaKey: 'ai.analyses',
    quantity: 20,
    validity: 'monthly',
    ron: 50,
    eur: 10,
  },
  {
    code: 'programari-500',
    name: '+500 programări',
    quotaKey: 'booking.appointments',
    quantity: 500,
    validity: 'monthly',
    ron: 49,
    eur: 10,
  },
  {
    code: 'spatiu-10gb',
    name: '+10 GB spațiu',
    quotaKey: 'documents.storage',
    quantity: 10,
    validity: 'monthly',
    ron: 25,
    eur: 5,
  },
];

/** DE VALIDAT: the list says nothing; on „La cerere” like the applications until Founder switches. */
export const PACK_MODE = 'on_request' as const;

export const INCLUDED_MEMBERS = 3;

/** Approved but not expressible with the existing model (see docs/plans/PRETURI-2027.md). */
export const NOT_EXPRESSIBLE = [
  '„Funnel realizat de echipă” (2.500 lei / 500 €, o singură dată, „La cerere”): un pachet are o cheie de limită și o cantitate; un serviciu făcut de echipă nu are cheie (funnel.pages.published numără paginile publicate, iar un pachet „o singură dată” ar ține doar luna curentă).',
  '1 locație inclusă în orice cont: nu există o setare „locații incluse” (ca included_members); se poate pune doar în bundle-uri (platform.locations = 1), nu și conturilor doar cu aplicații la bucată.',
  'Motivul „D3-1, prețurile de lansare 2027” în audit: contractele Founder nu primesc un motiv; rândurile de audit se scriu normal, fără el.',
  'O singură tranzacție pentru tot: fiecare contract Founder își deschide tranzacția lui; scriptul verifică tot înainte de prima scriere și e idempotent (o rulare întreruptă se reia).',
];

// ── Comparison helpers ─────────────────────────────────────────────────────────────────────

const priceKey = (p: {
  currency: string;
  kind?: string;
  amountMinor: number;
  setupMinor?: number;
}) => `${p.currency}:${p.kind ?? ''}:${p.amountMinor}:${p.setupMinor ?? 0}`;
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const samePrices = (a: readonly Price[], b: readonly Price[]) =>
  sameSet(a.map(priceKey), b.map(priceKey));
const sameQuotas = (a: Quotas, b: Quotas) =>
  sameSet(
    Object.entries(a).map(([k, v]) => `${k}=${v}`),
    Object.entries(b).map(([k, v]) => `${k}=${v}`),
  );

export type Step = { what: string; run: () => Promise<unknown> };

export interface SeedReport {
  /** What would be written (check) or was written (apply). */
  steps: string[];
  /** Already there and equal. */
  unchanged: string[];
  /** Already there and different: the script stopped before writing anything. */
  conflicts: string[];
  /** Applications of the list missing from the registry: skipped, not created. */
  missingApplications: string[];
  /** platform.locations today, for the report. */
  locations: string;
  includedMembers: number;
  notExpressible: readonly string[];
  applied: boolean;
}

export class PricingConflict extends Error {
  constructor(readonly report: SeedReport) {
    super(
      `[seed-pricing] ${report.conflicts.length} value(s) already set differently; nothing written`,
    );
    this.name = 'PricingConflict';
  }
}

/** Reads the state, plans the writes, stops on any difference; writes only with `apply`. */
export async function seedPricing(
  founderHeaders: () => Headers,
  options: { apply: boolean },
): Promise<SeedReport> {
  const h = () => ({ founderHeaders: founderHeaders() });
  const [apps, plans, addons, includedMembers] = await Promise.all([
    listApplicationsForFounder(h()),
    listPlansForFounder(h()),
    listAddonsForFounder(h()),
    getIncludedMembersForFounder(h()),
  ]);
  const report: SeedReport = {
    steps: [],
    unchanged: [],
    conflicts: [],
    missingApplications: [],
    locations: '',
    includedMembers,
    notExpressible: NOT_EXPRESSIBLE,
    applied: false,
  };
  const steps: Step[] = [];
  const step = (what: string, run: () => Promise<unknown>) => steps.push({ what, run });

  // included_members stays 3: checked, never written
  if (includedMembers === INCLUDED_MEMBERS)
    report.unchanged.push(`included_members = ${INCLUDED_MEMBERS}`);
  else report.conflicts.push(`included_members = ${includedMembers}, nu ${INCLUDED_MEMBERS}`);

  // platform.locations: what includes it today (for the report)
  const appsWithLocations = apps.filter((a) => 'platform.locations' in a.quotas).map((a) => a.id);
  const bundlesWithLocations = plans
    .filter((p) => p.versions.some((v) => v.publishedAt && 'platform.locations' in v.terms.quotas))
    .map((p) => p.code);
  report.locations =
    `cheia platform.locations: în ${appsWithLocations.length} aplicații (${appsWithLocations.join(', ') || '—'}), ` +
    `în ${bundlesWithLocations.length} bundle-uri publicate (${bundlesWithLocations.join(', ') || '—'}); ` +
    'nicio setare de locații incluse';

  // ── Applications ─────────────────────────────────────────────────────────────────────────
  const known = new Map(apps.map((a) => [a.id, a]));
  for (const want of APPS) {
    const app = known.get(want.id);
    if (!app) {
      report.missingApplications.push(`${want.name} (${want.id})`);
      continue;
    }
    if (app.name !== want.name) {
      report.conflicts.push(`${want.id}: numele în registru e „${app.name}”, nu „${want.name}”`);
      continue;
    }
    const priced = app.prices.length > 0;
    if (!priced) {
      step(`${want.name}: prețuri (lunar, anual, implementare; lei și euro)`, () =>
        setApplicationPrices({ ...h(), applicationId: want.id, prices: want.prices }),
      );
    } else if (samePrices(app.prices, want.prices)) report.unchanged.push(`${want.name}: prețuri`);
    else report.conflicts.push(`${want.name}: are deja alte prețuri`);

    if (Object.keys(app.quotas).length === 0) {
      if (Object.keys(want.quotas).length > 0) {
        step(`${want.name}: limite ${JSON.stringify(want.quotas)}`, () =>
          setApplicationQuotas({ ...h(), applicationId: want.id, quotas: want.quotas }),
        );
      } else report.unchanged.push(`${want.name}: fără limite pe chei existente`);
    } else if (sameQuotas(app.quotas, want.quotas)) report.unchanged.push(`${want.name}: limite`);
    else report.conflicts.push(`${want.name}: are deja alte limite ${JSON.stringify(app.quotas)}`);

    if (app.activationMode === APP_MODE) report.unchanged.push(`${want.name}: „La cerere”`);
    else if (!priced) {
      step(`${want.name}: „La cerere”`, () =>
        setApplicationActivationMode({ ...h(), applicationId: want.id, mode: APP_MODE }),
      );
    } else report.conflicts.push(`${want.name}: e deja pe „Direct”, cu prețuri puse`);
  }

  // ── Bundles: plan + version 1, published, open sale period ───────────────────────────────
  const missing = new Set(report.missingApplications.map((m) => m.match(/\((.+)\)$/)![1]!));
  for (const want of BUNDLES) {
    if (want.applications.some((a) => missing.has(a))) {
      report.conflicts.push(`bundle ${want.name}: are aplicații care lipsesc din registru`);
      continue;
    }
    const terms = {
      applications: want.applications,
      features: [] as string[],
      quotas: bundleQuotas(want),
      prices: want.prices,
    };
    const matches = (t: {
      applications: readonly string[];
      features: readonly string[];
      quotas: Readonly<Quotas>;
      prices: ReadonlyArray<{ currency: string; kind: string; amountMinor: number }>;
    }) =>
      sameSet(t.applications, terms.applications) &&
      t.features.length === 0 &&
      sameQuotas(t.quotas, terms.quotas) &&
      samePrices(t.prices as Price[], terms.prices);
    const plan = plans.find((p) => p.code === want.code);
    if (!plan) {
      step(`bundle ${want.name}: plan, versiunea 1, perioada deschisă, publicare`, async () => {
        const { planId } = await createPlan({ ...h(), code: want.code, name: want.name });
        const { versionId } = await createPlanVersion({ ...h(), planId });
        await updateDraftVersion({ ...h(), versionId, terms });
        await setOfferPeriod({ ...h(), versionId, availableFrom: null, availableUntil: null });
        await publishVersion({ ...h(), versionId });
      });
      continue;
    }
    if (plan.name !== want.name) {
      report.conflicts.push(`bundle ${want.code}: numele e „${plan.name}”, nu „${want.name}”`);
      continue;
    }
    if (plan.salesStoppedAt) {
      report.conflicts.push(`bundle ${want.name}: vânzarea e oprită`);
      continue;
    }
    const published = plan.versions.filter((v) => v.publishedAt);
    const open = (v: { availableFrom: string | null; availableUntil: string | null }) =>
      v.availableUntil === null;
    if (published.length > 0) {
      const current = published.find((v) => v.current)!;
      if (published.length === 1 && matches(current.terms) && open(current)) {
        report.unchanged.push(`bundle ${want.name}`);
      } else report.conflicts.push(`bundle ${want.name}: are deja altă versiune publicată`);
      continue;
    }
    // only drafts: an interrupted earlier run — finish it if the draft is the same
    const draft = plan.versions.find((v) => matches(v.terms));
    if (plan.versions.length === 1 && draft) {
      step(`bundle ${want.name}: perioada deschisă și publicarea versiunii existente`, async () => {
        if (!open(draft) || draft.availableFrom !== null) {
          await setOfferPeriod({
            ...h(),
            versionId: draft.id,
            availableFrom: null,
            availableUntil: null,
          });
        }
        await publishVersion({ ...h(), versionId: draft.id });
      });
    } else report.conflicts.push(`bundle ${want.name}: are deja o ciornă diferită`);
  }

  // ── Packs ────────────────────────────────────────────────────────────────────────────────
  for (const want of PACKS) {
    const wantPrices = [
      { currency: 'RON' as const, amountMinor: want.ron * 100, setupMinor: 0 },
      { currency: 'EUR' as const, amountMinor: want.eur * 100, setupMinor: 0 },
    ];
    const addon = addons.find((a) => a.code === want.code);
    if (!addon) {
      step(`pachet ${want.name}`, () =>
        createAddon({
          ...h(),
          code: want.code,
          name: want.name,
          quotaKey: want.quotaKey,
          quantity: want.quantity,
          validity: want.validity,
          purchaseMode: PACK_MODE,
          prices: wantPrices,
          eligiblePlanIds: [],
        }),
      );
      continue;
    }
    const same =
      addon.name === want.name &&
      addon.quotaKey === want.quotaKey &&
      addon.quantity === want.quantity &&
      addon.validity === want.validity &&
      addon.purchaseMode === PACK_MODE &&
      !addon.salesStoppedAt &&
      sameSet(addon.prices.map(priceKey), wantPrices.map(priceKey));
    if (same) report.unchanged.push(`pachet ${want.name}`);
    else report.conflicts.push(`pachet ${want.code}: există deja, cu alte valori`);
  }

  report.steps = steps.map((s) => s.what);
  if (report.conflicts.length > 0) throw new PricingConflict(report);
  if (options.apply) {
    for (const s of steps) await s.run();
    report.applied = true;
  }
  return report;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  const cookie = process.env.FOUNDER_SESSION_COOKIE?.trim();
  if (!cookie) {
    throw new Error(
      'FOUNDER_SESSION_COOKIE is not set: sign in to Founder (with 2FA) and pass its session cookie',
    );
  }
  const apply = process.argv.includes('--apply');
  try {
    const report = await seedPricing(() => new Headers({ cookie }), { apply });
    console.log(JSON.stringify({ ...report, mode: apply ? 'apply' : 'check' }, null, 2));
  } catch (err) {
    if (err instanceof PricingConflict) {
      console.error(JSON.stringify({ ...err.report, mode: apply ? 'apply' : 'check' }, null, 2));
    }
    throw err;
  } finally {
    // the static import above: a dynamic import of the index here failed under tsx
    // („@ventora/contracts” without QuotaOverLimitV1), so every run exited 1 after correct writes
    await closeCommercialPools();
  }
}

if (process.argv[1] && /seed-pricing\.ts$/.test(process.argv[1])) {
  // the Founder session and the audit keep their own pools: exit when done
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[seed-pricing] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
