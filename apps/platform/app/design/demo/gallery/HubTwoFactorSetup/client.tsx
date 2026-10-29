'use client';

import { AuthFrame } from '@/screens/auth/parts';
import { SetupStep1 } from '@/screens/auth/TwoFactorSetupView';
import { DEMO_TOTP_URI } from '../_shared/demo-data';

export function HubTwoFactorSetupFrame() {
  return (
    <AuthFrame locale="ro">
      <SetupStep1 totpUri={DEMO_TOTP_URI} />
    </AuthFrame>
  );
}
