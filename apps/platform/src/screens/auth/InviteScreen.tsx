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
import { acceptInvite, requestNewInvite } from '@/server/invite-actions';

/* HubInvite pentru un cont nou (Lot 2.6 · E): contul se creează cu adresa din invitație, apoi
   invitația e acceptată pe server pentru sesiunea nouă. Expirată → „Cere o invitație nouă”;
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
    const created = await authApi.signUp(name.trim(), invite.email, password);
    if (!created.ok) {
      setState('form');
      return;
    }
    const res = await acceptInvite(token);
    if (!res.ok) {
      setState(res.reason === 'expired' ? 'expired' : res.reason === 'used' ? 'used' : 'form');
      return;
    }
    // Proprietarul activează 2FA acum (R-2F1); /two-factor/enable cere parola, doar în memorie.
    if (res.to === app.routes.twoFactorSetup) setHandoff({ password });
    router.push(res.to);
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
