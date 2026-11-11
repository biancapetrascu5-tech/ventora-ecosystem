import type { TenantContext } from '@ventora/access';
import { withCrmTx } from './db';

/*
 * Lot CR.1 — the ClientDesk preferences of a business (crm.settings). Until the first save there
 * is no row and the defaults apply: the EasyBook link on (D-CRM-2 = c), „inactiv” after 6 months
 * (D-CRM-18); since CR.4 the days of the predefined segment „N-au mai venit” (S130: 60, 7–365).
 */

export type CrmSettings = {
  bookingLinkEnabled: boolean;
  lapsedSegmentDays: number;
  /** false until the business saves its preferences once. */
  saved: boolean;
};

export const DEFAULT_CRM_SETTINGS: Readonly<CrmSettings> = {
  bookingLinkEnabled: true,
  lapsedSegmentDays: 60,
  saved: false,
};

type SettingsRow = { booking_link_enabled: boolean; lapsed_segment_days: number };

export async function getCrmSettingsInOrg(ctx: TenantContext): Promise<CrmSettings> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<SettingsRow>(
        `SELECT booking_link_enabled, lapsed_segment_days FROM crm.settings`,
      );
      const row = rows[0];
      if (!row) return { ...DEFAULT_CRM_SETTINGS };
      return {
        bookingLinkEnabled: row.booking_link_enabled,
        lapsedSegmentDays: row.lapsed_segment_days,
        saved: true,
      };
    },
    true,
  );
}
