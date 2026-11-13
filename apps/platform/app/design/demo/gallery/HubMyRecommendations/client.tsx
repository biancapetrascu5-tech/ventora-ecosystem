/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (HubMyRecommendations, S136) */
'use client';

import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  OrgSwitcher,
  Spine,
  type NavSection,
  type NotificationData,
} from '@ventora/ui';
import { MyRecommendationsScreen } from '@/screens/recommendations/MyRecommendationsScreen';
import type { MyRecommendationsData } from '@/server/team-recommendation-actions';
import { ACCOUNT_RO, CONTEXTBAR_RO, NOTIF_RO, ORG_RO, SPINE_RO } from '../_shared/labels';
import { noop, ORGS } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

/* HubMyRecommendations (S136, lotul 5.9e) → planșele preview-ului: 1 · lista (în așteptare,
   activată, nu acum); `?board=bell` 2 · din clopoțel (doar activarea trimite notificare);
   `?board=empty` 3 · Nicio recomandare. Membrul Ioana Pavel, în Salon Aurora; datele din
   preview (2026: „8 nov.”, „14 oct.” / „16 oct.”, „2 sept.” / „5 sept.”). */
const SECS: NavSection[] = [
  {
    label: 'Contul tău',
    items: [
      { id: 'profil', label: 'Profil și preferințe', short: 'Profil', icon: 'circle-user' },
      { id: 'recomandari', label: 'Recomandările mele', short: 'Recomandări', icon: 'lightbulb' },
      { id: 'securitate', label: 'Securitate', icon: 'shield' },
    ],
  },
  { label: 'Ajutor', items: [{ id: 'suport', label: 'Suport', icon: 'life-buoy' }] },
];

const DATA: MyRecommendationsData = {
  owner: 'Bianca Petrașcu',
  items: [
    {
      id: '1',
      app: 'marketing',
      name: 'CampaignKit',
      status: 'pending',
      recommendedAt: '2026-11-08T09:00:00.000Z',
      decidedAt: null,
      answer: null,
    },
    {
      id: '2',
      app: 'crm',
      name: 'ClientDesk',
      status: 'active',
      recommendedAt: '2026-10-14T09:00:00.000Z',
      decidedAt: '2026-10-16T09:00:00.000Z',
      answer: 'L-am activat pentru toată echipa. Mulțumesc!',
    },
    {
      id: '3',
      app: 'analytics',
      name: 'DataView',
      status: 'not_now',
      recommendedAt: '2026-09-02T09:00:00.000Z',
      decidedAt: '2026-09-05T09:00:00.000Z',
      answer: 'Nu acum; ne uităm din nou în ianuarie.',
    },
  ],
};

const MY_NOTIFS: NotificationData[] = [
  {
    id: 1,
    title: 'Bianca Petrașcu a activat ClientDesk',
    body: 'Recomandarea ta e acum o aplicație a echipei.',
    app: 'Hub',
    time: '16 oct.',
    icon: 'check',
  },
];

export type MineBoard = 'list' | 'bell' | 'empty';

export function HubMyRecommendationsFrame({ board, phone }: { board: MineBoard; phone: boolean }) {
  return (
    <div className={c.xFrame} style={{ position: 'relative' }}>
      <AppShell
        height="100%"
        spine={
          <Spine
            hub
            labels={SPINE_RO}
            sections={SECS}
            activeId="recomandari"
            onBackToHub={noop}
            bottomItems={['profil', 'recomandari', 'securitate', 'suport']}
          />
        }
        contextBar={
          <ContextBar
            title="Recomandările mele"
            org={<OrgSwitcher orgs={ORGS} currentId="aurora" onChange={noop} labels={ORG_RO} />}
            onSearch={noop}
            notifications={<NotificationsPanel items={MY_NOTIFS} labels={NOTIF_RO} />}
            account={
              <AccountMenu
                user={{ name: 'Ioana Pavel', email: 'ioana@salonaurora.ro' }}
                orgs={ORGS}
                currentOrgId="aurora"
                onCatalog={noop}
                labels={ACCOUNT_RO}
              />
            }
            labels={CONTEXTBAR_RO}
          />
        }
      >
        <MyRecommendationsScreen
          data={board === 'empty' ? { owner: DATA.owner, items: [] } : DATA}
          phone={phone}
        />
      </AppShell>
      {board === 'bell' && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(var(--space-12) + var(--space-2))',
            right: 'var(--space-4)',
            left: phone ? 'var(--space-4)' : 'auto',
            width: phone ? 'auto' : 'calc(var(--space-16) * 6)',
            maxWidth: phone ? 'none' : 'calc(100% - var(--space-8))',
            zIndex: 'var(--z-sticky)',
            boxShadow: 'var(--shadow-3)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <NotificationsPanel inline items={MY_NOTIFS} labels={NOTIF_RO} />
        </div>
      )}
    </div>
  );
}
