/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AddonPurchase, Dialog, UsageMeter, type AddonData } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import { ADDON_RO, USAGE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Demo → Frame({ th: "light" }): Flow(AP.ro, ALL) + dialogurile „Limita atinsă”
const CARD = { brand: 'Visa', last4: '4242', expiry: '08/28' };
const CAMP: AddonData = {
  name: '10 campanii în plus',
  description: 'Pentru luna curentă · se adaugă imediat în CampaignKit',
  price: 39,
  icon: 'megaphone',
  max: 10,
};
const USAGE = { label: 'Campanii', used: 10, limitBefore: 10, limitAfter: 20 };
const ERROR = { title: 'Banca a refuzat plata', message: 'Banca spune: cardul a expirat.' };
const noop = () => {};
const L = ADDON_RO;

function Flow() {
  return (
    <div className={f.dlggrid}>
      <AddonPurchase
        addon={CAMP}
        card={CARD}
        defaultQuantity={3}
        onPay={noop}
        onChangeCard={noop}
        labels={L}
        usageLabels={USAGE_RO}
      />
      <AddonPurchase addon={CAMP} card={null} labels={L} />
      <AddonPurchase addon={CAMP} card={CARD} state="processing" labels={L} />
      <AddonPurchase
        addon={CAMP}
        card={CARD}
        state="success"
        usage={USAGE}
        invoice={{ number: 'VNT-2026-0204', onOpen: noop }}
        onDone={noop}
        labels={L}
        usageLabels={USAGE_RO}
      />
      <AddonPurchase
        addon={CAMP}
        card={CARD}
        state="success"
        usage={USAGE}
        invoice={{ pending: true }}
        onDone={noop}
        labels={L}
        usageLabels={USAGE_RO}
      />
      <AddonPurchase
        addon={CAMP}
        card={CARD}
        state="error"
        error={ERROR}
        onRetry={noop}
        onUseOtherCard={noop}
        labels={L}
      />
    </div>
  );
}

function Light() {
  return (
    <>
      <p className={`caption ${f.muted}`}>
        Stările fluxului: confirmare (card salvat) · confirmare fără card (locul formularului
        Stripe) · se procesează · reușită · reușită, factura vine în curând (S111) · eroare
      </p>
      <Flow />
      <p className={`caption ${f.muted}`}>
        Limita atinsă — proprietarul cumpără direct; ceilalți află cine poate face asta
      </p>
      <div className={f.dlggrid}>
        <Dialog
          inline
          closeLabel={L.close}
          title="Ai atins limita de campanii"
          description="Campaniile deja programate pleacă normal. Ca să trimiți altele luna aceasta, ai nevoie de un pachet în plus."
        >
          <UsageMeter
            {...USAGE_RO}
            label="Campanii trimise"
            used={10}
            limit={10}
            onBuy={noop}
            buyLabel="Cumpără campanii în plus"
            onUpgrade={noop}
          />
        </Dialog>
        <Dialog
          inline
          closeLabel={L.close}
          title="Ai atins limita de campanii"
          description="Campaniile deja programate pleacă normal."
        >
          <UsageMeter
            {...USAGE_RO}
            label="Campanii trimise"
            used={10}
            limit={10}
            owner="Bianca Petrașcu"
            onNotifyOwner={noop}
          />
        </Dialog>
      </div>
    </>
  );
}

export default function AddonPurchaseGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <ThStack bare titleClass="caption" render={(th) => (th === 'light' ? <Light /> : <Flow />)} />
  );
}
