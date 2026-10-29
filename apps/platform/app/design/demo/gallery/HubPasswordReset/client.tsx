'use client';

import { useState } from 'react';
import { AuthFrame } from '@/screens/auth/parts';
import { ResetRequest } from '@/screens/auth/PasswordResetView';

// Datele primului cadru: adresa vine completată din autentificare.
export function HubPasswordResetFrame() {
  const [email, setEmail] = useState('bianca@salonaurora.ro');
  return (
    <AuthFrame locale="ro">
      <ResetRequest email={email} onEmailChange={setEmail} />
    </AuthFrame>
  );
}
