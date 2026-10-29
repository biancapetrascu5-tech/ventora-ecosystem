'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestPasswordReset } from '../auth-api';
import { readHandoff, setHandoff } from '../handoff';
import { AuthFrame, useClock } from '../parts';
import { ResetRequest, ResetSent, type RequestState, type SentState } from '../PasswordResetView';
import { useAuthApp } from './config';
import { emailProblem, useIsPhone } from './hooks';

const RESEND_AFTER_MS = 60_000; // „Trimite alt link” devine activ după un minut (S74)

/* Ecranele 1 și 2 din HubPasswordReset. `sentTo`: venim din „Cere un link nou” cu un link
   expirat al unui cont cunoscut (R-PR5, starea 15): linkul a plecat deja pe adresa contului. */
export function ForgotPasswordScreen({ sentTo: sentInitially }: { sentTo?: string }) {
  const router = useRouter();
  const phone = useIsPhone();
  const clock = useClock();
  const app = useAuthApp();
  const [email, setEmail] = useState(() => (sentInitially ? '' : (readHandoff().email ?? '')));
  const [state, setState] = useState<RequestState>('idle');
  const [limitAt, setLimitAt] = useState<Date>();
  const [sent, setSent] = useState<SentState | null>(sentInitially ? 'wait' : null);
  const [sentTo, setSentTo] = useState<string | undefined>(sentInitially);

  // „Trimite alt link” devine activ după un minut de la fiecare trimitere.
  useEffect(() => {
    if (sent !== 'wait') return;
    const id = setTimeout(() => setSent('ready'), RESEND_AFTER_MS);
    return () => clearTimeout(id);
  }, [sent]);

  async function send(address: string, again: boolean) {
    const problem = emailProblem(address);
    if (problem) {
      setState(problem);
      return;
    }
    if (!again) setState('loading');
    const res = await requestPasswordReset(address.trim());
    if (res.ok) {
      setHandoff({ email: address.trim() });
      setSentTo(address.trim());
      setState('idle');
      setSent(again ? 'resent' : 'wait');
      return;
    }
    setSent(null);
    if (res.kind === 'rateLimited') {
      setLimitAt(res.retryAt);
      setState('limit');
    } else setState(res.kind === 'offline' ? 'offline' : 'idle');
  }

  const back = () => router.push(app.routes.signIn);

  return (
    <AuthFrame brand={app.brand} locale={app.locale} onLocaleChange={app.onLocaleChange}>
      {sent ? (
        <ResetSent
          state={sent}
          email={sentTo}
          onResend={() => sentTo && send(sentTo, true)}
          onOtherEmail={() => {
            setEmail('');
            setSent(null);
          }}
          onBack={back}
        />
      ) : (
        <ResetRequest
          state={state}
          email={email}
          onEmailChange={(v) => {
            setEmail(v);
            if (state === 'empty' || state === 'format' || state === 'offline') setState('idle');
          }}
          limitTime={limitAt ? clock(limitAt) : undefined}
          mob={phone}
          onSubmit={() => send(email, false)}
          onBack={back}
        />
      )}
    </AuthFrame>
  );
}
