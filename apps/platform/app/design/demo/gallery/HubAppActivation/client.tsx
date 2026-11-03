/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (Activate, CARD_) */
'use client';

import { AddonPurchase } from '@ventora/ui';
import { CatalogAppPage } from '../HubCatalogApp/client';
import { ADDON_RO } from '../_shared/labels';
import h from '../_shared/hubBilling.module.css';

// HubAppActivation → „1 · Direct: implementarea, mentenanța proporțională și ce include” →
// Desktop · 1280 (H 900): AddonPurchase peste pagina CampaignKit — 49 lei pe lună, 150 lei
// implementare, azi proporțional 14 / 31 zile. În aplicație, sumele vin din core/billing.
const MONTHLY = 49;
const TODAY = Math.round(((MONTHLY * 14) / 31) * 100) / 100;
const lei = (n: number) =>
  `${n.toLocaleString('ro-RO', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} lei`;

export function HubAppActivationFrame() {
  return (
    <CatalogAppPage
      overlay={
        <div className={h.overlay}>
          <AddonPurchase
            inline
            addon={{
              name: 'CampaignKit',
              title: 'Activezi CampaignKit',
              description: 'Aplicație la bucată · mentenanță 49 lei pe lună',
              price: MONTHLY,
              icon: 'megaphone',
              max: 1,
              includes: ['10 campanii pe lună', '2.000 de e-mailuri pe lună'],
            }}
            card={{ brand: 'Visa', last4: '4242', expiry: '08/28' }}
            prorate={{ today: TODAY, until: '17 noiembrie', monthly: MONTHLY }}
            setup={150}
            format={lei}
            labels={ADDON_RO}
          />
        </div>
      }
    />
  );
}
