/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (PLAN_TX.ro, ADDONS, HAVE_117) */
'use client';

import { GrowthSlot, RecommendationCard } from '@ventora/ui';
import { PlanView } from '@/screens/plan/PlanView';
import { HubSettings } from '../_shared/hubSettings';
import { RECO_RO } from '../_shared/labels';
import { noop } from '../_shared/shell';
import d from '../HubAdminTeam/team-demo.module.css';

// Primul cadru: Salon Aurora, Bundle Business + CampaignKit la bucată, cardul salvat, locurile la
// limită, SMS-urile aproape de limită. GrowthSlot-ul (recomandarea) e doar în galerie: în
// aplicație, fără Growth Engine (S111), nu apare. Vederea e cea din Hub (/admin/plan).
const fmt = (n: number) => n.toLocaleString('ro-RO');

export function HubAdminPlanFrame() {
  return (
    <div className={d.frame}>
      <HubSettings active="abonament" title="Abonament">
        <PlanView
          phone={false}
          plan={{
            name: 'Bundle Business',
            status: { label: 'Activ', tone: 'done' },
            pay: 'Plătești lunar: 349 lei',
            next: 'Următoarea plată: 17 noiembrie 2026',
            inline: {
              before: 'Plătești lunar: ',
              amount: '349 lei',
              after: ' · următoarea plată pe 17 noiembrie 2026',
            },
            apps: ['booking', 'crm', 'hr', 'finance', 'marketing'],
            onUpgrade: noop,
          }}
          haveStyle="sunken"
          have={{
            rows: [
              {
                label: 'Bundle Business',
                sub: 'EasyBook, ClientDesk, TeamSpace, MoneyDesk',
                amount: '300 lei',
              },
              { label: 'CampaignKit · aplicație la bucată', amount: '49 lei' },
              {
                label: '10 locuri în echipă',
                sub: '3 incluse în orice cont + 7 din bundle',
                amount: 'Inclus',
                muted: true,
              },
              { label: 'Niciun pachet în plus.', amount: '', muted: true },
            ],
            totalLabel: 'Total pe lună',
            total: '349 lei',
            keep: 'Prețul tău rămâne același cât timp păstrezi bundle-ul, și după ce oferta s-a încheiat.',
          }}
          card={{ card: { brand: 'Visa', last4: '4242', expiry: '08/28' }, onChange: noop }}
          usage={{
            title: 'Consum: 17 oct. – 16 nov.',
            description: 'Consumul pornește de la zero pe 17 noiembrie.',
            meters: [
              {
                key: 'members',
                label: 'Locuri în echipă',
                used: 10,
                limit: 10,
                onBuy: noop,
                buyLabel: 'Cumpără locuri în plus',
                onUpgrade: noop,
              },
              {
                key: 'sms',
                label: 'SMS-uri',
                used: 862,
                limit: 1000,
                onBuy: noop,
                buyLabel: 'Cumpără SMS-uri în plus',
                note: 'La ritmul de acum, ajungi la limită pe 27 octombrie.',
              },
              { key: 'appt', label: 'Programări', used: 312, limit: 1000 },
              {
                key: 'docs',
                label: 'Spațiu documente',
                used: 2.4,
                limit: 5,
                unit: 'GB',
                format: fmt,
              },
            ],
          }}
          packs={{
            growth: (
              <GrowthSlot label="Recomandare">
                <RecommendationCard
                  icon="message-square"
                  title="500 SMS în plus până pe 16 noiembrie"
                  benefit="Ai folosit 862 din 1.000 de SMS-uri, iar reamintirile pentru săptămâna viitoare mai au nevoie de aproximativ 300."
                  cost="49 lei · valabil până pe 16 noiembrie"
                  actionLabel="Cumpără · 49 lei"
                  onAction={noop}
                  onDismiss={noop}
                  onRemindLater={noop}
                  labels={RECO_RO}
                />
              </GrowthSlot>
            ),
            rows: [
              {
                id: 'sms',
                icon: 'message-square',
                name: '500 SMS în plus',
                price: '49 lei · valabil până pe 16 noiembrie',
                action: { label: 'Cumpără · 49 lei', variant: 'secondary', onPress: noop },
              },
              {
                id: 'camp',
                icon: 'megaphone',
                name: '10 campanii în plus',
                price: '39 lei · valabil până pe 16 noiembrie',
                action: { label: 'Cumpără · 39 lei', variant: 'secondary', onPress: noop },
              },
              {
                id: 'staff',
                icon: 'users',
                name: '5 locuri în echipă în plus',
                price: '60 lei · pe lună, plătit odată cu abonamentul',
                action: { label: 'Cumpără · 60 lei', variant: 'secondary', onPress: noop },
              },
              {
                id: 'domain',
                icon: 'globe',
                name: 'Domeniu propriu pentru pagina de rezervări',
                price: '25 lei · pe lună',
                onRequestOnly: true,
                action: { label: 'Cere activare', variant: 'quiet', onPress: noop },
              },
            ],
          }}
          invoices={{
            withDate: true,
            rows: [
              {
                id: '4',
                number: 'VNT-2026-0203',
                what: 'Pachet în plus · 500 SMS în plus',
                date: '24 oct. 2026',
                amount: '49 lei',
                pending: false,
              },
              {
                id: '1',
                number: 'VNT-2026-0198',
                what: 'Abonament · 17 oct. – 16 nov.',
                date: '17 oct. 2026',
                amount: '349 lei',
                pending: false,
              },
              {
                id: '5',
                number: 'VNT-2026-0171',
                what: 'Pachet în plus · 10 campanii în plus',
                date: '18 sep. 2026',
                amount: '39 lei',
                pending: false,
              },
              {
                id: '2',
                number: 'VNT-2026-0154',
                what: 'Abonament · 17 sep. – 16 oct.',
                date: '17 sep. 2026',
                amount: '349 lei',
                pending: false,
              },
            ],
          }}
        />
      </HubSettings>
    </div>
  );
}
