/* eslint-disable i18next/no-literal-string -- titlul din preview.html */
'use client';

import { BackupCodesPage } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';

// preview.html → 1 · Codurile rămase (2 din 10), în shell-ul Founder
export function Frame() {
  return (
    <FounderShellDemo title="Coduri de rezervă">
      <BackupCodesPage state="left" left={2} code="" onGenerate={() => {}} />
    </FounderShellDemo>
  );
}
