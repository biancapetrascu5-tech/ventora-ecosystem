 
import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { DEMO_BACKUP_CODES } from '../../gallery/_shared/demo-data';
import { BackupCodesFlow, SecurityEmailsRow } from '@/screens/account/SecurityView';

// HubAccount · Securitate: „Generează coduri noi” cu stările din FounderBackupCodes (S84),
// plus rândul informativ „E-mailuri de securitate” (S83, nedesenat: forma e de validat).
export default function HubAccountStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubAccount · Securitate · stări"
      column={480}
      boxes={() => [
        ['Confirmă cu codul din aplicație', <BackupCodesFlow key="a" state="confirm" code="" />],
        ['Cod greșit', <BackupCodesFlow key="b" state="wrong" code="418207" />],
        ['Se verifică', <BackupCodesFlow key="c" state="loading" code="582914" />],
        [
          'Prea multe coduri greșite (15 minute)',
          <BackupCodesFlow key="d" state="locked" code="" lockedTime="10:45" />,
        ],
        [
          'Codurile noi, o singură dată · fără bifă',
          <BackupCodesFlow key="e" state="new" code="" codes={DEMO_BACKUP_CODES} />,
        ],
        [
          'Codurile noi · cu bifa',
          <BackupCodesFlow
            key="f"
            state="new"
            code=""
            codes={DEMO_BACKUP_CODES}
            copied
            confirmed
          />,
        ],
        ['Notificări · rândul „E-mailuri de securitate”', <SecurityEmailsRow key="g" />],
      ]}
    />
  );
}
