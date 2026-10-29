'use client';

import { useState } from 'react';
import { AuthFrame } from '@/screens/auth/parts';
import { TwoFactorVerify } from '@/screens/auth/TwoFactorVerifyView';

export function HubTwoFactorVerifyFrame() {
  const [code, setCode] = useState('');
  return (
    <AuthFrame locale="ro">
      <TwoFactorVerify email="bianca@salonaurora.ro" code={code} onCodeChange={setCode} />
    </AuthFrame>
  );
}
