/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (Page, haveFor, AUR) */
'use client';

import { PlanView } from '@/screens/plan/PlanView';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';
import d from '../HubAdminTeam/team-demo.module.css';

// Primul cadru (S113 / S117): Salon Aurora, lunar — Bundle Business (300 lei) + CampaignKit la
// bucată (49 lei), 3 + 7 locuri, fără pachete; consumul și o factură plătită. E vederea din Hub
// (/admin/plan), cu „Ce plătești” în chenar, ca în aplicație.
export function HubPlanBillingFrame() {
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
            apps: ['booking', 'crm', 'hr', 'finance', 'marketing'],
            onUpgrade: noop,
          }}
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
          usage={{
            title: 'Consum: 17 oct. – 16 nov.',
            description: 'Consumul pornește de la zero pe 17 noiembrie.',
            meters: [
              { key: 'sms', label: 'SMS-uri', used: 862, limit: 1000 },
              { key: 'members', label: 'Locuri în echipă', used: 8, limit: 10 },
            ],
          }}
          invoices={{
            rows: [
              {
                id: '1',
                number: 'VNT-2026-0219',
                what: 'Abonament · 17 nov. – 16 dec.',
                date: '',
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
