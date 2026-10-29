import { hubAuth } from './auth';
import { founderAuth } from './auth-founder';
import { getFounderDb, getIdentityDb } from './db';
import { NotAuthenticated } from '@ventora/errors';
import { countBackupCodesOf, regenerateBackupCodesFor, type BackupCodesApp } from './backup-codes';

// Public contracts for the backup codes screens (D1–D3): Hub (Contul tău · Securitate, the
// R-2F10 toast) and Founder (FounderBackupCodes). The user always comes from the session.

function target(app: BackupCodesApp) {
  return app === 'founder'
    ? { auth: founderAuth, db: getFounderDb(), secret: process.env.FOUNDER_AUTH_SECRET! }
    : { auth: hubAuth, db: getIdentityDb(), secret: process.env.BETTER_AUTH_SECRET! };
}

/** Unused backup codes of the signed-in user; null without 2FA. */
export async function countBackupCodes(
  app: BackupCodesApp,
  headers: Headers,
): Promise<number | null> {
  const { auth, db, secret } = target(app);
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) throw new NotAuthenticated();
  return countBackupCodesOf(db, secret, session.user.id);
}

/** D3: 10 new codes after the TOTP code from the app; returned once. */
export async function regenerateBackupCodes(
  app: BackupCodesApp,
  headers: Headers,
  code: string,
): Promise<string[]> {
  const { auth, db, secret } = target(app);
  return regenerateBackupCodesFor({ app, auth, db, secret, headers, code });
}
