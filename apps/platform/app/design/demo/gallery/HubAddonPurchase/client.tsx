/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FLOW_TX.ro, SMS, PCARD_EXP) */
'use client';

import { AddonPurchase, PageHeader, Sheet, SheetSection, UsageMeter } from '@ventora/ui';
import { HubSettings } from '../_shared/hubSettings';
import { ADDON_RO, USAGE_RO } from '../_shared/labels';
import { noop } from '../_shared/shell';
import h from '../_shared/hubBilling.module.css';

// HubAddonPurchase → primul cadru (Desktop · 1280, H 860): SMS-urile la limită, dialogul
// „500 SMS în plus” cu cardul care expiră luna aceasta (S111). În aplicație, dialogul e
// PurchaseDialog (screens/plan), cu plata prin core/billing.
export function HubAddonPurchaseFrame() {
  return (
    <div className={h.frame}>
      <HubSettings active="abonament" title="Abonament">
        <PageHeader
          title="Abonament și consum"
          description="Ce include abonamentul afacerii, cât ai folosit și ce poți cumpăra în plus."
        />
        <Sheet>
          <SheetSection title="Consum luna aceasta">
            <div className={h.usageGrid}>
              <UsageMeter
                {...USAGE_RO}
                label="SMS-uri"
                used={1000}
                limit={1000}
                onBuy={noop}
                buyLabel="Cumpără SMS-uri în plus"
                onUpgrade={noop}
              />
            </div>
          </SheetSection>
        </Sheet>
      </HubSettings>
      <div className={h.overlay}>
        <AddonPurchase
          inline
          addon={{
            name: '500 SMS în plus',
            description: 'Valabil luna aceasta · intră imediat',
            price: 49,
            icon: 'message-square',
            max: 10,
          }}
          defaultQuantity={1}
          card={{ brand: 'Visa', last4: '4242', expiry: '10/26' }}
          cardExpiring
          doneLabel="Trimite reamintirile"
          usage={{ label: 'SMS-uri', used: 1000, limitBefore: 1000, limitAfter: 2000 }}
          invoice={{ number: 'VNT-2026-0204' }}
          labels={ADDON_RO}
          usageLabels={USAGE_RO}
        />
      </div>
    </div>
  );
}
