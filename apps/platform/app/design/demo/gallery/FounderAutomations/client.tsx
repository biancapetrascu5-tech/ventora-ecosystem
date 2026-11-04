/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (AUTOS, FX_NOTIFS) */
'use client';

import { useTranslations } from 'next-intl';
import type { NotificationData } from '@ventora/ui';
import { AutomationsListView, type AutomationListRow } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// Primul cadru din preview.html: lista celor 6 automatizări v1 (AUTOS), în Spine-ul S116
// („Suport” după „Cereri”, „Automatizări” primul în „Sistem”), cu intrările de jos ale FX_App.
const AUTOS: [string, string, string, number, string, string][] = [
  ['thanks', 'Programarea trece în „Încheiată” · după 2 ore', 'EasyBook', 38, '4.210', '1,2%'],
  [
    'winback',
    'Zilnic, 10:00 · clienți fără programare de X săptămâni',
    'EasyBook',
    21,
    '1.880',
    '0,4%',
  ],
  ['birthday', 'Zilnic, 09:00 · ziua de naștere a clientului', 'EasyBook', 17, '940', '0,8%'],
  ['risk', 'Clientul ajunge la „Risc ridicat”', 'EasyBook', 44, '126', '0%'],
  [
    'digest',
    'Zilnic, 07:00 · pentru fiecare membru cu programări',
    'EasyBook',
    29,
    '6.320',
    '2,1%',
  ],
  ['quota', 'O cotă din abonament trece de 80%', 'Hub', 52, '212', '0%'],
];

const NOTIFS: NotificationData[] = [
  {
    id: 1,
    title: 'Solicitare nouă de la Salon Aurora',
    body: 'EasyBook · Avansul nu apare în fișa clientului',
    app: 'Suport',
    time: 'acum 12 min',
    icon: 'life-buoy',
  },
  {
    id: 2,
    title: '„Rezumatul zilei” a eșuat de 3 ori',
    body: 'Fitness Atlas · adresa unui membru respinge e-mailurile',
    app: 'Automatizări',
    time: 'azi, 07:05',
    icon: 'triangle-alert',
  },
];

export function FounderAutomationsFrame() {
  const hub = useTranslations('automations');
  const rows: AutomationListRow[] = AUTOS.map(([key, trigger, app, n, runs, failed], i) => ({
    id: i,
    name: hub(`a.${key}.name`),
    app,
    trigger,
    activeCount: n,
    runs,
    failed,
  }));
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo
          active="automatizari"
          title="Automatizări"
          bottomItems={['afaceri', 'cereri', 'suport', 'automatizari']}
          searchLabel="Caută o afacere, o solicitare sau o automatizare"
          notifications={NOTIFS}
          businessesBadge={false}
        >
          <AutomationsListView
            rows={rows}
            onNew={noop}
            onEdit={noop}
            onBusinesses={noop}
            onLog={noop}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}
