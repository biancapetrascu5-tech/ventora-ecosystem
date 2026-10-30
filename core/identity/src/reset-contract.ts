import { getFounderDb, getIdentityDb } from './db';
import { readResetLinkInfo, type ResetLinkInfo } from './password-reset';

/** Lot 2.6 · C: what /reset-password may show for a token (Hub or Founder). */
export async function getResetLinkInfo(
  app: 'hub' | 'founder',
  token: string,
): Promise<ResetLinkInfo> {
  return readResetLinkInfo(app === 'founder' ? getFounderDb() : getIdentityDb(), token);
}
