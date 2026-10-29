/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { GrowthSlot, RecommendationCard } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import { RECO_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → C3Frame light / dark → c3stack (GSCard(GST.ro) + slotul gol)
const noop = () => {};

function Body() {
  return (
    <div className={f.c3stack}>
      <p className={`caption ${f.c3lab}`}>Cu conținut</p>
      <GrowthSlot label="Recomandare">
        <RecommendationCard
          app="crm"
          title="Ține istoricul clienților în ClientDesk"
          benefit="Clienții tăi din programări pot avea istoric, note și follow-up în ClientDesk."
          cost="69 lei pe lună · fără cost de implementare"
          actionLabel="Vezi opțiunile"
          onAction={noop}
          onDismiss={noop}
          onRemindLater={noop}
          labels={RECO_RO}
        />
      </GrowthSlot>
      <p className={`caption ${f.c3lab}`}>
        Gol sau în încărcare: slotul nu afișează nimic, textul următor vine direct
      </p>
      <GrowthSlot>{null}</GrowthSlot>
      <p className="body-small">Următorul bloc din pagină.</p>
    </div>
  );
}

export default function GrowthSlotGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <C3Pair render={() => <Body />} />;
}
