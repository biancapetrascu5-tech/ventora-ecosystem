'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthFrame,
  InviteView,
  authApi,
  passwordMeetsRules,
  setHandoff,
  useAuthApp,
  useIsPhone,
  type InviteData,
  type InviteState,
} from '@ventora/screens';
import { requestNewInvite, signUpFromInvite } from '@/server/invite-actions';

/* HubInvite pentru un cont nou (Lot 2.6 · E, Lot 2.7 · A): contul și acceptarea invitației se fac
   împreună pe server, cu adresa din invitație; apoi intrarea obișnuită cu parola. Expirată → „Cere o invitație nouă”;
   folosită → intrarea; anulată → doar mesajul. Butonul nu trimite până nu sunt toate câmpurile
   (numele, parola cu cerințele bifate, termenii): starea de eroare nu e desenată. */
export function InviteScreen({
  token,
  invite,
  initialState,
}: {
  token: string;
  invite: InviteData;
  initialState: InviteState;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const app = useAuthApp();
  const [state, setState] = useState<InviteState>(initialState);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);

  async function submit() {
    if (!name.trim() || !passwordMeetsRules(password, app.minPassword) || !terms) return;
    setState('loading');
    const created = await signUpFromInvite({
      token,
      name: name.trim(),
      email: invite.email,
      password,
    });
    if (!created.ok) {
      const r = created.reason;
      setState(r === 'expired' || r === 'used' || r === 'revoked' ? r : 'form');
      return;
    }
    const signedIn = await authApi.signIn(invite.email, password, false);
    if (!signedIn.ok) {
      router.push(app.routes.signIn);
      return;
    }
    const to = await app.afterSignIn();
    // Proprietarul activează 2FA acum (R-2F1); /two-factor/enable cere parola, doar în memorie.
    if (to === app.routes.twoFactorSetup) setHandoff({ password });
    router.push(to);
  }

  return (
    <AuthFrame brand="hub" locale={app.locale} onLocaleChange={app.onLocaleChange} wide>
      <InviteView
        state={state}
        invite={invite}
        name={name}
        password={password}
        terms={terms}
        onNameChange={setName}
        onPasswordChange={setPassword}
        onTermsChange={setTerms}
        mob={phone}
        onSubmit={submit}
        onRequestNew={async () => {
          if (await requestNewInvite(token)) setState('requested');
        }}
        onSignIn={() => router.push(app.routes.signIn)}
      />
    </AuthFrame>
  );
}
