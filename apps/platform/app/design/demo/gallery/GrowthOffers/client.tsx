/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (GOffers) */
'use client';

import { GrowthOffersView, type GrowthOfferRow } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// GOffers din preview.html (GrowthOffers, S136): cele 4 oferte de exemplu.
const ROWS: GrowthOfferRow[] = [
  {
    id: '1',
    name: 'ClientDesk pentru clienții din EasyBook',
    kind: 'app',
    approved: 6,
    total: 6,
    state: 'active',
  },
  { id: '2', name: '500 SMS în plus', kind: 'addon', approved: 6, total: 6, state: 'active' },
  {
    id: '3',
    name: 'DataView, 14 zile gratuit',
    kind: 'trial',
    approved: 3,
    total: 6,
    state: 'review',
  },
  {
    id: '4',
    name: 'Business Plus pentru afacerile la limită',
    kind: 'plan',
    approved: 1,
    total: 6,
    state: 'draft',
  },
];

export function GrowthOffersFrame({ phone }: { phone?: boolean }) {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="oferte" title="Oferte">
          <GrowthOffersView
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
