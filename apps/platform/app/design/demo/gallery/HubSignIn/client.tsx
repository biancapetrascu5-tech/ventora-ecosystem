'use client';

import { useState } from 'react';
import { AuthFrame } from '@/screens/auth/parts';
import { SignInView } from '@/screens/auth/SignInView';

// Datele din preview: adresa completată, o parolă de test, „Ține-mă minte” nebifat.
export function HubSignInFrame() {
  const [email, setEmail] = useState('bianca@salonaurora.ro');
  const [password, setPassword] = useState('ventora2026');
  const [remember, setRemember] = useState(false);
  return (
    <AuthFrame locale="ro">
      <SignInView
        email={email}
        password={password}
        remember={remember}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onRememberChange={setRemember}
      />
    </AuthFrame>
  );
}
