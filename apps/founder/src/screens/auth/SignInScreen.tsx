'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth-api';
import { readHandoff, setHandoff } from '@/lib/handoff';
import { AuthFrame } from './parts';
import { SignInView, type SignInState } from './SignInView';
import { useIsPhone, useLocaleSwitch } from './hooks';

export function SignInScreen() {
  const router = useRouter();
  const phone = useIsPhone();
  const lang = useLocaleSwitch();
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
      router.push('/two-factor');
      return;
    }
    // Founder fără 2FA: activarea e obligatorie (T1.8); /two-factor/enable cere parola (handoff).
    setHandoff({ password });
    router.push('/setup-2fa');
  }

  return (
    <AuthFrame {...lang}>
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
        onSubmit={submit}
        inviteNote={false}
        onForgot={() => {
          setHandoff({ email: email.trim() });
          router.push('/forgot-password');
        }}
      />
    </AuthFrame>
  );
}
