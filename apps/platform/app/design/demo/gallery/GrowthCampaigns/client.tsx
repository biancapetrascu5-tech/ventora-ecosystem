/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FX_CAMPAIGNS) */
'use client';

import { GrowthCampaignsView, type GrowthCampaignRow } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// GCamps din preview.html (GrowthCampaigns, S136): cele 4 campanii FX_CAMPAIGNS.
const ROWS: GrowthCampaignRow[] = [
  {
    id: '1',
    name: 'EasyBook fără ClientDesk',
    mode: 'Automat · integrare lipsă',
    offer: 'ClientDesk · 69 lei pe lună',
    slots: 'EasyBook · Azi, Launcher',
    annoy: 2.1,
    state: 'active',
  },
  {
    id: '2',
    name: 'SMS peste 80%',
    mode: 'Automat · consum',
    offer: '500 SMS în plus',
    slots: 'Abonament, EasyBook · Setări',
    annoy: 1.4,
    state: 'active',
  },
  {
    id: '3',
    name: 'DataView de Black Friday',
    mode: 'Programat · 20–30 nov.',
    offer: 'DataView, 14 zile gratuit',
    slots: 'Launcher, Notificări',
    annoy: null,
    state: 'scheduled',
  },
  {
    id: '4',
    name: 'CampaignKit pentru saloane',
    mode: 'Automat · vechime',
    offer: 'CampaignKit · 49 lei pe lună',
    slots: 'EasyBook · Azi',
    annoy: 6.2,
    state: 'autoStopped',
  },
];

export function GrowthCampaignsFrame({ phone }: { phone?: boolean }) {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="campanii" title="Campanii">
          <GrowthCampaignsView
            mode={phone ? 'mobile' : 'desktop'}
            rows={ROWS}
            onNew={noop}
            onEdit={noop}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}
