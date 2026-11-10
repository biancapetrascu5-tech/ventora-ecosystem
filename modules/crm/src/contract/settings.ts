import { authorize } from '@ventora/access';
import { getCrmSettingsInOrg, type CrmSettings } from '../server/settings';

/*
 * Lot CR.1 — every contract starts with authorize() (application crm). The organization comes only
 * from the session. Reading the preferences needs crm:read.
 */

type Session = { sessionToken: string };

/** The ClientDesk preferences of the business (the defaults until the first save). */
export async function getCrmSettings(params: Session): Promise<CrmSettings> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'crm',
    permission: 'crm:read',
  });
  return getCrmSettingsInOrg(ctx);
}

export type { CrmSettings };
