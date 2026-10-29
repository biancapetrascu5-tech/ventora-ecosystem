'use client';

import { useState } from 'react';
import { AuthFrame } from '@/screens/auth/parts';
import { InviteView } from '@/screens/auth/InviteView';
import { DEMO_INVITE } from '../_shared/demo-data';

export function HubInviteFrame() {
  const [name, setName] = useState('Ioana Pavel');
  const [password, setPassword] = useState('aurora2026');
  const [terms, setTerms] = useState(true);
  return (
    <AuthFrame locale="ro" wide>
      <InviteView
        invite={DEMO_INVITE}
        name={name}
        password={password}
        terms={terms}
        onNameChange={setName}
        onPasswordChange={setPassword}
        onTermsChange={setTerms}
      />
    </AuthFrame>
  );
}
