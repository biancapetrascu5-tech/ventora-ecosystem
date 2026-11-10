import type {
  GrowthEligibilityRule,
  GrowthLocale,
  GrowthOfferTarget,
  GrowthRuleCondition,
} from '@ventora/contracts';

/*
 * Lot 5.6 — the decision, pure (GROWTH_ENGINE §2.4–§2.5, §2.9; ARCHITECTURE §8.7). Given what is
 * published (the catalog snapshot), what we know about the business and the person (facts, from
 * the contracts of core/commercial, core/notifications, core/organizations) and what the person
 * has already seen (state, from the growth schema), it returns the campaigns that may fill a slot,
 * best first. Nothing here reads or writes; the service (service.ts) loads, prices and records.
 *
 * Rules, in the order they apply:
 *   1. the global stop, the slot stop, a retired slot → nothing;
 *   2. proactive = neither the call nor the slot is user-initiated;
 *   3. members: never proactive (D-GRW-7), only „Recomandă aplicația” campaigns (P21, D5-4);
 *      owners and admins: only buyer campaigns;
 *   4. opt-out (the „Recomandări Ventora” switch off) → nothing proactive;
 *   5. caps on the person, in all her businesses (D5-10): rolling 24 h and 7 days; exempt: what the
 *      person asked for (user-initiated) — the account-limit messages are not recommendations;
 *   6. per campaign: active, in its window, on this slot, its signal received (automatic mode),
 *      its rule matched (allow-list only), its own per-person cap;
 *   7. owned products never appear (rule 2, not configurable): the app, the plan, a monthly
 *      add-on the business has, or a trial already used / running;
 *   8. a proactive offer the person dismissed or snoozed stays hidden until its term;
 *   9. only in a language with an approved text (P20), no fallback;
 *  10. order: triggered by the person's own action, then priority, then the most specific rule,
 *      then the campaign shown longest ago (never shown first).
 */

export type GrowthRole = 'owner' | 'admin' | 'member';

export interface CatalogPlacement {
  id: string;
  userInitiated: boolean;
  stopped: boolean;
  retired: boolean;
}

export interface CatalogOffer {
  id: string;
  target: GrowthOfferTarget;
  /** Approved texts only, by language. */
  texts: Partial<Record<GrowthLocale, { title: string; body: string }>>;
}

export interface CatalogCampaign {
  id: string;
  offerId: string;
  mode: 'signal' | 'scheduled';
  signal: { type: string; version: number } | null;
  startsAt: Date | null;
  endsAt: Date | null;
  rule: GrowthEligibilityRule;
  audienceRole: 'buyer' | 'member';
  priority: number;
  maxImpressionsPerUser: number | null;
  slots: string[];
}

export interface CatalogSnapshot {
  control: {
    paused: boolean;
    dailyPerUser: number;
    weeklyPerUser: number;
    dismissCooldownDays: number;
  };
  placements: Map<string, CatalogPlacement>;
  offers: Map<string, CatalogOffer>;
  /** Active campaigns only. */
  campaigns: CatalogCampaign[];
}

/** What the contracts say about the business and the person (ports.ts). */
export interface SubjectFacts {
  optedOut: boolean;
  organization: { ageDays: number; country: string | null; members: number };
  planId: string | null;
  /** The bundle versions the business has (its subscription's, and the bundle marked as owned). */
  ownedPlanVersionIds: string[];
  /** Applications on now, trials included. */
  applications: string[];
  features: string[];
  /** Codes of the monthly add-ons on now (a one-time pack can be bought again). */
  monthlyAddons: string[];
  usedTrialApplications: string[];
  usedTrialFeatures: string[];
  /** Usage as a percentage of the limit, per quota key. */
  quotaUsage: Record<string, number>;
}

/** What the person (in this business, or everywhere for the caps) has already seen. */
export interface PersonState {
  /** Proactive impressions in the last 24 h / 7 days, in all her businesses (D5-10). */
  proactiveLastDay: number;
  proactiveLastWeek: number;
  /** Offers hidden from her until a term in the future (dismiss, snooze). */
  suppressedOfferIds: Set<string>;
  impressionsByCampaign: Map<string, number>;
  lastShownByCampaign: Map<string, Date>;
  /** Unexpired signals of the business (or of this person). `byUser`: from her own action. */
  signals: Array<{ type: string; version: number; byUser: boolean }>;
}

export interface DecideInput {
  slotId: string;
  locale: GrowthLocale;
  role: GrowthRole;
  /** The person asked (opened the catalog, pressed a locked feature). */
  userInitiated: boolean;
  now: Date;
}

export interface Candidate {
  campaign: CatalogCampaign;
  offer: CatalogOffer;
  proactive: boolean;
  text: { title: string; body: string };
}

export type DecideResult =
  | { kind: 'candidates'; proactive: boolean; candidates: Candidate[] }
  | { kind: 'none'; reason: NoneReason };

export type NoneReason =
  | 'paused'
  | 'slot_unknown'
  | 'slot_stopped'
  | 'member_proactive'
  | 'opted_out'
  | 'daily_cap'
  | 'weekly_cap'
  | 'nothing_eligible';

/** Only for the cheap exits before the facts are loaded (no port calls when nothing can show). */
export function slotCampaigns(snapshot: CatalogSnapshot, slotId: string, now: Date) {
  return snapshot.campaigns.filter((c) => c.slots.includes(slotId) && inWindow(c, now));
}

