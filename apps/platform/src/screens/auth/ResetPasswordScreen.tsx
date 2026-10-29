'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestNewResetLink, resetPassword } from '@/lib/auth-api';
import { readHandoff, setHandoff } from '@/lib/handoff';
import { AuthFrame, passwordMeetsRules } from './parts';
import { ResetDone, ResetNewPassword, type NewPasswordState } from './PasswordResetView';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { useIsPhone, useLocaleSwitch } from './hooks';

/* Ecranele 3 și 4 din HubPasswordReset, deschise din linkul primit pe e-mail.
   `linkValid`: verificarea făcută pe server la deschidere (linkul există și nu a expirat).
   Un link folosit, stricat sau necunoscut arată „Linkul a expirat” (S77): Better Auth șterge
   tokenul la folosire, deci „Ai folosit deja acest link” nu se poate deosebi (NECESITĂ DECIZIE). */
export function ResetPasswordScreen({ token, linkValid }: { token: string; linkValid: boolean }) {
  const router = useRouter();
  const phone = useIsPhone();
  const lang = useLocaleSwitch();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<NewPasswordState>(linkValid ? 'form' : 'expired');
  const [next, setNext] = useState<'done' | 'sent' | 'forgot' | null>(null);

  const signIn = () => router.push('/sign-in');

  async function save() {
    if (!passwordMeetsRules(password)) {
      setState('error');
      return;
    }
    setState('loading');
    const res = await resetPassword(token, password);
    if (res.ok) {
      setNext('done');
      return;
    }
    if (res.kind === 'error' && res.code === 'INVALID_TOKEN') setState('expired');
    else setState(res.kind === 'error' && res.status === 400 ? 'error' : 'form');
  }

  async function newLink() {
    const res = await requestNewResetLink(token);
    // link_sent: alt link, direct pe adresa contului (starea 15); altfel „Ai uitat parola?” gol (16)
    if (res.ok && res.data.status === 'link_sent') setNext('sent');
    else {
      setHandoff({ email: undefined });
      setNext('forgot');
    }
  }

  if (next === 'sent') return <ForgotPasswordScreen sentInitially />;
  if (next === 'forgot') return <ForgotPasswordScreen />;

  return (
    <AuthFrame {...lang}>
      {next === 'done' ? (
        // Pentru „După parolă îți cerem și codul…” ar trebui să știm dacă contul are 2FA:
        // răspunsul la /reset-password nu spune (NECESITĂ DECIZIE); fără informație, nu afirmăm.
        <ResetDone
          twoStep={false}
          onSignIn={() => {
            setHandoff({ email: readHandoff().email });
            signIn();
          }}
        />
      ) : (
        <ResetNewPassword
          state={state}
          password={password}
          onPasswordChange={(v) => {
            setPassword(v);
            if (state === 'error') setState('form');
          }}
          mob={phone}
          onSubmit={save}
          onNewLink={newLink}
          onSignIn={signIn}
          onBack={signIn}
        />
      )}
    </AuthFrame>
  );
}
