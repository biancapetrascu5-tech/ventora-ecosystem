/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FX_CAMPAIGNS, jurnalul) */
'use client';

import { GrowthControlView } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// GCtl din preview.html (GrowthControl, S136): cele 4 campanii FX_CAMPAIGNS, cele 5 sloturi,
// plafoanele implicite 1 / 3 / 30, pragul 5% și cele 3 rânduri din jurnal.
const CAMPAIGNS = [
  { id: '1', label: 'EasyBook fără ClientDesk', on: true },
  { id: '2', label: 'SMS peste 80%', on: true },
  { id: '3', label: 'DataView de Black Friday', on: true, note: 'Programată' },
  { id: '4', label: 'CampaignKit pentru saloane', on: false, note: 'Oprită: deranj peste prag' },
];
const SLOTS = [
  { id: 'a', label: 'EasyBook · Azi', on: true },
  { id: 'b', label: 'Launcher · Alte aplicații Ventora Systems', on: true },
  { id: 'c', label: 'Notificări · Recomandări', on: true },
  { id: 'd', label: 'Abonament și consum', on: true },
  { id: 'e', label: 'EasyBook · Setări', on: false },
];
const LOG = [
  {
    id: 1,
    when: 'azi, 09:41',
    what: 'Oprită automat: „Marketing pentru saloane” (deranj 6,2%)',
    who: 'Sistem',
  },
  { id: 2, when: 'ieri, 17:02', what: 'Slot oprit: EasyBook · Setări', who: 'Bianca Petrașcu' },
  { id: 3, when: '20 oct., 11:15', what: 'Plafon pe săptămână: 4 → 3', who: 'Bianca Petrașcu' },
];

export function GrowthControlFrame({ phone }: { phone?: boolean }) {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="control" title="Control">
          <GrowthControlView
            mode={phone ? 'mobile' : 'desktop'}
            paused={false}
            campaigns={CAMPAIGNS}
            slots={SLOTS}
            caps={{ daily: 1, weekly: 3, cooldown: 30 }}
            log={LOG}
            onStop={noop}
            onStart={noop}
            onSaveCaps={noop}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}
