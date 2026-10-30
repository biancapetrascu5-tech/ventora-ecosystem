'use client';

import { DEMO_TOTP_URI } from '../_shared/founder-data';
import { AuthFrame, SetupStep1 } from '@ventora/screens';

export function Frame() {
  return (
    <AuthFrame brand="founder">
      <SetupStep1 founder totpUri={DEMO_TOTP_URI} />
    </AuthFrame>
  );
}
