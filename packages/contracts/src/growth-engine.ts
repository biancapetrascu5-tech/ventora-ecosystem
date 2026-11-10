import { z } from 'zod';
import type { EventDefinition } from './event-catalog';
import type { Currency } from './commercial';
import type { ApplicationManifest } from './manifest';

/*
 * Lot 5.0 — contractele Growth Engine v1 (FAZA-5.md §3, GROWTH_ENGINE.md §2, ARCHITECTURE §8.7).
 * Doar forme și validatori puri: implementarea e în core/growth (5.5–5.8), ecranele în Hub (5.9)
 * și Founder (5.10). Valorile fixate aici sunt deciziile confirmate, ca să fie una singură.
 */

/** Limbile ecosistemului (D-UI-2). O ofertă apare doar în limbile cu text aprobat (P20). */
export type GrowthLocale = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
export const GROWTH_LOCALES: readonly GrowthLocale[] = ['ro', 'en', 'fr', 'es', 'de', 'it'];

/** P23 / D-GRW-14: o audiență sub 5 afaceri nu se folosește, iar numărul ei nu se afișează. */
export const GROWTH_MIN_AUDIENCE = 5;

/** P24 / D-GRW-15, D5-12: conversia se atribuie dacă are loc în 7 zile de la click. */
export const GROWTH_ATTRIBUTION_DAYS = 7;

/** P22 / D-GRW-13, D5-8: oprirea automată peste 5% deranj, după cel puțin 100 de afișări. */
export const GROWTH_AUTO_STOP = { disturbanceRate: 0.05, minImpressions: 100 } as const;

/** D5-9: starea opririlor se citește cu un cache de cel mult 5 secunde. */
export const GROWTH_KILL_SWITCH_MAX_STALENESS_MS = 5_000;

/** Titlul unei oferte: cel mult 48 de caractere (patterns.md, „Oferte”). */
export const GROWTH_OFFER_TITLE_MAX = 48;

// ── Ofertele (GROWTH §2.1) ──────────────────────────────────────────────────────────────────────

export type GrowthOfferType = 'app_activation' | 'plan_upgrade' | 'addon' | 'trial' | 'bundle';

/** Obiectul din core/commercial spre care trimite oferta. Growth Engine nu are prețuri proprii. */
export type GrowthOfferTarget =
  | { type: 'app_activation'; applicationId: string }
  | { type: 'plan_upgrade'; planVersionId: string }
  | { type: 'addon'; addonCode: string }
  | { type: 'trial'; applicationId: string | null; featureKey: string | null; days: number }
  | { type: 'bundle'; planVersionId: string };

/**
 * Costul afișat întreg înainte de orice confirmare (D-GRW-10): prețul, periodicitatea, costul de
 * implementare și condițiile probei. Se citește din modelul comercial, nu se scrie de mână.
 */
export interface GrowthOfferCost {
  currency: Currency;
  amountMinor: number;
  interval: 'month' | 'year' | 'once';
  setupMinor: number | null;
  /** Proba nu cere card și nu trece singură la plată: la final aplicația se oprește. */
  trial: { days: number; requiresCard: false; atEnd: 'pause' } | null;
}

// ── Sloturile (GROWTH §2.2) ─────────────────────────────────────────────────────────────────────

/** Sloturile Hub / Core (GROWTH §2.2), înregistrate lângă cele din manifestele aplicațiilor. */
export const HUB_GROWTH_PLACEMENTS = [
  { id: 'hub.launcher.other', kind: 'card', critical: false },
  { id: 'hub.notifications.recommendations', kind: 'card', critical: false },
  { id: 'hub.plan.packs', kind: 'card', critical: false },
  { id: 'hub.catalog.apps', kind: 'card', critical: false, userInitiated: true },
  { id: 'hub.limit.dialog', kind: 'upgrade', critical: false, userInitiated: true },
] as const;

