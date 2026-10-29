'use client';

import { SupportBanner } from '@/screens/support/SupportSessionView';
import s from '@/screens/support/support.module.css';
import { DemoLauncher } from '../_shared/hubLauncher';
import { DEMO_SUPPORT_SESSION } from '../_shared/demo-data';

export function HubSupportSessionFrame() {
  return (
    <div className={s.frame}>
      <SupportBanner session={DEMO_SUPPORT_SESSION} manager />
      <div className={s.body}>
        <DemoLauncher />
      </div>
    </div>
  );
}
