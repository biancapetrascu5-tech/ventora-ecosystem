'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, verifyBackupCode, verifyTotp } from '../auth-api';
import { readHandoff, setHandoff } from '../handoff';
import { AuthFrame, useClock } from '../parts';
import { TwoFactorRecovery, TwoFactorVerify, type VerifyState } from '../TwoFactorVerifyView';
import { useAuthApp } from './config';

/* Verificarea după parolă. La blocare (5 coduri greșite, 15 minute) răspunsul are
   `lockedUntil` (Lot 2.6 · B): ecranul arată ora exactă. Un cod de rezervă folosit și unul
   greșit primesc același mesaj (D2). */
export function TwoFactorVerifyScreen() {
  const router = useRouter();
  const clock = useClock();
  const app = useAuthApp();
  const email = readHandoff().email ?? '';
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState('');
  const [state, setState] = useState<VerifyState>('idle');
  const [recovery, setRecovery] = useState(false);
  const [lockedAt, setLockedAt] = useState<Date>();

  async function submit() {
    setState('loading');
    const value = backup ? code.trim() : code.replace(/\s/g, '');
    const res = backup ? await verifyBackupCode(value) : await verifyTotp(value);
    if (res.ok) {
      if (backup) setHandoff({ backupCodeUsed: true });
      router.push(await app.afterSignIn());
      return;
    }
    if (res.kind === 'rateLimited') {
      setLockedAt(res.retryAt);
      setState('locked');
    } else if (
      res.kind === 'error' &&
      (res.code === 'INVALID_TWO_FACTOR_COOKIE' ||
        res.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE')
    ) {
      setState('expired'); // sesiunea de verificare (10 minute) a expirat
    } else {
      setState(res.kind === 'offline' ? 'idle' : 'wrong');
    }
  }

  const toSignIn = async () => {
    await signOut();
    router.push(app.routes.signIn);
  };

  return (
    <AuthFrame brand={app.brand} locale={app.locale} onLocaleChange={app.onLocaleChange}>
      {recovery ? (
        <TwoFactorRecovery onBack={() => setRecovery(false)} />
      ) : (
        <TwoFactorVerify
          email={email}
          backup={backup}
          state={state}
          code={code}
          onCodeChange={(v) => {
            setCode(v);
            if (state === 'wrong') setState('idle');
          }}
          lockedTime={lockedAt ? clock(lockedAt) : undefined}
          onSubmit={submit}
          onToggleBackup={() => {
            setBackup((b) => !b);
            setCode('');
            if (state !== 'locked') setState('idle');
          }}
          onOtherAccount={toSignIn}
          onNoAccess={() => setRecovery(true)}
          onBackToSignIn={toSignIn}
        />
      )}
    </AuthFrame>
  );
}
