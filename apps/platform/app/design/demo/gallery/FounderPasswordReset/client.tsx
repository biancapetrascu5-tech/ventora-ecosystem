'use client';

import { useState } from 'react';
import { FX_MAIL } from '../_shared/founder-data';
import { AuthFrame, ResetRequest } from '@ventora/screens';

export function Frame() {
  const [email, setEmail] = useState(FX_MAIL);
  return (
    <AuthFrame brand="founder">
      <ResetRequest email={email} onEmailChange={setEmail} />
    </AuthFrame>
  );
}
