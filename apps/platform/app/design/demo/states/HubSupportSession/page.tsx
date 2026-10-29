/* eslint-disable i18next/no-literal-string -- etichetele stărilor (documentație) */
import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { DEMO_SUPPORT_SESSION } from '../../gallery/_shared/demo-data';
import {
  CloseSupportDialog,
  SupportBanner,
  SupportClosedToast,
  SupportSessionsSection,
  type SessionRow,
} from '@/screens/support/SupportSessionView';

const ROWS: SessionRow[] = [
  {
    id: '1',
    who: 'Mihai Ionescu',
    reason: 'Programările de joi nu apar în calendar',
    ticket: 'VS-2026-0142',
    when: '28 oct., 14:30',
    status: { kind: 'active', expiresAt: '16:30' },
  },
  {
    id: '2',
    who: 'Bianca Petrașcu',
    reason: 'Factura de septembrie nu se descarcă',
    ticket: 'VS-2026-0118',
    when: '12 oct., 10:05',
    status: { kind: 'closedBy', name: 'Ioana Pavel' },
  },
  {
    id: '3',
    who: 'Mihai Ionescu',
    reason: 'Import clienți din Excel',
    ticket: 'VS-2026-0097',
    when: '29 sep., 09:40',
    status: { kind: 'expired' },
  },
  {
    id: '4',
    who: 'Andrei Popa',
    reason: 'Verificare raport lunar',
    ticket: 'VS-2026-0090',
    when: '20 sep., 11:15',
    status: { kind: 'closedAuto' },
  },
];

// preview.html → Board2 1–6; rândul „Închisă automat” e nou (NECESITĂ DECIZIE)
export default function HubSupportSessionStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubSupportSession · stări"
      column={1040}
      boxes={() => [
        [
          '1 · Banner · proprietar sau admin',
          <SupportBanner key="a" session={DEMO_SUPPORT_SESSION} manager />,
          true,
        ],
        [
          '2 · Banner · membru: fără motiv, fără „Închide sesiunea”',
          <SupportBanner key="b" session={DEMO_SUPPORT_SESSION} manager={false} />,
          true,
        ],
        [
          'Banner · telefon · proprietar',
          <div key="c" style={{ width: 390 }}>
            <SupportBanner session={DEMO_SUPPORT_SESSION} manager mob />
          </div>,
          true,
        ],
        ['3 · „Închide sesiunea”: confirmarea', <CloseSupportDialog key="d" inline />, true],
        [
          '4 · Toastul după închidere',
          <div key="e" style={{ width: 360 }}>
            <SupportClosedToast />
          </div>,
          true,
        ],
        [
          '5 · Sesiunile active și trecute (S91), cu „Închisă automat”',
          <SupportSessionsSection key="f" rows={ROWS} page={1} pageSize={20} total={4} />,
          true,
        ],
        [
          '5b · Paginare (page / pageSize, A5)',
          <SupportSessionsSection key="g" rows={ROWS} page={2} pageSize={4} total={23} />,
          true,
        ],
        [
          '6 · Nicio sesiune până acum',
          <SupportSessionsSection key="h" rows={[]} page={1} pageSize={20} total={0} />,
          true,
        ],
      ]}
    />
  );
}
