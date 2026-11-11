import { authorize } from '@ventora/access';
import {
  getMarketingSettingsInOrg,
  saveMarketingSettingsInOrg,
  type MarketingSettings,
  type MarketingSettingsInput,
} from '../server/settings';

/*
 * Lot MK.1 — every contract starts with authorize() (application marketing). The organization
 * comes only from the session. Reading the settings needs marketing:read (a member sees the rules,
 * CampaignKitSettings); saving needs marketing:settings (owner, admin, application manager).
 */

type Session = { sessionToken: string };

/** The CampaignKit settings of the business (the defaults until the first save). */
export async function getMarketingSettings(params: Session): Promise<MarketingSettings> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'marketing',
    permission: 'marketing:read',
  });
  return getMarketingSettingsInOrg(ctx);
}

/** Saves the settings; audited (marketing.settings_updated, the changed field names only). */
export async function saveMarketingSettings(
  params: Session & { settings: MarketingSettingsInput },
): Promise<MarketingSettings> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'marketing',
    permission: 'marketing:settings',
  });
  return saveMarketingSettingsInOrg(ctx, params.settings);
}

export type { MarketingSettings, MarketingSettingsInput };
