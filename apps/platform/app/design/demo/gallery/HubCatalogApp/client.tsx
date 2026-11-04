/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (CAPP_TX.ro, CAPP_117.ro) */
'use client';

import type { ReactNode } from 'react';
import { AppShell, Button } from '@ventora/ui';
import { AppView } from '@/screens/apps/AppView';
import { Bar, noop } from '../_shared/shell';
import { HubBarLeading } from '../_shared/hubLauncher';
import h from '../_shared/hubBilling.module.css';

// HubCatalogApp → „Hub — Pagina unei aplicații din catalog” → Desktop · 1280 (H 900), proprietar.
// „De ce ți-o recomandăm” (Growth) și „Încearcă gratuit 14 zile” (perioada de probă, Lotul 3.8)
// sunt doar în galerie; în aplicație nu apar. Vederea e cea din Hub (/apps/[app]).
export function CatalogAppPage({ overlay }: { overlay?: ReactNode }) {
  return (
    <div className={h.frame}>
      <AppShell
        height="100%"
        contextBar={<Bar title="CampaignKit" hub leading={<HubBarLeading />} />}
      >
        <AppView
          phone={false}
          app="marketing"
          lead="Campanii și reamintiri automate pentru clienții tăi."
          allHref="#"
          allLabel="Toate aplicațiile"
          notInPlan
          recommended
          why={{
            title: 'De ce ți-o recomandăm',
            text: 'Folosești EasyBook: CampaignKit poate trimite automat reamintiri de revenire (de exemplu, la 6 săptămâni după vopsit) și campanii către clienții din programări.',
          }}
          features={[
            'Campanii prin SMS și e-mail către grupuri de clienți',
            'Reamintiri de revenire, pornite de ultima programare',
            'Rezultate: câți au deschis, câți au rezervat',
          ]}
          links={['booking', 'crm', 'portal']}
          summary={[
            { label: 'Mentenanță', value: '49 lei pe lună', strong: true },
            { label: 'Se plătește', value: 'Odată cu abonamentul' },
            { label: 'Cost de implementare', value: '150 lei, o singură dată' },
            { label: 'Perioadă de probă', value: '14 zile, gratuit' },
          ]}
          includes={{
            title: 'Ce include',
            items: ['10 campanii pe lună', '2.000 de e-mailuri pe lună'],
          }}
          note="Nu ai nevoie de card. La final aplicația se oprește, datele rămân, iar continuarea e alegerea ta."
          actions={
            <>
              <Button variant="primary" block onPress={noop}>
                Încearcă gratuit 14 zile
              </Button>
              <Button block onPress={noop}>
                Activează · 49 lei pe lună
              </Button>
            </>
          }
        />
      </AppShell>
      {overlay}
    </div>
  );
}

export function HubCatalogAppFrame() {
  return <CatalogAppPage />;
}
