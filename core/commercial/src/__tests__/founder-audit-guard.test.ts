/**
 * Gardul F3 · O-6 (criteriul 6 din închiderea F3): fiecare acțiune de scriere a Founder din
 * `core/commercial` și `core/billing` e legată de codul ei `AuditActions` și are rândul de audit.
 *
 * Citește sursele de pe disc (fără bază de date):
 *  1. inventarul: orice funcție exportată care primește sesiunea Founder (`founderHeaders`,
 *     `FounderParams`, `FounderStep`), plus orice funcție din cele două module importată de
 *     `apps/founder`;
 *  2. fiecare intră într-o singură categorie: WRITES (cu codurile de audit), READS, SYSTEM
 *     (scriere fără decizia Founder) sau PURE (fără bază de date). O funcție nouă, neclasificată,
 *     pică testul;
 *  3. pentru WRITES, codul trebuie să fie emis în corpul funcției sau într-un ajutor din același
 *     fișier pe care îl apelează;
 *  4. pentru fiecare cod, un test de integrare trebuie să verifice rândul de audit (valoarea
 *     codului apare într-un `*.integration.test.ts` din cele două module).
 *
 * Golurile găsite la 06.11.2026 (raportul O-6) sunt reparate (07.11.2026): KNOWN_GAPS e goală.
 * Un gol nou se repară, nu se adaugă aici fără decizia fondatoarei.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuditActions } from '@ventora/audit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MODULES = ['core/commercial/src', 'core/billing/src'];
type Code = keyof typeof AuditActions;

/** Scrierile Founder și codurile de audit pe care trebuie să le emită. */
const WRITES: Record<string, Code[]> = {
  // core/commercial/src/founder.ts — modelul comercial (Lot 3.2–3.4)
  createPlan: ['commercialPlanCreated'],
  createPlanVersion: ['commercialVersionCreated'],
  updateDraftVersion: ['commercialVersionUpdated'],
  publishVersion: ['commercialVersionPublished'],
  setApplicationActivationMode: ['commercialApplicationModeChanged'],
  createAddon: ['commercialAddonCreated'],
  updateAddon: ['commercialAddonUpdated'],
  stopAddonSales: ['commercialAddonSalesStopped'],
  setBusinessCurrency: ['commercialCurrencySet'],
  assignSubscription: ['commercialSubscriptionAssigned'],
  scheduleVersionChange: ['commercialVersionChangeScheduled'],
  grantAddon: ['commercialAddonGranted'],
  endAddonGrant: ['commercialAddonGrantEnded'],
  createOverride: ['commercialOverrideCreated'],
  extendOverride: ['commercialOverrideExtended'],
  endOverride: ['commercialOverrideEnded'],
  setApplicationPrices: ['commercialApplicationPricesSet'],
  addApplicationToSubscription: ['commercialApplicationLineAdded'],
  endApplicationLine: ['commercialApplicationLineEnded'],
  createDiscount: ['commercialDiscountCreated'],
  updateDiscount: ['commercialDiscountUpdated'],
  endDiscount: ['commercialDiscountEnded'],
  setApplicationQuotas: ['commercialApplicationQuotasSet'],
  setOfferPeriod: ['commercialOfferPeriodSet'],
  stopBundleSales: ['commercialBundleSalesStopped'],
  setIncludedMembers: ['commercialSettingChanged'],
  // core/commercial/src/requests.ts — cererile din Hub (Lot 3.4)
  resolveRequest: ['commercialRequestResolved'],
  refuseRequest: ['commercialRequestRefused'],
  // core/commercial/src/lifecycle.ts — neplata și cererile cu implementare (Lot 3.8)
  resolveDunningByFounder: ['commercialDunningResolved'],
  sendSetupOffer: ['commercialSetupOfferSent'],
  confirmSetup: ['commercialSetupConfirmed'],
  markSetupPaidByFounder: ['commercialSetupPaid'],
  startSetupWork: ['commercialSetupWorkStarted'],
  goLiveSetup: ['commercialSetupLive', 'commercialApplicationLineAdded'],
  cancelSetupByFounder: ['commercialSetupCancelled'],
  refundSetupByFounder: ['commercialSetupRefunded'],
  // core/billing/src/lifecycle.ts — date de facturare, transfer, facturi (Lot 3.6–3.8)
  saveBillingProfile: ['billingProfileSaved'],
  setPaymentSettings: ['billingPaymentMethodSet'],
  confirmTransferReceipt: ['billingTransferReceived'],
  retryInvoice: ['billingInvoiceRetried'],
  markInvoiceManual: ['billingInvoiceManual'],
  createSetupTransferInvoice: ['billingTransferInvoiced'],
  // „Anulează și rambursează”: rambursarea (Stripe sau storno), apoi refundSetupByFounder
  // pe transfer și stornoul, cu rândul lui în billing (decizia 07.11.2026)
  refundSetupRequest: ['commercialSetupRefunded', 'billingTransferRefunded'],
};

