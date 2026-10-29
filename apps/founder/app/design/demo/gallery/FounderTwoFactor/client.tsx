'use client';

import { AuthFrame } from '@/screens/auth/parts';
import { SetupStep1 } from '@/screens/auth/TwoFactorSetupView';
import { DEMO_TOTP_URI } from '../../_shared/demo-data';

export function Frame() {
  return (
    <AuthFrame>
      <SetupStep1 founder totpUri={DEMO_TOTP_URI} />
    </AuthFrame>
  );
}
