/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (NB.a, S117) */
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { NewBusinessView, type NewBusinessOffer } from '@ventora/screens';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderShellDemo } from '../_shared/founderShell';
import { noop } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

// preview.html → Screens „Founder — Afacere nouă…” → Desktop · 1280, H 1500 (?w=390: Telefon, H 2700) (cazul a: Studio
// Lumina, Business · v2 + CampaignKit, lei, lunar, cu probă). CUI, orașul, limba, proprietarul și
// previzualizarea invitației nu sunt în NewBusinessView (NEFĂCUT din Lotul 2.8).
const OFFER: NewBusinessOffer = {
  bundles: [
    {
      value: 'business',
      label: 'Business · v2',
      description: '319 lei pe lună',
      apps: ['booking', 'crm', 'hr', 'finance'],
    },
    {
      value: 'plus',
      label: 'Business Plus · v1',
      description: '399 lei pe lună',
      apps: ['booking', 'crm', 'hr', 'finance', 'marketing', 'shifts', 'documents'],
    },
  ],
  apps: [
    { id: 'booking', description: '149 lei pe lună · implementare 300 lei' },
    { id: 'crm', description: '69 lei pe lună · implementare 200 lei' },
    { id: 'hr', description: '69 lei pe lună · fără cost de implementare' },
    { id: 'finance', description: '79 lei pe lună · implementare 250 lei' },
    { id: 'marketing', description: '49 lei pe lună · implementare 150 lei' },
    { id: 'documents', description: '29 lei pe lună · fără cost de implementare' },
    { id: 'shifts', description: '39 lei pe lună · implementare 150 lei' },
    { id: 'analytics', description: '59 lei pe lună · fără cost de implementare' },
  ],
  summary: {
    lines: [
      { label: 'Bundle Business · v2', amount: '319 lei' },
      { label: 'CampaignKit · la bucată', amount: '49 lei' },
    ],
    total: '368 lei',
    setup: '750 lei',
    seats: '10',
  },
};

export default function FounderNewBusinessGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = use(searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="Founder — Afacere nouă: bundle, aplicații la bucată, moneda, lunar sau anual (S117)"
      height={phone ? 2700 : 1500}
      width={phone ? 390 : undefined}
      render={() => (
        <div className={c.frameRel}>
          <FounderShellDemo active="afaceri" title="Afacere nouă">
            <NewBusinessView
              name="Studio Lumina"
              email="maria@studiolumina.ro"
              state="idle"
              buy={{
                currency: 'RON',
                interval: 'month',
                bundleId: 'business',
                apps: ['marketing'],
                trial: true,
              }}
              offer={OFFER}
              onNameChange={noop}
              onEmailChange={noop}
              onBuyChange={noop}
              onCancel={noop}
              onSubmit={noop}
            />
          </FounderShellDemo>
        </div>
      )}
    />
  );
}
