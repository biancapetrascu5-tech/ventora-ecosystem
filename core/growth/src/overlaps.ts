/*
 * Lot 5.10b — pure, without the database: Founder's client screens import it through
 * `@ventora/growth/overlaps` (the package index pulls pg, which cannot be bundled for the browser).
 */

type OverlapCampaign = {
  id: string;
  name: string;
  status: string;
  slots: readonly string[];
  rule: unknown;
  audienceRole: string;
};

/**
 * The warning „two campaigns on the same slot for the same audience” (5.10b): the other active
 * campaigns that share a slot and the same rule (the audience is the rule).
 */
export function campaignOverlaps(
  campaign: Pick<OverlapCampaign, 'id' | 'slots' | 'rule' | 'audienceRole'>,
  others: readonly OverlapCampaign[],
): { campaignId: string; name: string; slots: string[] }[] {
  const rule = JSON.stringify(campaign.rule);
  return others
    .filter(
      (o) =>
        o.id !== campaign.id &&
        o.status === 'active' &&
        o.audienceRole === campaign.audienceRole &&
        JSON.stringify(o.rule) === rule,
    )
    .map((o) => ({
      campaignId: o.id,
      name: o.name,
      slots: o.slots.filter((s) => campaign.slots.includes(s)),
    }))
    .filter((o) => o.slots.length > 0);
}
