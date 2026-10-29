'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { enableTwoFactor, signOut, verifyTotp } from '@/lib/auth-api';
import { takePassword } from '@/lib/handoff';
import { routeAfterSignIn } from '@/server/session-actions';
import { AuthFrame, useClock } from './parts';
import {
  SetupStep1,
  SetupStep2,
  SetupStep3,
  downloadCodes,
  groupedKey,
  type SetupCodeState,
} from './TwoFactorSetupView';
import { useIsPhone, useLocaleSwitch } from './hooks';

const LOCK_MINUTES = 15;

/* Activarea la prima intrare a proprietarului (R-2F1). /two-factor/enable cere parola: o primim
   de la ecranul de intrare, doar în memorie. Fără ea (pagina reîncărcată) ieșim din cont și
   intrarea o ia de la capăt — același efect ca „Ieși din cont” (README: nu e un „Sari peste”). */
export function TwoFactorSetupScreen() {
  const router = useRouter();
  const t = useTranslations('auth.2fa');
  const phone = useIsPhone();
  const clock = useClock();
  const lang = useLocaleSwitch();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [copied, setCopied] = useState<'key' | 'codes' | null>(null);
  const [appsOpen, setAppsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [state, setState] = useState<SetupCodeState>('idle');
  const [confirmed, setConfirmed] = useState(false);
  const [lockedAt, setLockedAt] = useState<Date>();
  const started = useRef(false);

  const leave = async () => {
    await signOut();
    router.push('/sign-in');
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const password = takePassword();
    if (!password) {
      void leave();
      return;
    }
    void enableTwoFactor(password).then((res) => {
      if (res.ok) setSetup(res.data);
      else void leave();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activate() {
    setState('loading');
    const res = await verifyTotp(code.replace(/\s/g, ''));
    if (res.ok) {
      setState('idle');
      setStep(3);
    } else if (res.kind === 'rateLimited') {
      setLockedAt(new Date(Date.now() + LOCK_MINUTES * 60_000));
      setState('locked');
    } else setState(res.kind === 'offline' ? 'idle' : 'wrong');
  }

  async function copy(text: string, what: 'key' | 'codes') {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
  }

  if (!setup) return <AuthFrame {...lang}>{null}</AuthFrame>;

  return (
    <AuthFrame {...lang}>
      {step === 1 && (
        <SetupStep1
          totpUri={setup.totpURI}
          copied={copied === 'key'}
          appsOpen={appsOpen}
          onAppsOpenChange={setAppsOpen}
          onCopy={() => copy(groupedKey(setup.totpURI).replace(/\s/g, ''), 'key')}
          onNext={() => setStep(2)}
          onSignOut={leave}
          mob={phone}
        />
      )}
      {step === 2 && (
        <SetupStep2
          state={state}
          code={code}
          onCodeChange={(v) => {
            setCode(v);
            if (state === 'wrong') setState('idle');
          }}
          lockedTime={lockedAt ? clock(lockedAt) : undefined}
          onSubmit={activate}
          onBack={() => setStep(1)}
          onSignOut={leave}
        />
      )}
      {step === 3 && (
        <SetupStep3
          codes={setup.backupCodes}
          copied={copied === 'codes'}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          onCopy={() => copy(setup.backupCodes.join('\n'), 'codes')}
          onDownload={() => downloadCodes(t('setup.s3.fileName'), setup.backupCodes)}
          onContinue={async () => router.push(await routeAfterSignIn())}
        />
      )}
    </AuthFrame>
  );
}