function inWindow(c: CatalogCampaign, now: Date): boolean {
  if (c.startsAt && now < c.startsAt) return false;
  if (c.endsAt && now >= c.endsAt) return false;
  return true;
}

export function ownsTarget(facts: SubjectFacts, target: GrowthOfferTarget): boolean {
  switch (target.type) {
    case 'app_activation':
      return facts.applications.includes(target.applicationId);
    case 'plan_upgrade':
    case 'bundle':
      return facts.ownedPlanVersionIds.includes(target.planVersionId);
    case 'addon':
      return facts.monthlyAddons.includes(target.addonCode);
    case 'trial':
      if (target.applicationId) {
        return (
          facts.applications.includes(target.applicationId) ||
          facts.usedTrialApplications.includes(target.applicationId)
        );
      }
      return (
        target.featureKey !== null &&
        (facts.features.includes(target.featureKey) ||
          facts.usedTrialFeatures.includes(target.featureKey))
      );
  }
}

function matchCondition(
  c: GrowthRuleCondition,
  facts: SubjectFacts,
  input: DecideInput,
  state: PersonState,
): boolean {
  const num = (v: number, op: 'gte' | 'lte', x: number) => (op === 'gte' ? v >= x : v <= x);
  const is = (match: boolean, op: 'is' | 'is_not') => (op === 'is' ? match : !match);
  switch (c.criterion) {
    case 'organization.applications':
      return (c.operator === 'includes') === facts.applications.includes(c.value);
    case 'organization.plan':
      return is(facts.planId === c.value, c.operator);
    case 'organization.addons':
      return (c.operator === 'includes') === facts.monthlyAddons.includes(c.value);
    case 'organization.quota_usage':
      return num(facts.quotaUsage[c.key] ?? 0, c.operator, c.value);
    case 'organization.age_days':
      return num(facts.organization.ageDays, c.operator, c.value);
    case 'organization.country':
      // unknown country: never „is”, always „is not”
      return is(facts.organization.country === c.value, c.operator);
    case 'organization.members':
      return num(facts.organization.members, c.operator, c.value);
    case 'user.role':
      return is(input.role === c.value, c.operator);
    case 'user.locale':
      return is(input.locale === c.value, c.operator);
    case 'signal.received':
      return state.signals.some((s) => s.type === c.value.type && s.version === c.value.version);
  }
}

export function matchRule(
  rule: GrowthEligibilityRule,
  facts: SubjectFacts,
  input: DecideInput,
  state: PersonState,
): boolean {
  const results = rule.rules.map((c) => matchCondition(c, facts, input, state));
  return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

export function decide(
  snapshot: CatalogSnapshot,
  facts: SubjectFacts,
  state: PersonState,
  input: DecideInput,
): DecideResult {
  if (snapshot.control.paused) return { kind: 'none', reason: 'paused' };
  const slot = snapshot.placements.get(input.slotId);
  if (!slot || slot.retired) return { kind: 'none', reason: 'slot_unknown' };
  if (slot.stopped) return { kind: 'none', reason: 'slot_stopped' };

  const proactive = !(input.userInitiated || slot.userInitiated);
  const isMember = input.role === 'member';
  if (proactive && isMember) return { kind: 'none', reason: 'member_proactive' };
  if (proactive && facts.optedOut) return { kind: 'none', reason: 'opted_out' };
  if (proactive && state.proactiveLastDay >= snapshot.control.dailyPerUser) {
    return { kind: 'none', reason: 'daily_cap' };
  }
  if (proactive && state.proactiveLastWeek >= snapshot.control.weeklyPerUser) {
    return { kind: 'none', reason: 'weekly_cap' };
  }

  const candidates: Array<Candidate & { byUser: boolean }> = [];
  for (const campaign of slotCampaigns(snapshot, input.slotId, input.now)) {
    if (campaign.audienceRole !== (isMember ? 'member' : 'buyer')) continue;
    const offer = snapshot.offers.get(campaign.offerId);
    if (!offer) continue;
    const signal = campaign.signal;
    const hit = signal
      ? state.signals.filter((s) => s.type === signal.type && s.version === signal.version)
      : [];
    if (campaign.mode === 'signal' && hit.length === 0) continue;
    if (!matchRule(campaign.rule, facts, input, state)) continue;
    const seen = state.impressionsByCampaign.get(campaign.id) ?? 0;
    if (campaign.maxImpressionsPerUser !== null && seen >= campaign.maxImpressionsPerUser) continue;
    if (ownsTarget(facts, offer.target)) continue;
    if (proactive && state.suppressedOfferIds.has(offer.id)) continue;
    const text = offer.texts[input.locale];
    if (!text) continue;
    candidates.push({ campaign, offer, proactive, text, byUser: hit.some((s) => s.byUser) });
  }
  if (candidates.length === 0) return { kind: 'none', reason: 'nothing_eligible' };

  const shown = (id: string) => state.lastShownByCampaign.get(id)?.getTime() ?? -Infinity;
  candidates.sort(
    (a, b) =>
      Number(b.byUser) - Number(a.byUser) ||
      b.campaign.priority - a.campaign.priority ||
      b.campaign.rule.rules.length - a.campaign.rule.rules.length ||
      shown(a.campaign.id) - shown(b.campaign.id) ||
      a.campaign.id.localeCompare(b.campaign.id),
  );
  return {
    kind: 'candidates',
    proactive,
    candidates: candidates.map(({ byUser: _byUser, ...c }) => c),
  };
}
