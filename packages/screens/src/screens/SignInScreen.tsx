'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '../auth-api';
import { readHandoff, setHandoff } from '../handoff';
import { AuthFrame, useClock } from '../parts';
import { FounderSignInView } from '../founder/FounderSignInView';
import { SignInView, type SignInState } from '../SignInView';
import { useAuthApp } from './config';
import { useIsPhone } from './hooks';

/* Intrarea: HubSignIn; în Founder, FounderSignIn (S101: doar română, fără „Ține-mă minte” și
   fără nota despre invitații; prea multe încercări arată ora, S102). */
export function SignInScreen() {
  const router = useRouter();
  const phone = useIsPhone();
  const app = useAuthApp();
  const [email, setEmail] = useState(() => readHandoff().email ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false); // nebifat implicit (README HubSignIn)
  const [state, setState] = useState<SignInState>('idle');
  const [lockedTime, setLockedTime] = useState<string>();
  const clock = useClock();
  const founder = app.brand === 'founder';

  async function submit() {
    if (!email.trim() || !password) {
      setState('error');
      return;
    }
    setState('loading');
    const res = await signIn(email.trim(), password, remember);
    if (!res.ok) {
      if (res.kind === 'rateLimited') setLockedTime(res.retryAt ? clock(res.retryAt) : undefined);
      setState(res.kind === 'offline' ? 'offline' : res.kind === 'rateLimited' ? 'limit' : 'error');
      return;
    }
    setHandoff({ email: email.trim() });
    if (res.data.twoFactorRedirect) {
      router.push(app.routes.twoFactor);
      return;
    }
    // Fără 2FA: activarea (proprietar în Hub, oricine în Founder) cere parola la
    // /two-factor/enable; o dăm mai departe doar în memorie (handoff).
    const to = await app.afterSignIn();
    if (to === app.routes.twoFactorSetup) setHandoff({ password });
    router.push(to);
  }

  const onForgot = () => {
    setHandoff({ email: email.trim() });
    router.push(app.routes.forgotPassword);
  };
  const onPasswordChange = (v: string) => {
    setPassword(v);
    if (state === 'error') setState('idle');
  };

  if (founder)
    return (
      <AuthFrame brand="founder" locale={app.locale}>
        <FounderSignInView
          state={state}
          email={email}
          password={password}
          lockedTime={lockedTime}
          onEmailChange={setEmail}
          onPasswordChange={onPasswordChange}
          mob={phone}
          onSubmit={submit}
          onForgot={onForgot}
        />
      </AuthFrame>
    );

  return (
    <AuthFrame brand={app.brand} locale={app.locale} onLocaleChange={app.onLocaleChange}>
      <SignInView
        state={state}
        email={email}
        password={password}
        remember={remember}
        onEmailChange={setEmail}
        onPasswordChange={onPasswordChange}
        onRememberChange={setRemember}
        mob={phone}
        inviteNote={app.brand === 'hub'}
        onSubmit={submit}
        onForgot={onForgot}
      />
    </AuthFrame>
  );
}
