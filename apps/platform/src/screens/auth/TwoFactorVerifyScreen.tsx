'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, verifyBackupCode, verifyTotp } from '@/lib/auth-api';
import { readHandoff, setHandoff } from '@/lib/handoff';
import { routeAfterSignIn } from '@/server/session-actions';
import { AuthFrame, useClock } from './parts';
import { TwoFactorRecovery, TwoFactorVerify, type VerifyState } from './TwoFactorVerifyView';
import { useLocaleSwitch } from './hooks';

const LOCK_MINUTES = 15; // S61, TWO_FACTOR_LOCKOUT în core/identity

/* Verificarea după parolă. Better Auth răspunde la blocare cu 429 ACCOUNT_TEMPORARILY_LOCKED,
   fără ora deblocării (NECESITĂ DECIZIE: `lockedUntil` în răspuns). Până atunci afișăm ora
   „acum + 15 minute”: o limită de sus corectă (blocarea durează cel mult 15 minute de acum). */
export function TwoFactorVerifyScreen() {
  const router = useRouter();
  const clock = useClock();
  const lang = useLocaleSwitch();
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
      router.push(await routeAfterSignIn());
      return;
    }
    if (res.kind === 'rateLimited') {
      setLockedAt(new Date(Date.now() + LOCK_MINUTES * 60_000));
      setState('locked');
    } else if (res.kind === 'error' && res.code === 'INVALID_TWO_FACTOR_COOKIE') {
      setState('expired'); // sesiunea de verificare (10 minute) a expirat
    } else if (res.kind === 'error' && res.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') {
      setState('expired');
    } else {
      // Better Auth nu deosebește un cod de rezervă folosit de unul greșit (NECESITĂ DECIZIE).
      setState(res.kind === 'offline' ? 'idle' : 'wrong');
    }
  }

  const toSignIn = async () => {
    await signOut();
    router.push('/sign-in');
  };

  return (
    <AuthFrame {...lang}>
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
            if (state === 'wrong' || state === 'used') setState('idle');
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
