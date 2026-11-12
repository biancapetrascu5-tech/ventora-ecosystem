'use server';

import { headers } from 'next/headers';
import { getSession, setUserLocale } from '@ventora/identity';
import { listMyOrganizations } from '@ventora/organizations';
import { reportActionError } from './report-error';

/* Lot 4.3 (D4-8): the language chosen in the Hub is also kept with the account (UserPreference),
   so the notifications leave in the recipient's language. The cookie stays the source for the
   screens; without a session there is nothing to keep. */
export async function keepLocale(code: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    // Lot 5.10c: user.locale_changed v1 for each business of the person (the contract, no SQL)
    const memberships = await listMyOrganizations(session.userId);
    await setUserLocale(
      session.userId,
      code,
      memberships
        .filter((m: { status: string }) => m.status === 'active')
        .map((m: { organization_id: string }) => m.organization_id),
    );
    return true;
  } catch (err) {
    reportActionError('keepLocale', err);
    return false;
  }
}
