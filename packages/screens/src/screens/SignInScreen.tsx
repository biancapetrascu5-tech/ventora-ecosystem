'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '../auth-api';
import { readHandoff, setHandoff } from '../handoff';
import { AuthFrame } from '../parts';
import { SignInView, type SignInState } from '../SignInView';
import { useAuthApp } from './config';
import { useIsPhone } from './hooks';

/* Intrarea (HubSignIn; în Founder aceeași vedere cu panoul Founder, fără nota de invitație). */
export function SignInScreen() {
  const router = useRouter();
  const phone = useIsPhone();
  const app = useAuthApp();
  const [email, setEmail] = useState(() => readHandoff().email ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false); // nebifat implicit (README HubSignIn)
  const [state, setState] = useState<SignInState>('idle');

  async function submit() {
    if (!email.trim() || !password) {
      setState('error');
      return;
    }
    setState('loading');
    const res = await signIn(email.trim(), password, remember);
    if (!res.ok) {
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

  return (
    <AuthFrame brand={app.brand} locale={app.locale} onLocaleChange={app.onLocaleChange}>
      <SignInView
        state={state}
        email={email}
        password={password}
        remember={remember}
        onEmailChange={setEmail}
        onPasswordChange={(v) => {
          setPassword(v);
          if (state === 'error') setState('idle');
        }}
        onRememberChange={setRemember}
        mob={phone}
        inviteNote={app.brand === 'hub'}
        onSubmit={submit}
        onForgot={() => {
          setHandoff({ email: email.trim() });
          router.push(app.routes.forgotPassword);
        }}
      />
    </AuthFrame>
  );
}
