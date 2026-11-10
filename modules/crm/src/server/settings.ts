import type { TenantContext } from '@ventora/access';
import { withCrmTx } from './db';

/*
 * Lot CR.1 — the ClientDesk preferences of a business (crm.settings). Until the first save there
 * is no row and the defaults apply: the EasyBook link on (D-CRM-2 = c), „inactiv” after 6 months
 * (D-CRM-18, PROPUS). Saving comes with the lots that use them (CR.12), with its audit codes.
 */

export type CrmSettings = {
  bookingLinkEnabled: boolean;
  inactiveAfterMonths: number;
  /** false until the business saves its preferences once. */
  saved: boolean;
};

export const DEFAULT_CRM_SETTINGS: Readonly<CrmSettings> = {
  bookingLinkEnabled: true,
  inactiveAfterMonths: 6,
  saved: false,
};

type SettingsRow = { booking_link_enabled: boolean; inactive_after_months: number };

export async function getCrmSettingsInOrg(ctx: TenantContext): Promise<CrmSettings> {
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<SettingsRow>(
        `SELECT booking_link_enabled, inactive_after_months FROM crm.settings`,
      );
      const row = rows[0];
      if (!row) return { ...DEFAULT_CRM_SETTINGS };
      return {
        bookingLinkEnabled: row.booking_link_enabled,
        inactiveAfterMonths: row.inactive_after_months,
        saved: true,
      };
    },
    true,
  );
}