/**
 * Ce primește un slot (`getSlotContent`, Lot 5.6). `null` înseamnă slot gol: nimic eligibil,
 * plafon atins, oprire, opt-out sau Growth în eroare — aplicația arată la fel (§8.7).
 */
export interface GrowthSlotContent {
  slotId: string;
  /** Opac; cheia de idempotență pentru interacțiuni. */
  contentId: string;
  campaignId: string;
  offerId: string;
  /** false: cerută de persoană (catalog, funcționalitate blocată): fără plafoane și fără „Nu mă interesează”. */
  proactive: boolean;
  /** `member`: doar „Recomandă aplicația”, niciodată o ofertă de cumpărare (P21, D5-4). */
  audience: 'buyer' | 'member';
  locale: GrowthLocale;
  title: string;
  body: string;
  target: GrowthOfferTarget;
  cost: GrowthOfferCost;
}

/** GROWTH §2.5, §2.7. `undo`: „Anulează” din Toast, după dismiss / snooze. */
export type GrowthInteractionKind =
  'impression' | 'click' | 'dismiss' | 'snooze' | 'recommend' | 'undo';

/** „Amintește-mi mai târziu”: peste o săptămână sau peste o lună (RecommendationCard). */
export type GrowthSnoozePeriod = 'week' | 'month';

// ── Eligibilitatea: lista albă de criterii (GROWTH §2.4, regula 5) ──────────────────────────────

/**
 * Singurele criterii care există. Orice alt criteriu (sănătate, angajați, clienți finali,
 * conținut, date financiare individuale) nu poate fi exprimat. `org.onboarding.milestone` și
 * agregatele de utilizare vin mai târziu (D5-7).
 */
export const GROWTH_CRITERIA = [
  'organization.applications',
  'organization.plan',
  'organization.addons',
  'organization.quota_usage',
  'organization.age_days',
  'organization.country',
  'organization.members',
  'user.role',
  'user.locale',
  'signal.received',
] as const;
export type GrowthCriterion = (typeof GROWTH_CRITERIA)[number];

const id = z.string().min(1).max(100);
const numberOp = z.enum(['gte', 'lte']);
const setOp = z.enum(['includes', 'excludes']);
const isOp = z.enum(['is', 'is_not']);

const ruleSchema = z.discriminatedUnion('criterion', [
  z
    .object({ criterion: z.literal('organization.applications'), operator: setOp, value: id })
    .strict(),
  z.object({ criterion: z.literal('organization.plan'), operator: isOp, value: id }).strict(),
  z.object({ criterion: z.literal('organization.addons'), operator: setOp, value: id }).strict(),
  z
    .object({
      criterion: z.literal('organization.quota_usage'),
      operator: numberOp,
      key: id,
      value: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('organization.age_days'),
      operator: numberOp,
      value: z.number().int().min(0).max(36_500),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('organization.country'),
      operator: isOp,
      value: z.string().regex(/^[A-Z]{2}$/),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('organization.members'),
      operator: numberOp,
      value: z.number().int().min(0).max(100_000),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('user.role'),
      operator: isOp,
      value: z.enum(['owner', 'admin', 'member']),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('user.locale'),
      operator: isOp,
      value: z.enum(['ro', 'en', 'fr', 'es', 'de', 'it']),
    })
    .strict(),
  z
    .object({
      criterion: z.literal('signal.received'),
      operator: z.literal('is'),
      value: z.object({ type: id, version: z.number().int().min(1) }).strict(),
    })
    .strict(),
]);

export const GrowthEligibilityRuleSchema = z
  .object({
    match: z.enum(['all', 'any']),
    rules: z.array(ruleSchema).min(1).max(20),
  })
  .strict();

export type GrowthEligibilityRule = z.infer<typeof GrowthEligibilityRuleSchema>;
export type GrowthRuleCondition = GrowthEligibilityRule['rules'][number];

