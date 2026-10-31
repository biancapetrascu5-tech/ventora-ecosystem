'use client';

import { SuspendedBusinessView } from '@ventora/screens';
import { noop } from '../_shared/shell';

// Primul cadru: singura afacere (Salon Aurora) e suspendată; datele din preview.html.
export function HubBusinessSuspendedFrame() {
  return (
    <SuspendedBusinessView
      userName="Bianca Petrașcu"
      business="Salon Aurora"
      supportEmail="support@ventorasystems.com"
      mob={false}
      onSignOut={noop}
    />
  );
}
