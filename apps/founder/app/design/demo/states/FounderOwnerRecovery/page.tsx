import { notFound } from 'next/navigation';
import { StateBoard } from '../../_shared/StateBoard';
import { DEMO_OWNERS } from '../../_shared/demo-data';
import {
  EMPTY_RECOVERY,
  RecoveryConfirmDialog,
  RecoveryForm,
  type RecoveryValues,
} from '@/screens/recovery/OwnerRecoveryView';
import { DoneBox } from './client';

const FILLED: RecoveryValues = {
  owner: 'am',
  ticket: 'VS-2026-0151',
  reason:
    'Proprietarul a pierdut telefonul cu aplicația și nu mai are codurile de rezervă; cere acces nou.',
  checks: ['email', 'phone'],
  compromised: false,
  identity: true,
  variant: 'B',
  code: '582914',
};

// preview.html → Board2 1–11 (fără pagina afacerii din fundal; formularul din Drawer)
export default function FounderOwnerRecoveryStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const o = DEMO_OWNERS;
  return (
    <StateBoard
      title="FounderOwnerRecovery · stări"
      column={512}
      boxes={() => [
        [
          '1 · Formularul gol: butonul inactiv',
          <RecoveryForm key="1" values={EMPTY_RECOVERY} owners={o} />,
        ],
        [
          '2 · Completat corect (e-mail + telefon, B)',
          <RecoveryForm key="2" values={FILLED} owners={o} />,
        ],
        [
          '3 · Adresa compromisă, fără admin: regula nu e respectată',
          <RecoveryForm key="3" values={{ ...FILLED, compromised: true }} owners={o} />,
        ],
        [
          '4 · Compromisă, telefon + admin, varianta A',
          <RecoveryForm
            key="4"
            values={{ ...FILLED, compromised: true, checks: ['phone', 'admin'], variant: 'A' }}
            owners={o}
          />,
        ],
        [
          '5 · Confirmarea, varianta B',
          <RecoveryConfirmDialog
            key="5"
            inline
            ownerName="Andrei Mureșan"
            email="andrei@dentis.ro"
            variant="B"
          />,
        ],
        [
          '6 · Cod greșit',
          <RecoveryForm
            key="6"
            values={{ ...FILLED, code: '418207' }}
            owners={o}
            flags={{ wrongCode: true }}
          />,
        ],
        [
          '7 · Blocat 15 minute, cu ora (lockedUntil)',
          <RecoveryForm
            key="7"
            values={{ ...FILLED, code: '' }}
            owners={o}
            flags={{ lockedTime: '10:45' }}
          />,
        ],
        [
          '8 · Serverul refuză regula',
          <RecoveryForm key="8" values={FILLED} owners={o} flags={{ refused: true }} />,
        ],
        [
          '9 · Se trimite',
          <RecoveryForm key="9" values={FILLED} owners={o} flags={{ loading: true }} />,
        ],
        ['10 · Reușit, varianta B', <DoneBox key="10" variant="B" />],
        ['11 · Reușit, varianta A', <DoneBox key="11" variant="A" />],
      ]}
    />
  );
}
