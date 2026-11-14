'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  Spine,
  type NavSection,
  type NotificationData,
  useThemeChoice,
} from '@ventora/ui';
import { authApi } from '@ventora/screens';
import { readSupportOpenCount } from '@/server/support-inbox-actions';
import {
  markAllFounderRead,
  markFounderRead,
  readFounderNotifications,
  type FounderBellItem,
} from '@/server/notifications-actions';
import { useFounderNotifText } from '../notifications/founderNotifText';

/* Shell-ul Founder Control Center (FX_App din preview-urile Founder): Spine cu navigația Founder,
   ContextBar cu notificările și contul. Spine-ul arată doar intrările care au ecran: Lotul 2.8
   „Afaceri”; Lotul 3.4 „Prezentare”, „Consum”, „Cereri” (S111, cu numărul cererilor noi) și, sub
   „Model comercial” (S117): „Aplicații”, „Bundle-uri”, „Pachete în plus”, „Reduceri”. Growth,
   Campanii și Sistem apar cu ecranele lor. Căutarea (paleta de
   comenzi) n-are încă sursă. */

export function useFounderNav(requestsBadge?: number, supportBadge?: number): NavSection[] {
  const t = useTranslations('founder.nav');
  return [
    {
      items: [
        { id: 'azi', label: t('overview'), short: t('overview'), icon: 'house', href: '/overview' },
        { id: 'afaceri', label: t('businesses'), icon: 'building-2', href: '/businesses' },
        { id: 'consum', label: t('usage'), icon: 'chart-column', href: '/usage' },
        {
          id: 'cereri',
          label: t('requests'),
          icon: 'inbox',
          href: '/requests',
          ...(requestsBadge ? { badge: requestsBadge } : {}),
        },
        // Lotul 4.6 (S116, D4-14 b): după „Cereri”, cu numărul solicitărilor deschise
        {
          id: 'suport',
          label: t('support'),
          icon: 'life-buoy',
          href: '/support',
          ...(supportBadge ? { badge: supportBadge } : {}),
        },
      ],
    },
    {
      label: t('commercial'),
      items: [
        { id: 'aplicatii', label: t('apps'), icon: 'layout-grid', href: '/apps' },
        { id: 'bundles', label: t('bundles'), icon: 'boxes', href: '/bundles' },
        {
          id: 'pachete',
          label: t('packs'),
          short: t('packsShort'),
          icon: 'package',
          href: '/packs',
        },
        { id: 'reduceri', label: t('discounts'), icon: 'percent', href: '/discounts' },
      ],
    },
    // Lotul 5.10 (S136): Growth — intrările apar odată cu ecranele lor (Control mai întâi)
    {
      label: t('growth'),
      items: [
        { id: 'oferte', label: t('growthOffers'), icon: 'ticket', href: '/growth/offers' },
        {
          id: 'campanii',
          label: t('growthCampaigns'),
          icon: 'megaphone',
          href: '/growth/campaigns',
        },
        {
          id: 'control',
          label: t('growthControl'),
          icon: 'sliders-horizontal',
          href: '/growth/control',
        },
      ],
    },
    // Lotul 4.10 (S116, S120): „Automatizări” primul în „Sistem”; Jurnal și Setări vin cu ecranele lor
    {
      label: t('system'),
      items: [
        { id: 'automatizari', label: t('automations'), icon: 'refresh-cw', href: '/automations' },
      ],
    },
  ];
}

