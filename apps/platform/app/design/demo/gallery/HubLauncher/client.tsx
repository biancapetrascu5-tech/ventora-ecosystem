/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (Launcher, S136) */
'use client';

import { AppShell, BrandZone } from '@ventora/ui';
import { LauncherScreen } from '@/screens/launcher/LauncherScreen';
import type { LauncherData } from '@/server/launcher-actions';
import { HubBarLeading } from '../_shared/hubLauncher';
import { Bar } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

/* HubLauncher 1.1.0 (S136) → planșele „Fără Portal” (EasyBook activ: „Azi ai 8 programări.”) și
   „Nicio aplicație care dă date” (fraza simplă). Aceleași aplicații ca în preview: cele 7 ale
   afacerii în dock, apoi StockDesk (indisponibilă), DataView (nu e în rol), CampaignKit și Network
   (nu sunt în abonament). `?board=reco` (5.9a): slotul Growth pe rândul CampaignKit, ca în primul
   cadru al preview-ului (CatalogRecommendation). */
const MINE = ['booking', 'crm', 'hr', 'finance', 'projects', 'shifts', 'documents'] as const;

function data(noData: boolean, reco: boolean): LauncherData {
  return {
    apps: [
      ...MINE.filter((a) => !noData || a !== 'booking').map((app) => ({
        app,
        state: 'available' as const,
      })),
      { app: 'inventory', state: 'unavailable' },
      { app: 'analytics', state: 'notInRole' },
      { app: 'marketing', state: 'notInPlan' },
      { app: 'network', state: 'notInPlan' },
    ],
    role: 'owner',
    ownerName: 'Bianca Petrașcu',
    timeZone: 'Europe/Bucharest',
    appointmentsToday: noData ? null : 8,
    trialEnding: null,
    recommendation: reco
      ? {
          slotId: 'hub.launcher.other',
          contentId: '00000000-0000-4000-8000-000000000001',
          proactive: true,
          audience: 'buyer',
          title: 'CampaignKit',
          body: 'Se potrivește cu EasyBook: trimite automat reamintiri și campanii clienților tăi.',
          app: 'marketing',
          kind: 'app_activation',
          addonCode: null,
          cost: {
            currency: 'RON',
            amountMinor: 4900,
            interval: 'month',
            setupMinor: null,
            trial: null,
          },
        }
      : null,
  };
}

export function HubLauncherFrame({ noData, reco }: { noData?: boolean; reco?: boolean }) {
  return (
    <div className={c.xFrame}>
      <AppShell
        height="100%"
        contextBar={
          <BrandZone>
            <Bar title="" hub leading={<HubBarLeading />} />
          </BrandZone>
        }
      >
        <LauncherScreen
          data={data(!!noData, !!reco)}
          userName="Bianca Petrașcu"
          businessName="Salon Aurora"
          now="2026-10-25T07:00:00.000Z"
        />
      </AppShell>
    </div>
  );
}
