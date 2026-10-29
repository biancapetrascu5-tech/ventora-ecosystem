import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import {
  BackupCodesLeftToast,
  TwoFactorRecovery,
  TwoFactorVerify,
} from '@/screens/auth/TwoFactorVerifyView';

const M = 'bianca@salonaurora.ro';

// preview.html → Stări 1–6, ecranul de cod de rezervă, recuperarea și R-2F10 (7, 2, 1, 0 coduri)
export default function HubTwoFactorVerifyStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubTwoFactorVerify · stări"
      boxes={() => [
        [
          'Cod de rezervă (după „Folosește un cod de rezervă”)',
          <TwoFactorVerify key="0" email={M} backup code="" />,
        ],
        ['1 · Cod greșit', <TwoFactorVerify key="1" email={M} state="wrong" code="418207" />],
        ['2 · Se verifică', <TwoFactorVerify key="2" email={M} state="loading" code="582914" />],
        [
          '3 · Cod de rezervă deja folosit',
          <TwoFactorVerify key="3" email={M} backup state="used" code="6051 2984" />,
        ],
        [
          '4 · Cod de rezervă greșit',
          <TwoFactorVerify key="4" email={M} backup state="wrong" code="6051 2948" />,
        ],
        [
          '5 · Cont blocat temporar, cu ora',
          <TwoFactorVerify key="5" email={M} state="locked" code="" lockedTime="10:45" />,
        ],
        ['6 · Au trecut 10 minute', <TwoFactorVerify key="6" email={M} state="expired" code="" />],
        ['„Nu mai am acces la telefon și nici la coduri”', <TwoFactorRecovery key="7" />],
        [
          'R-2F10 · 7 coduri (neutru, se închide singur)',
          <BackupCodesLeftToast key="t7" left={7} />,
        ],
        ['R-2F10 · 2 coduri (peach, rămâne)', <BackupCodesLeftToast key="t2" left={2} />],
        ['R-2F10 · un singur cod', <BackupCodesLeftToast key="t1" left={1} />],
        ['R-2F10 · niciun cod', <BackupCodesLeftToast key="t0" left={0} />],
      ]}
    />
  );
}
