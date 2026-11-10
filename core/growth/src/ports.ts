import type { GrowthOfferCost, GrowthOfferTarget } from '@ventora/contracts';
import {
  getActivePacks,
  getCatalogForOrg,
  getEffectiveEntitlements,
  getUsage,
  listAddonsForOrg,
  listTrials,
} from '@ventora/commercial';
import { getNotificationPreferences } from '@ventora/notifications';
import { getOrganization, listMembers, resolveOrgContext } from '@ventora/organizations';
import type { SubjectFacts } from './decide';

/*
 * Lot 5.6 — what Growth reads from the other services, only through their contracts (GROWTH §1:
 * it owns no products, prices or rights). Injected, so the decision can be tested without them and
 * a missing service fails into an empty slot, never into the page.
 */
export interface GrowthPorts {
  facts(organizationId: string, userId: string, now: Date): Promise<SubjectFacts>;
  /**
   * The full cost of an offer for this business, read from the commercial model (D-GRW-10).
   * null: not on sale for it (no price in its currency, sales stopped) — then it is not shown.
   */
  cost(organizationId: string, target: GrowthOfferTarget): Promise<GrowthOfferCost | null>;
}

/** D3-5: an application trial lasts 14 days, needs no card and pauses at the end. */
const trialTerms = (days: number) => ({
  days,
  requiresCard: false as const,
  atEnd: 'pause' as const,
});

export const commercialPorts: GrowthPorts = {
  async facts(organizationId, userId, now) {
    const orgCtx = await resolveOrgContext({ userId, organizationId });
    const [entitlements, usage, trials, packs, addons, catalog, prefs, org, members] =
      await Promise.all([
        getEffectiveEntitlements(organizationId),
        getUsage({ organizationId }),
        listTrials(organizationId),
        getActivePacks(organizationId),
        listAddonsForOrg(organizationId),
        getCatalogForOrg(organizationId),
        getNotificationPreferences(userId),
        getOrganization(orgCtx),
        listMembers(orgCtx),
      ]);
    const codeOf = new Map(addons.map((a) => [a.id, a.code]));
    const owned = catalog.bundles.filter((b) => b.have !== null);
    const createdAt = new Date((org as { createdAt: Date }).createdAt);
    return {
      optedOut: !prefs.recommendations.inApp,
      organization: {
        ageDays: Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000)),
        // the business's country is not in the model yet: „is” never matches (FAZA-5, Lot 5.6)
        country: null,
        members: (members as unknown[]).length,
      },
      planId: owned[0]?.planId ?? null,
      ownedPlanVersionIds: [
        ...(entitlements.subscription?.planVersionId
          ? [entitlements.subscription.planVersionId]
          : []),
        ...owned.map((b) => b.versionId),
      ],
      applications: entitlements.applications,
      features: entitlements.features,
      monthlyAddons: packs
        .filter((p) => p.recurring)
        .map((p) => codeOf.get(p.addonId))
        .filter((c): c is string => typeof c === 'string'),
      usedTrialApplications: trials
        .filter((t) => t.kind === 'application' && t.applicationId)
        .map((t) => t.applicationId as string),
      usedTrialFeatures: trials
        .filter((t) => t.kind === 'feature' && t.featureKey)
        .map((t) => t.featureKey as string),
      quotaUsage: Object.fromEntries(
        usage
          .filter((u) => u.limit !== null && u.limit > 0)
          .map((u) => [u.quotaKey, Math.floor((u.used / (u.limit as number)) * 100)]),
      ),
    };
  },

  async cost(organizationId, target) {
    if (target.type === 'addon') {
      const addon = (await listAddonsForOrg(organizationId)).find(
        (a) => a.code === target.addonCode,
      );
      if (!addon) return null;
      return {
        currency: addon.currency,
        amountMinor: addon.priceMinor,
        interval: addon.validity === 'monthly' ? 'month' : 'once',
        setupMinor: addon.setupMinor > 0 ? addon.setupMinor : null,
        trial: null,
      };
    }
    const catalog = await getCatalogForOrg(organizationId);
    const yearly = catalog.interval === 'year';
    if (target.type === 'app_activation' || (target.type === 'trial' && target.applicationId)) {
      const appId = target.type === 'app_activation' ? target.applicationId : target.applicationId!;
      const app = catalog.applications.find((a) => a.id === appId);
      if (!app || app.monthMinor === null) return null;
      const useYear = yearly && app.yearMinor !== null;
      return {
        currency: catalog.currency,
        amountMinor: useYear ? (app.yearMinor as number) : app.monthMinor,
        interval: useYear ? 'year' : 'month',
        setupMinor: app.setupMinor > 0 ? app.setupMinor : null,
        trial: target.type === 'trial' ? trialTerms(target.days) : null,
      };
    }
    if (target.type === 'bundle' || target.type === 'plan_upgrade') {
      const bundle = catalog.bundles.find((b) => b.versionId === target.planVersionId);
      if (!bundle) return null;
      const useYear = yearly && bundle.yearMinor !== null;
      return {
        currency: catalog.currency,
        amountMinor: useYear ? (bundle.yearMinor as number) : bundle.monthMinor,
        interval: useYear ? 'year' : 'month',
        setupMinor: bundle.setupMinor > 0 ? bundle.setupMinor : null,
        trial: null,
      };
    }
    // a feature trial has no price of its own in the commercial model yet: not shown
    return null;
  },
};
