/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (ALL, FX_NOTIFS2) */
'use client';

import { NotificationsPanel, type NavSection, type NotificationData } from '@ventora/ui';
import { FounderNotificationsView, type FounderNotifRow } from '@ventora/screens';
import { FounderShellDemo, FX_NAV } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { NOTIF_RO } from '../_shared/labels';
import { noop } from '../_shared/shell';

// FounderNotifications (S136, P22, 5.8, D5-11): Board3 din preview.html — 1 clopoțelul deschis,
// 2 necitite, 3 toate, 4 Drawer-ul opririi automate, 5 „Repornește”, 6 Toast-ul, 7 gol. Shell-ul
// FX_NAV2 („Traduceri” sub Growth, „Analytics” în prima secțiune), activ „azi”, jos
// afaceri / cereri / suport / azi.

export type NotifBoard = 'bell' | 'unread' | 'all' | 'drawer' | 'restart' | 'done' | 'empty';

const FX_NAV2: NavSection[] = FX_NAV.map((sec, i) =>
  i === 0
    ? { ...sec, items: [...sec.items, { id: 'analytics', label: 'Analytics', icon: 'chart-line' }] }
    : sec.label === 'Growth'
      ? {
          ...sec,
          items: [
            ...sec.items.slice(0, 3),
            { id: 'traduceri', label: 'Traduceri', icon: 'globe' },
            ...sec.items.slice(3),
          ],
        }
      : sec,
);

const AUTO = {
  title: 'Growth a oprit „Marketing pentru saloane”',
  body: 'Prea multe „Nu mă interesează”: 6,2% la 100 de afișări, peste pragul de 5%.',
};
const SUPPORT = {
  title: 'Solicitare nouă de la Salon Aurora',
  body: 'EasyBook · Avansul nu apare în fișa clientului · Mă blochează',
};
const INVOICE = {
  title: '2 facturi nu s-au emis',
  body: 'SmartBill a respins datele de facturare pentru Fitness Atlas și Clinica Dentis Sibiu.',
};
const SETUP = {
  title: 'Cerere de configurare: Pensiunea Valea Verde',
  body: 'EventSpace cu implementare · oferta e de trimis',
};

const FX_NOTIFS2: NotificationData[] = [
  { id: 1, ...AUTO, app: 'Growth', time: 'acum 8 min', icon: 'triangle-alert' },
  { id: 2, ...SUPPORT, app: 'Suport', time: 'acum 12 min', icon: 'life-buoy' },
  { id: 3, ...INVOICE, app: 'Facturi', time: 'azi, 09:10', icon: 'receipt' },
  { id: 4, ...SETUP, app: 'Configurare', time: 'ieri', icon: 'wrench', read: true },
];

const ALL: FounderNotifRow[] = [
  { id: 1, kind: 'auto', ...AUTO, when: 'acum 8 min', unread: true },
  { id: 2, kind: 'support', ...SUPPORT, when: 'acum 12 min', unread: true },
  { id: 3, kind: 'invoice', ...INVOICE, when: 'azi, 09:10', unread: true },
  {
    id: 4,
    kind: 'auto',
    title: 'Growth a oprit oferta „Business Plus pentru afacerile la limită”',
    body: '3 plângeri de la proprietari în 24 de ore.',
    when: 'azi, 07:30',
    unread: true,
  },
  { id: 5, kind: 'setup', ...SETUP, when: 'ieri', unread: false },
  {
    id: 6,
    kind: 'auto',
    title: 'Growth a oprit „DataView de Black Friday”',
    body: 'Bugetul de 200 de perioade de probă s-a terminat.',
    when: '7 nov.',
    unread: false,
  },
  {
    id: 7,
    kind: 'auto',
    title: 'Growth a oprit „SMS peste 80%”',
    body: 'Eroare: oferta nu are preț în modelul comercial pentru „Start”.',
    when: '5 nov.',
    unread: false,
  },
];

const DETAIL = {
  name: 'Marketing pentru saloane',
  subtitle: 'Marketing pentru saloane · azi, 09:41',
  reason: '„Nu mă interesează” la 6,2% din afișări (prag: 5%), la 1.240 de afișări',
  stopped:
    'Campania „Marketing pentru saloane” · oferta „CampaignKit pentru saloane” rămâne activă în alte campanii',
  when: 'Azi, 09:41',
  businesses: '312',
};

export function FounderNotificationsFrame({
  board,
  phone,
}: {
  board: NotifBoard;
  phone?: boolean;
}) {
  const rows = board === 'empty' ? [] : board === 'all' ? ALL : ALL.filter((r) => r.unread);
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo
          active="azi"
          title="Notificări"
          nav={FX_NAV2}
          businessesBadge={false}
          notifications={FX_NOTIFS2}
          bottomItems={['afaceri', 'cereri', 'suport', 'azi']}
        >
          <FounderNotificationsView
            framed
            mode={phone ? 'mobile' : 'desktop'}
            rows={rows}
            unreadCount={4}
            tab={board === 'all' ? 'all' : 'unread'}
            kind="all"
            onTab={noop}
            onKind={noop}
            onMarkAll={noop}
            onSee={noop}
            detail={board === 'drawer' || board === 'restart' ? DETAIL : null}
            onCloseDetail={noop}
            onSeeCampaign={noop}
            restartOpen={board === 'restart'}
            restartDefaults={{
              whatChanged:
                'Am scos launcherul din sloturi și am scurtat textul; rămâne doar „Abonament și consum”.',
            }}
            onCancelRestart={noop}
            onConfirmRestart={noop}
            toast={
              board === 'done'
                ? {
                    title: 'Am repornit „Marketing pentru saloane”',
                    description: 'Prima afișare apare în următoarea oră.',
                  }
                : null
            }
            onCloseToast={noop}
          />
        </FounderShellDemo>
      </div>
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
          <NotificationsPanel
            inline
            items={FX_NOTIFS2}
            labels={NOTIF_RO}
            onMarkAllRead={noop}
            onSettings={noop}
          />
        </div>
      )}
    </div>
  );
}
