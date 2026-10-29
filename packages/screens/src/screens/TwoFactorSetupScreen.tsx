'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { enableTwoFactor, signOut, verifyTotp } from '../auth-api';
import { takePassword } from '../handoff';
import { AuthFrame, groupBackupCode, useClock } from '../parts';
import {
  SetupStep1,
  SetupStep2,
  SetupStep3,
  downloadCodes,
  groupedKey,
  type SetupCodeState,
} from '../TwoFactorSetupView';
import { useAuthApp } from './config';
import { useIsPhone } from './hooks';

/* Activarea 2FA: proprietarul Hub-ului la prima intrare (R-2F1), oricine în Founder (T1.8).
   /two-factor/enable cere parola: o primim de la ecranul de intrare, doar în memorie. Fără ea
   (pagina reîncărcată) ieșim din cont și intrarea o ia de la capăt — același efect ca „Ieși din
   cont” (README: nu e un „Sari peste”). La 5 coduri greșite răspunsul are ora deblocării. */
export function TwoFactorSetupScreen() {
  const router = useRouter();
  const t = useTranslations('auth.2fa');
  const phone = useIsPhone();
  const clock = useClock();
  const app = useAuthApp();
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
    router.push(app.routes.signIn);
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
      setLockedAt(res.retryAt);
      setState('locked');
    } else setState(res.kind === 'offline' ? 'idle' : 'wrong');
  }

  async function copy(text: string, what: 'key' | 'codes') {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
  }

  const frame = { brand: app.brand, locale: app.locale, onLocaleChange: app.onLocaleChange };
  if (!setup) return <AuthFrame {...frame}>{null}</AuthFrame>;
  // D1: 8 cifre, afișate în două grupe de 4
  const codes = setup.backupCodes.map(groupBackupCode);

  return (
    <AuthFrame {...frame}>
      {step === 1 && (
        <SetupStep1
          founder={app.brand === 'founder'}
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
          codes={codes}
          copied={copied === 'codes'}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          onCopy={() => copy(codes.join('\n'), 'codes')}
          onDownload={() => downloadCodes(t('setup.s3.fileName'), codes)}
          onContinue={async () => router.push(await app.afterSignIn())}
        />
      )}
    </AuthFrame>
  );
}
