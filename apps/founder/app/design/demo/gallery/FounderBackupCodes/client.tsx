'use client';

import { BackupCodesPage } from '@/screens/codes/BackupCodesView';
import { FounderShell } from '@/screens/shell/FounderShell';
import { FX_NOTIFS, FX_USER } from '../../_shared/demo-data';

export function Frame() {
  return (
    <FounderShell
      title="Coduri de rezervă"
      user={FX_USER}
      notifications={FX_NOTIFS}
      businessesBadge={3}
    >
      <BackupCodesPage state="left" left={2} code="" onGenerate={() => {}} />
    </FounderShell>
  );
}
