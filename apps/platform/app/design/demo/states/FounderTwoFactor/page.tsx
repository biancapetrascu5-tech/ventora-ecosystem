import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { DEMO_BACKUP_CODES, FX_MAIL } from '../../gallery/_shared/founder-data';
import {
  SetupStep2,
  SetupStep3,
  BackupCodesLeftToast,
  TwoFactorRecovery,
  TwoFactorVerify,
} from '@ventora/screens';

// preview.html → verificarea, pasul 2 greșit, pasul 3, codul de rezervă, blocat, fără acces,
// apoi toastul după intrarea cu un cod de rezervă (7, 2, 1, 0 coduri; S81)
export default function FounderTwoFactorStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      founder
      title="FounderTwoFactor · stări"
      boxes={() => [
        ['Verificarea', <TwoFactorVerify key="a" email={FX_MAIL} code="" />],
        ['Pasul 2 · cod greșit', <SetupStep2 key="b" state="wrong" code="418207" />],
        ['Pasul 3', <SetupStep3 key="c" codes={DEMO_BACKUP_CODES} confirmed />],
        ['Cod de rezervă', <TwoFactorVerify key="d" email={FX_MAIL} backup code="" />],
        [
          'Blocat',
          <TwoFactorVerify key="e" email={FX_MAIL} state="locked" code="" lockedTime="10:45" />,
        ],
        ['Fără acces', <TwoFactorRecovery key="f" />],
        ['Toast · 7 coduri', <BackupCodesLeftToast key="t7" left={7} />],
        ['Toast · 2 coduri', <BackupCodesLeftToast key="t2" left={2} />],
        ['Toast · un singur cod', <BackupCodesLeftToast key="t1" left={1} />],
        ['Toast · niciun cod', <BackupCodesLeftToast key="t0" left={0} />],
      ]}
    />
  );
}
