'use client';

import type { ReactNode } from 'react';
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
} from '@ventora/ui';
import { authApi } from '@ventora/screens';

/* Shell-ul Founder Control Center (FX_App din preview-urile Founder): Spine cu navigația Founder,
   ContextBar cu notificările și contul. Spine-ul arată doar intrările care au ecran: Lotul 2.8
   „Afaceri”; Lotul 3.4 „Prezentare”, „Consum”, „Cereri” (S111, cu numărul cererilor noi) și, sub
   „Model comercial” (S117): „Aplicații”, „Bundle-uri”, „Pachete în plus”, „Reduceri”. Growth,
   Campanii și Sistem apar cu ecranele lor. Căutarea (paleta de
   comenzi) n-are încă sursă. */

export function useFounderNav(requestsBadge?: number): NavSection[] {
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
      ],
    },
    {
      label: t('commercial'),
      items: [
        { id: 'aplicatii', label: t('apps'), icon: 'layout-grid', href: '/apps' },
        { id: 'planuri', label: t('bundles'), icon: 'boxes', href: '/bundles' },
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
  ];
}

export function FounderShell({
  active,
  title,
  user,
  notifications = [],
  businessesBadge,
  requestsBadge,
  children,
}: {
  active?: string;
  title?: string;
  user: { name: string; email?: string };
  notifications?: NotificationData[];
  businessesBadge?: number;
  /** „Cereri · {n}”: cererile noi din Hub. */
  requestsBadge?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const ui = useTranslations('ui');
  const nav = useFounderNav(requestsBadge).map((sec) => ({
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
          bottomItems={['azi', 'afaceri', 'consum', 'cereri']}
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
              items={notifications}
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
