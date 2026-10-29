/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { RecommendationCard } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import { RECO_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light / dark → States()
const noop = () => {};
const L = RECO_RO;
const DECIDER = 'Bianca Petrașcu (proprietar)';
const Cap = ({ children }: { children: React.ReactNode }) => (
  <p className={`caption ${f.muted}`}>{children}</p>
);

function States() {
  return (
    <div className={f.d0}>
      <Cap>
        Proprietar · recomandare proactivă (meniu „Amintește-mi mai târziu” și „Nu mă interesează”)
      </Cap>
      <RecommendationCard
        app="crm"
        title="Ține istoricul clienților în ClientDesk"
        benefit="Clienții tăi din programări pot avea istoric, note și follow-up în ClientDesk."
        cost="69 lei pe lună · fără cost de implementare"
        actionLabel="Vezi opțiunile"
        onAction={noop}
        onDismiss={noop}
        onRemindLater={noop}
        labels={L}
      />
      <Cap>Pachet în plus · cumpărare</Cap>
      <RecommendationCard
        icon="package"
        title="500 SMS în plus pentru octombrie"
        benefit="Ai folosit 862 din 1.000 de SMS-uri, iar reamintirile pentru săptămâna viitoare mai au nevoie de aproximativ 300."
        cost="49 lei · valabil luna aceasta"
        actionLabel="Cumpără · 49 lei"
        onAction={noop}
        onDismiss={noop}
        onRemindLater={noop}
        labels={L}
      />
      <Cap>Membru · înainte și după „Recomandă aplicația”: în așteptare, activată, nu acum</Cap>
      <RecommendationCard
        proactive={false}
        role="member"
        app="marketing"
        title="CampaignKit"
        benefit="Trimite automat reamintiri și campanii clienților din EasyBook."
        cost="49 lei pe lună"
        actionLabel="Recomandă aplicația"
        decider={DECIDER}
        onRecommend={noop}
        labels={L}
      />
      <RecommendationCard
        proactive={false}
        role="member"
        app="marketing"
        title="CampaignKit"
        cost="49 lei pe lună"
        decider={DECIDER}
        recommended
        status="pending"
        labels={L}
      />
      <RecommendationCard
        proactive={false}
        role="member"
        app="crm"
        title="ClientDesk"
        cost="69 lei pe lună"
        decider={DECIDER}
        recommended
        status="activated"
        labels={L}
      />
      <RecommendationCard
        proactive={false}
        role="member"
        app="contracts"
        title="ContractDesk"
        cost="59 lei pe lună"
        decider={DECIDER}
        recommended
        status="declined"
        labels={L}
      />
    </div>
  );
}

export default function RecommendationCardGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <States />} />;
}