/** FounderNotifications (D4-29 a): clopoțelul își citește singur notificările, la deschidere. */
function useFounderBell(enabled: boolean) {
  const router = useRouter();
  const text = useFounderNotifText();
  const [items, setItems] = useState<FounderBellItem[]>([]);
  const load = useCallback(async () => {
    const d = await readFounderNotifications({});
    if (d) setItems(d.items);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readFounderNotifications({}).then((d) => {
      if (live && d) setItems(d.items);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return {
    items: items.map((i) => text.bell(i)),
    onOpenChange: (o: boolean) => {
      if (o && enabled) void load();
    },
    onOpenItem: (n: NotificationData) => {
      const item = items.find((i) => i.id === String(n.id));
      if (!item) return;
      void markFounderRead(item.id).then(load);
      if (item.kind === 'auto') router.push(`/notifications?open=${item.id}`);
      else if (item.actionPath) router.push(item.actionPath);
    },
    onMarkAllRead: async () => {
      const r = await markAllFounderRead();
      if (r.ok) await load();
    },
  };
}

export function FounderShell({
  active,
  title,
  user,
  notifications,
  businessesBadge,
  requestsBadge,
  supportBadge,
  children,
}: {
  active?: string;
  title?: string;
  user: { name: string; email?: string };
  /** Fără ea, clopoțelul citește notificările Founder (core/notifications). */
  notifications?: NotificationData[];
  businessesBadge?: number;
  /** „Cereri · {n}”: cererile noi din Hub. */
  requestsBadge?: number;
  /** „Suport · {n}”: solicitările deschise; fără el, shell-ul îl citește singur. */
  supportBadge?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const ui = useTranslations('ui');
  const themeChoice = useThemeChoice();
  const bell = useFounderBell(notifications === undefined);
  const [fetchedSupport, setFetchedSupport] = useState(0);
  useEffect(() => {
    if (supportBadge !== undefined) return;
    let live = true;
    void readSupportOpenCount().then((n) => {
      if (live) setFetchedSupport(n);
    });
    return () => {
      live = false;
    };
  }, [supportBadge]);
  const nav = useFounderNav(requestsBadge, supportBadge ?? fetchedSupport).map((sec) => ({
    ...sec,
    items: sec.items.map((i) =>
      i.id === 'afaceri' && businessesBadge ? { ...i, badge: businessesBadge } : i,
    ),
  }));
  const theme = {
    theme: ui('theme'),
    light: ui('themeLight'),
    dark: ui('themeDark'),
    system: ui('themeSystem'),
  };
  const org = {
    switchBusiness: ui('switchBusiness'),
    yourBusinesses: ui('yourBusinesses'),
    findBusiness: ui('findBusiness'),
    noResultsFor: (q: string) => ui('noResultsFor', { q }),
  };
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          hub
          appName="Founder"
          sections={nav}
          activeId={active}
          bottomItems={['azi', 'afaceri', 'cereri', 'suport']}
          labels={{
            backToHub: ui('backToHub'),
            expandMenu: ui('expandMenu'),
            collapseMenu: ui('collapseMenu'),
            more: ui('more'),
            close: ui('close'),
            back: ui('back'),
          }}
        />
      }
      contextBar={
        <ContextBar
          title={title}
          labels={{
            search: ui('search'),
            searchPlaceholder: ui('searchPlaceholder'),
            create: ui('create'),
          }}
          notifications={
            <NotificationsPanel
              items={notifications ?? bell.items}
              countCategory="operational"
              onOpenChange={bell.onOpenChange}
              {...(notifications === undefined
                ? { onOpenItem: bell.onOpenItem, onMarkAllRead: bell.onMarkAllRead }
                : {})}
              labels={{
                notifications: ui('notifications'),
                unreadN: (n) => ui('unreadN', { n }),
                markAllRead: ui('markAllRead'),
                notificationSettings: ui('notificationSettings'),
                all: ui('all'),
                unread: ui('unread'),
                noNotifications: ui('noNotifications'),
                noNotificationsHint: ui('noNotificationsHint'),
                operational: ui('operational'),
                activity: ui('activity'),
                recommendations: ui('recommendations'),
                recommendation: ui('recommendation'),
                fromTeam: ui('fromTeam'),
                seeApp: ui('seeApp'),
                reject: ui('reject'),
                seeDetails: ui('seeDetails'),
                notInterested: ui('notInterested'),
              }}
            />
          }
          account={
            <AccountMenu
              user={user}
              theme={themeChoice.theme}
              onThemeChange={themeChoice.onThemeChange}
              onSignOut={async () => {
                await authApi.signOut();
                router.replace('/sign-in');
              }}
              labels={{
                account: ui('account'),
                yourBusinesses: ui('yourBusinesses'),
                theme: ui('theme'),
                language: ui('language'),
                allApps: ui('allApps'),
                support: ui('support'),
                signOut: ui('signOut'),
                themeSwitcher: theme,
                orgSwitcher: org,
              }}
            />
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
