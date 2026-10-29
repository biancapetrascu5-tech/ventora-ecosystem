import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { AppsDialog, SetupStep1, SetupStep2, SetupStep3 } from '@/screens/auth/TwoFactorSetupView';
import { DEMO_BACKUP_CODES as CODES, DEMO_TOTP_URI } from '../../gallery/_shared/demo-data';

// preview.html → Pașii 2 și 3 și Stări 1–7
export default function HubTwoFactorSetupStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubTwoFactorSetup · stări"
      boxes={() => [
        ['Pasul 2 · Codul din aplicație', <SetupStep2 key="s2" code="" />],
        ['Pasul 3 · Codurile de rezervă', <SetupStep3 key="s3" codes={CODES} confirmed={false} />],
        ['1 · Pasul 1, după „Copiază”', <SetupStep1 key="1" totpUri={DEMO_TOTP_URI} copied />],
        ['2 · „Ce aplicație folosesc?”', <AppsDialog key="2" inline />],
        ['3 · Pasul 2, cod greșit', <SetupStep2 key="3" state="wrong" code="418207" />],
        ['4 · Pasul 2, se verifică', <SetupStep2 key="4" state="loading" code="582914" />],
        [
          '5 · Pasul 2, blocat 15 minute',
          <SetupStep2 key="5" state="locked" code="" lockedTime="10:45" />,
        ],
        [
          '6 · Pasul 3, după „Copiază”, fără bifă',
          <SetupStep3 key="6" codes={CODES} copied confirmed={false} />,
        ],
        ['7 · Pasul 3, cu bifa', <SetupStep3 key="7" codes={CODES} copied confirmed />],
      ]}
    />
  );
}
