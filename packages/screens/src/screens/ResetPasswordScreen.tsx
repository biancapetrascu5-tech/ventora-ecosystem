'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestNewResetLink, resetPassword } from '../auth-api';
import { setHandoff } from '../handoff';
import { AuthFrame, passwordMeetsRules } from '../parts';
import { ResetDone, ResetNewPassword, type NewPasswordState } from '../PasswordResetView';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { useAuthApp } from './config';
import { useIsPhone } from './hooks';

/** Ce știe serverul despre linkul deschis (Lot 2.6 · C). Nimic pentru un token necunoscut. */
export type ResetLinkInfo =
  | { status: 'valid' | 'expired'; email: string; twoFactor: boolean }
  | { status: 'used' }
  | { status: 'unknown' };

/* Ecranele 3 și 4 din HubPasswordReset, deschise din linkul primit pe e-mail.
   valid → „Alege o parolă nouă” cu adresa; expirat sau necunoscut → „Linkul a expirat” (S77);
   folosit → „Ai folosit deja acest link” (marca păstrată 7 zile). */
export function ResetPasswordScreen({ token, link }: { token: string; link: ResetLinkInfo }) {
  const router = useRouter();
  const phone = useIsPhone();
  const app = useAuthApp();
  const known = link.status === 'valid' || link.status === 'expired' ? link : null;
  const [password, setPassword] = useState('');
  const [state, setState] = useState<NewPasswordState>(
    link.status === 'valid' ? 'form' : link.status === 'used' ? 'used' : 'expired',
  );
  const [next, setNext] = useState<'done' | 'sent' | 'forgot' | null>(null);

  const signIn = () => {
    if (known) setHandoff({ email: known.email });
    router.push(app.routes.signIn);
  };

  async function save() {
    if (!passwordMeetsRules(password, app.minPassword)) {
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
    // Link folosit: adresa nu se mai știe, „Ai uitat parola?” cu câmpul gol (S76, starea 16).
    if (link.status === 'used') {
      setHandoff({ email: undefined });
      setNext('forgot');
      return;
    }
    const res = await requestNewResetLink(token);
    // link_sent: alt link, direct pe adresa contului (starea 15); altfel câmpul gol (16)
    if (res.ok && res.data.status === 'link_sent') setNext('sent');
    else {
      setHandoff({ email: undefined });
      setNext('forgot');
    }
  }

  if (next === 'sent') return <ForgotPasswordScreen sentTo={known?.email} />;
  if (next === 'forgot') return <ForgotPasswordScreen />;

  return (
    <AuthFrame brand={app.brand} locale={app.locale} onLocaleChange={app.onLocaleChange}>
      {next === 'done' ? (
        // Founder: 2FA obligatorie pentru toți (S58), deci linia apare mereu.
        <ResetDone twoStep={app.brand === 'founder' || !!known?.twoFactor} onSignIn={signIn} />
      ) : (
        <ResetNewPassword
          state={state}
          email={known?.email}
          password={password}
          onPasswordChange={(v) => {
            setPassword(v);
            if (state === 'error') setState('form');
          }}
          minLength={app.minPassword}
          lengthLabel={app.lengthLabel}
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