/** Citiri: verifică sesiunea Founder, nu scriu. */
const READS = new Set([
  'listPlansForFounder',
  'listAddonsForFounder',
  'getPlanVersionForFounder',
  'listApplicationsForFounder',
  'listSubscriptionsForFounder',
  'getBusinessCommercialForFounder',
  'getDiscountLineNamesForFounder',
  'listBusinessUsageForFounder',
  'getUsageTotalsForFounder',
  'listActiveDiscountsForFounder',
  'listExpiringOverridesForFounder',
  'getIncludedMembersForFounder',
  'listForeverDiscounts',
  'listRequestsForFounder',
  'listDunningForFounder',
  'getSetupOfferDefaults',
  'getSetupRequestForFounder',
  'listSetupRequestsForFounder',
  'listFailedPaymentsForFounder',
  'listOpenDisputesForFounder',
  'listInvoicesNeedingAttentionForFounder',
  'getBillingProfileForFounder',
  'getPaymentSettingsForFounder',
  'listInvoicesForFounder',
  'getSavedCardLast4ForFounder',
]);

/** Scrieri pe care Founder le declanșează, dar fără o decizie a lui (sincronizare cu Stripe). */
const SYSTEM: Record<string, string> = {
  reconcileSubscription:
    'aduce abonamentul Stripe la zi după o acțiune Founder deja auditată; scrie ca sistem',
};

/** Fără bază de date: validări, adrese, registrul din cod. */
const PURE = new Set([
  'checkRegCom',
  'checkRomanianCui',
  'stripeDisputeUrl',
  'getRegistry',
  'setInvoiceApplicationNames',
  'commercialEntitlementProvider',
]);

/**
 * Golurile găsite la 06.11.2026 (raportul O-6), reparate pe 07.11.2026: lista e goală.
 * `noAudit`: scrierea nu emite codul. `untested`: codul e emis, dar niciun test de integrare
 * nu verifică rândul de audit.
 */
const KNOWN_GAPS: { noAudit: string[]; untested: Code[] } = {
  noAudit: [],
  untested: [],
};

// ── Citirea surselor ───────────────────────────────────────────────────────────────────────

interface Fn {
  name: string;
  file: string;
  exported: boolean;
  body: string;
}

function sourceFiles(dir: string, integration: boolean): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !e.name.endsWith('.ts')) continue;
    const full = path.join(e.parentPath, e.name);
    const isTest = full.includes(`${path.sep}__tests__${path.sep}`);
    if (integration ? e.name.endsWith('.integration.test.ts') : !isTest) out.push(full);
  }
  return out;
}

/**
 * Funcțiile de la nivelul fișierului: de la `function x(` până la primul `}` singur pe rândul
 * lui, pe coloana 0 (`}): Promise<…> {` închide doar tipul parametrilor).
 */
function functionsOf(file: string): Fn[] {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const re = /^(export )?(?:async )?function (\w+)\s*[<(]/gm;
  const end = /\n\}\n|\n\}$/g;
  const fns: Fn[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    end.lastIndex = m.index;
    const close = end.exec(src);
    fns.push({
      name: m[2]!,
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      exported: Boolean(m[1]),
      body: src.slice(m.index, close ? close.index + 2 : undefined),
    });
  }
  return fns;
}

const FUNCTIONS = MODULES.flatMap((d) => sourceFiles(d, false)).flatMap(functionsOf);
/** Exporturile din cele două module: funcțiile, plus `export const` (ex. un provider). */
const EXPORTED_CONSTS = new Set(
  MODULES.flatMap((d) => sourceFiles(d, false)).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/^export const (\w+)/gm)].map((m) => m[1]!),
  ),
);
const EXPORTED = new Map(FUNCTIONS.filter((f) => f.exported).map((f) => [f.name, f]));

