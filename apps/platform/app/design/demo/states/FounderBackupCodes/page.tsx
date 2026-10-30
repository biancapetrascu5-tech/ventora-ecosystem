import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { DEMO_BACKUP_CODES } from '../../gallery/_shared/founder-data';
import { BackupCodesBody } from '@ventora/screens';
import { noop } from './noop';

// FounderBackupCodes (S84): stările 1–6
export default function FounderBackupCodesStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      founder
      title="FounderBackupCodes · stări"
      column={480}
      boxes={() => [
        [
          '1 · Codurile rămase',
          <BackupCodesBody key="1" state="left" left={2} code="" onGenerate={noop} />,
        ],
        ['2 · Confirmarea', <BackupCodesBody key="2" state="confirm" code="" />],
        ['3 · Cod greșit', <BackupCodesBody key="3" state="wrong" code="418207" />],
        ['4 · Se verifică', <BackupCodesBody key="4" state="loading" code="582914" />],
        [
          '5 · Prea multe coduri greșite (S61)',
          <BackupCodesBody key="5" state="locked" code="" lockedTime="10:45" />,
        ],
        [
          '6 · Codurile noi, o singură dată',
          <BackupCodesBody key="6" state="new" code="" codes={DEMO_BACKUP_CODES} />,
        ],
        [
          '6b · Cu bifa: Continuă e activ',
          <BackupCodesBody
            key="7"
            state="new"
            code=""
            codes={DEMO_BACKUP_CODES}
            copied
            confirmed
          />,
        ],
      ]}
    />
  );
}
