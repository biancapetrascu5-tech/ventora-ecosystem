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
   ContextBar cu notificările și contul. Lot 2.8: Spine-ul arată doar intrările care au ecran
   („Afaceri”); Prezentare, Consum, Model comercial, Growth, Campanii, Sistem și Control apar odată
   cu ecranele lor. Căutarea (paleta de comenzi) și notificările n-au încă sursă. */

export function useFounderNav(): NavSection[] {
  const t = useTranslations('founder.nav');
  return [
    { items: [{ id: 'afaceri', label: t('businesses'), icon: 'building-2', href: '/businesses' }] },
  ];
}

export function FounderShell({
  active,
  title,
  user,
  notifications = [],
  businessesBadge,
  children,
}: {
  active?: string;
  title?: string;
  user: { name: string; email?: string };
  notifications?: NotificationData[];
  businessesBadge?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const ui = useTranslations('ui');
  const nav = useFounderNav().map((sec) => ({
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
          bottomItems={['afaceri']}
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
