'use client';

import { useState } from 'react';
import { AuthFrame } from '@/screens/auth/parts';
import { ResetRequest } from '@/screens/auth/PasswordResetView';
import { FX_MAIL } from '../../_shared/demo-data';

export function Frame() {
  const [email, setEmail] = useState(FX_MAIL);
  return (
    <AuthFrame>
      <ResetRequest email={email} onEmailChange={setEmail} />
    </AuthFrame>
  );
}