export type GrowthValidation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Validatorul de reguli (GROWTH §2.4): respinge orice criteriu, operator sau câmp din afara listei
 * albe. Cu `catalog`, un `signal.received` trebuie să fie un eveniment `growthSafe` din catalog.
 * Se apelează la salvare (Founder) și la evaluare (core/growth).
 */
export function validateEligibilityRule(
  input: unknown,
  catalog?: readonly EventDefinition[],
): GrowthValidation<GrowthEligibilityRule> {
  const parsed = GrowthEligibilityRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(rule)'}: ${i.message}`),
    };
  }
  const errors: string[] = [];
  if (catalog) {
    parsed.data.rules.forEach((r, i) => {
      if (r.criterion !== 'signal.received') return;
      const def = catalog.find((d) => d.type === r.value.type && d.version === r.value.version);
      if (!def || !def.growthSafe) {
        errors.push(
          `rules.${i}.value: ${r.value.type}@${r.value.version} nu e un semnal growthSafe`,
        );
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed.data };
}

// ── Semnalele fără date sensibile (GROWTH §2.3) ─────────────────────────────────────────────────

/**
 * Numele de câmpuri care nu pot apărea în payload-ul unui eveniment `growthSafe`: date personale,
 * conținut, sume individuale, date despre angajați sau clienți finali.
 */
const SENSITIVE_WORDS = new Set([
  'email',
  'mail',
  'phone',
  'telefon',
  'name',
  'nume',
  'address',
  'adresa',
  'amount',
  'price',
  'total',
  'cost',
  'iban',
  'cnp',
  'birth',
  'birthday',
  'health',
  'medical',
  'note',
  'notes',
  'content',
  'body',
  'message',
  'text',
  'comment',
  'client',
  'customer',
  'employee',
  'salary',
  'ip',
]);

/** Cuvintele unui nume de câmp: `customerEmail` → customer, email; `ip_address` → ip, address. */
function fieldWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/** Câmpurile interzise din schema unui eveniment `growthSafe` (gol = în regulă). */
export function growthSafeViolations(def: EventDefinition): string[] {
  if (!def.growthSafe) return [];
  const shape = (def.schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape)
    return [`${def.type}@${def.version}: payload-ul unui semnal trebuie să fie un obiect`];
  return Object.keys(shape)
    .filter((k) => fieldWords(k).some((w) => SENSITIVE_WORDS.has(w)))
    .map((k) => `${def.type}@${def.version}: câmpul „${k}” nu e permis într-un semnal`);
}

// ── Manifestul (D-GRW-3, GROWTH §2.10) ──────────────────────────────────────────────────────────

/**
 * Sloturile și semnalele declarate de o aplicație:
 * - id-ul slotului e `<applicationId>.<context>.<poziție>`, unic;
 * - un slot nu stă într-un flux critic (`critical: true` e refuzat, GROWTH §2.2);
 * - un semnal e un eveniment din catalog marcat `growthSafe`.
 */
export function validateManifestGrowth(
  manifest: Pick<ApplicationManifest, 'applicationId' | 'placements' | 'growthSignals'>,
  catalog: readonly EventDefinition[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const pattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;
  for (const p of manifest.placements ?? []) {
    if (!pattern.test(p.id) || !p.id.startsWith(`${manifest.applicationId}.`)) {
      errors.push(
        `slot „${p.id}”: id-ul trebuie să fie ${manifest.applicationId}.<context>.<poziție>`,
      );
    }
    if (seen.has(p.id)) errors.push(`slot „${p.id}”: declarat de două ori`);
    seen.add(p.id);
    if (p.critical) errors.push(`slot „${p.id}”: un slot nu poate sta într-un flux critic`);
  }
  for (const s of manifest.growthSignals ?? []) {
    const def = catalog.find((d) => d.type === s.type && d.version === s.version);
    if (!def) errors.push(`semnal ${s.type}@${s.version}: nu e în catalogul de evenimente`);
    else if (!def.growthSafe) errors.push(`semnal ${s.type}@${s.version}: nu e growthSafe`);
  }
  return errors;
}
