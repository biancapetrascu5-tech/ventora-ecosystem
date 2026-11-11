import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { withCrmTx } from './db';

/*
 * Lot CR.1 — the ClientDesk preferences of a business (crm.settings). Until the first save there
 * is no row and the defaults apply: the EasyBook link on (D-CRM-2 = c), „inactiv” after 6 months
 * (D-CRM-18); since CR.4 the days of the predefined segment „N-au mai venit” (S130: 60, 7–365);
 * since CR.10 the lead score switch (on by default) and the minimum budget (none by default).
 */

export type CrmSettings = {
  bookingLinkEnabled: boolean;
  lapsedSegmentDays: number;
  /** CR.10: the lead score (S131: the business can switch it off). */
  leadScoringEnabled: boolean;
  /** CR.10: below it a lead's budget costs 10 points; null: the rule is off. */
  leadMinBudgetMinor: number | null;
  /** false until the business saves its preferences once. */
  saved: boolean;
};

export const DEFAULT_CRM_SETTINGS: Readonly<CrmSettings> = {
  bookingLinkEnabled: true,
  lapsedSegmentDays: 60,
  leadScoringEnabled: true,
  leadMinBudgetMinor: null,
  saved: false,
};

type SettingsRow = {
  booking_link_enabled: boolean;
  lapsed_segment_days: number;
  lead_scoring_enabled: boolean;
  lead_min_budget_minor: string | null;
};

export async function getCrmSettingsInOrg(ctx: TenantContext): Promise<CrmSettings> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<SettingsRow>(
        `SELECT booking_link_enabled, lapsed_segment_days, lead_scoring_enabled, lead_min_budget_minor
           FROM crm.settings`,
      );
      const row = rows[0];
      if (!row) return { ...DEFAULT_CRM_SETTINGS };
      return {
        bookingLinkEnabled: row.booking_link_enabled,
        lapsedSegmentDays: row.lapsed_segment_days,
        leadScoringEnabled: row.lead_scoring_enabled,
        leadMinBudgetMinor:
          row.lead_min_budget_minor === null ? null : Number(row.lead_min_budget_minor),
        saved: true,
      };
    },
    true,
  );
}

/** CR.10 (crm:settings): the lead score switch and the minimum budget; only the fields sent. */
export async function setLeadScoringInOrg(
  ctx: TenantContext,
  input: { enabled?: unknown; minBudgetMinor?: unknown },
): Promise<CrmSettings> {
  const fields: string[] = [];
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw new InvalidInput('enabled', 'invalid');
    fields.push('lead_scoring_enabled');
  }
  if (input.minBudgetMinor !== undefined) {
    const v = input.minBudgetMinor;
    if (v !== null && (!Number.isSafeInteger(v) || (v as number) < 0)) {
      throw new InvalidInput('minBudgetMinor', 'invalid');
    }
    fields.push('lead_min_budget_minor');
  }
  if (!fields.length) throw new InvalidInput('enabled', 'required');
  await withCrmTx(ctx.organizationId, async (client, exec) => {
    const current = (
      await client.query<{ lead_scoring_enabled: boolean; lead_min_budget_minor: string | null }>(
        `SELECT lead_scoring_enabled, lead_min_budget_minor FROM crm.settings`,
      )
    ).rows[0];
    const enabled =
      input.enabled !== undefined
        ? (input.enabled as boolean)
        : (current?.lead_scoring_enabled ?? true);
    const min =
      input.minBudgetMinor !== undefined
        ? (input.minBudgetMinor as number | null)
        : (current?.lead_min_budget_minor ?? null);
    await client.query(
      `INSERT INTO crm.settings (organization_id, lead_scoring_enabled, lead_min_budget_minor, updated_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO UPDATE
         SET lead_scoring_enabled = EXCLUDED.lead_scoring_enabled,
             lead_min_budget_minor = EXCLUDED.lead_min_budget_minor,
             updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [ctx.organizationId, enabled, min, ctx.userId],
    );
    await appendAuditEventInTx(exec, {
      category: 'crm',
      action: AuditActions.crmSettingsUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'crm_settings',
      targetId: ctx.organizationId,
      metadata: { fields },
    });
  });
  return getCrmSettingsInOrg(ctx);
}
