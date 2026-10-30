/* eslint-disable i18next/no-literal-string -- etichetele stărilor și datele de exemplu din preview.html */
'use client';

import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import {
  ChangePasswordDialog,
  DisableTwoFactorDialog,
  MemberTwoFactorDialog,
  SecurityRows,
  type DeviceRow,
} from '@/screens/account/SecurityPageView';

const URI =
  'otpauth://totp/Ventora%20Hub:ana%40salonaurora.ro?secret=JBSWY3DPEHPK3PXPQ2NM7K4RWX5TLA6C&issuer=Ventora%20Hub&digits=6&period=30';
const CODES = [
  '4829 1736',
  '6051 2984',
  '3317 8402',
  '9275 0618',
  '1846 5390',
  '7702 4153',
  '2569 8817',
  '8034 6271',
  '5193 0745',
  '0468 3529',
];
const DEVICES: DeviceRow[] = [
  { id: 'a', icon: 'laptop', name: 'MacBook · Chrome · Sibiu', current: true },
  {
    id: 'b',
    icon: 'smartphone',
    name: 'iPhone · Safari · Sibiu',
    meta: 'Ieri, 21:40',
    current: false,
  },
];
const pw = (
  state: Parameters<typeof ChangePasswordDialog>[0]['state'],
  next: string,
  current = 'Ventora2026',
) => <ChangePasswordDialog inline state={state} current={current} next={next} forgotHref="#" />;
const member = (step: 1 | 2 | 3) => (
  <MemberTwoFactorDialog
    inline
    step={step}
    totpUri={URI}
    code={step === 2 ? '582 914' : ''}
    codes={CODES}
    confirmed={step === 3}
  />
);

// HubAccountSecurity (S100, S108): stările 1–13 din preview.html, fără pagina din spate.
export default function HubAccountSecurityStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubAccountSecurity · stări"
      column={560}
      boxes={() => [
        ['1 · Se completează', pw('idle', 'aurora2026')],
        ['2 · Toate cerințele îndeplinite', pw('idle', 'Aurora2026!')],
        ['3 · Parola actuală greșită', pw('wrong', 'Aurora2026!', 'ventora2025')],
        ['4 · Cerințe neîndeplinite', pw('reqs', 'aurora2026')],
        ['5 · Parola actuală lipsă', pw('emptyCurrent', 'Aurora2026!', '')],
        ['6 · Se salvează', pw('loading', 'Aurora2026!')],
        ['8 · Membru, neactivă', <SecurityRows key="off" twoStep="off" devices={DEVICES} />],
        ['9 · Activează · pasul 1', member(1)],
        ['10 · Pasul 2', member(2)],
        ['11 · Pasul 3', member(3)],
        [
          '12 · Membru, activă',
          <SecurityRows key="on" twoStep="on" codesLeft={10} devices={DEVICES} />,
        ],
        ['13 · Dezactivează', <DisableTwoFactorDialog key="dis" inline code="" />],
        [
          '13 · Dezactivează · cod greșit',
          <DisableTwoFactorDialog key="dis2" inline code="123456" state="wrong" />,
        ],
        [
          '13 · Dezactivează · blocat',
          <DisableTwoFactorDialog key="dis3" inline code="" state="locked" lockedTime="14:32" />,
        ],
      ]}
    />
  );
}
