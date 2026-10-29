'use client';

import { useState } from 'react';
import { AuthFrame, TwoFactorVerify } from '@ventora/screens';

export function HubTwoFactorVerifyFrame() {
  const [code, setCode] = useState('');
  return (
    <AuthFrame locale="ro">
      <TwoFactorVerify email="bianca@salonaurora.ro" code={code} onCodeChange={setCode} />
    </AuthFrame>
  );
}