/**
 * Codurile AuditActions emise de funcție sau de funcțiile pe care le apelează: ajutoarele din
 * același fișier și funcțiile exportate din cele două module (ex. `refundSetupRequest` din billing
 * încheie cu `refundSetupByFounder` din commercial).
 */
function emittedCodes(fn: Fn, seen = new Set<string>()): Set<string> {
  seen.add(`${fn.file}#${fn.name}`);
  const codes = new Set([...fn.body.matchAll(/AuditActions\.(\w+)/g)].map((m) => m[1]!));
  for (const helper of FUNCTIONS) {
    if (helper.file !== fn.file && !helper.exported) continue;
    if (seen.has(`${helper.file}#${helper.name}`)) continue;
    if (new RegExp(`\\b${helper.name}\\(`).test(fn.body)) {
      for (const c of emittedCodes(helper, seen)) codes.add(c);
    }
  }
  return codes;
}

const FOUNDER_MARK = /\bfounderHeaders\b|\bFounderParams\b|\bFounderStep\b/;

function importedByFounderApp(): Set<string> {
  const names = new Set<string>();
  const dir = path.join(ROOT, 'apps/founder');
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/\.tsx?$/.test(e.name) || e.parentPath.includes('node_modules')) continue;
    const src = readFileSync(path.join(e.parentPath, e.name), 'utf8');
    for (const m of src.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'@ventora\/(?:commercial|billing)'/g,
    )) {
      for (const part of m[1]!.split(',')) {
        const name = part.trim().replace(/^type\s+/, '');
        if (
          name &&
          !part.trim().startsWith('type ') &&
          (EXPORTED.has(name) || EXPORTED_CONSTS.has(name))
        )
          names.add(name);
      }
    }
  }
  return names;
}

const INVENTORY = new Set([
  ...FUNCTIONS.filter((f) => f.exported && FOUNDER_MARK.test(f.body)).map((f) => f.name),
  ...importedByFounderApp(),
]);

const INTEGRATION_SOURCES = MODULES.flatMap((d) => sourceFiles(d, true))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// ── Gardul ─────────────────────────────────────────────────────────────────────────────────

describe('F3 · O-6 — fiecare scriere Founder din commercial și billing are audit', () => {
  it('găsește acțiunile Founder (inventarul nu e gol)', () => {
    expect(INVENTORY.size).toBeGreaterThan(40);
  });

  it('fiecare funcție Founder e clasificată o singură dată', () => {
    const classified = [...Object.keys(WRITES), ...READS, ...Object.keys(SYSTEM), ...PURE];
    const dupes = classified.filter((n, i) => classified.indexOf(n) !== i);
    expect(dupes, 'clasificate de două ori').toEqual([]);
    const unclassified = [...INVENTORY].filter((n) => !classified.includes(n)).sort();
    expect(
      unclassified,
      'funcții Founder noi: adaugă-le în WRITES (cu codul de audit), READS, SYSTEM sau PURE',
    ).toEqual([]);
    const missing = classified.filter((n) => !EXPORTED.has(n) && !EXPORTED_CONSTS.has(n)).sort();
    expect(missing, 'intrări care nu mai există în cod').toEqual([]);
  });

  it('o citire nu emite audit de scriere (altfel e o scriere clasificată greșit)', () => {
    const wrong = [...READS].filter((n) => emittedCodes(EXPORTED.get(n)!).size > 0);
    expect(wrong).toEqual([]);
  });

  it('fiecare cod din WRITES există în AuditActions', () => {
    const unknown = Object.values(WRITES)
      .flat()
      .filter((c) => !(c in AuditActions));
    expect(unknown).toEqual([]);
  });

  it('fiecare scriere Founder emite codul ei de audit', () => {
    const noAudit = Object.entries(WRITES)
      .filter(([name, codes]) => {
        const emitted = emittedCodes(EXPORTED.get(name)!);
        return !codes.every((c) => emitted.has(c));
      })
      .map(([name]) => name)
      .sort();
    expect(noAudit).toEqual([...KNOWN_GAPS.noAudit].sort());
  });

  it('fiecare cod de audit al unei scrieri Founder e verificat de un test de integrare', () => {
    const codes = [...new Set(Object.values(WRITES).flat())];
    const untested = codes
      .filter((c) => !INTEGRATION_SOURCES.includes(`'${AuditActions[c]}'`))
      .sort();
    expect(untested).toEqual([...KNOWN_GAPS.untested].sort());
  });
});
