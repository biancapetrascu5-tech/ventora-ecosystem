'use server';

import { headers } from 'next/headers';
import { getSession, setUserLocale } from '@ventora/identity';
import { reportActionError } from './report-error';

/* Lot 4.3 (D4-8): the language chosen in the Hub is also kept with the account (UserPreference),
   so the notifications leave in the recipient's language. The cookie stays the source for the
   screens; without a session there is nothing to keep. */
export async function keepLocale(code: string): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await setUserLocale(session.userId, code);
    return true;
  } catch (err) {
    reportActionError('keepLocale', err);
    return false;
  }
}
