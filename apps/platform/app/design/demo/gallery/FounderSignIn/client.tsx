'use client';

import { useState } from 'react';
import { AuthFrame, FounderSignInView } from '@ventora/screens';

// Primul cadru: formularul gol.
export function Frame() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <AuthFrame brand="founder">
      <FounderSignInView
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
      />
    </AuthFrame>
  );
}
