'use client';

import { DEMO_TOTP_URI } from '../_shared/demo-data';
import { AuthFrame, SetupStep1 } from '@ventora/screens';

export function HubTwoFactorSetupFrame() {
  return (
    <AuthFrame locale="ro">
      <SetupStep1 totpUri={DEMO_TOTP_URI} />
    </AuthFrame>
  );
}
