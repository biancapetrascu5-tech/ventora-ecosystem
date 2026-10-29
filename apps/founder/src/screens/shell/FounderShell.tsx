'use client';

import type { ReactNode } from 'react';
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

/* Shell-ul Founder Control Center (FX_App din preview-urile Founder): Spine cu navigația Founder,
   ContextBar cu căutarea, notificările și contul. */

export function useFounderNav(): NavSection[] {
  const t = useTranslations('founder.nav');
  return [
    {
      items: [
        { id: 'azi', label: t('overview'), short: t('overview'), icon: 'house' },
        { id: 'afaceri', label: t('businesses'), icon: 'building-2' },
        { id: 'consum', label: t('usage'), icon: 'chart-column' },
      ],
    },
    {
      label: t('commercial'),
      items: [
        { id: 'planuri', label: t('plans'), icon: 'boxes' },
        { id: 'pachete', label: t('packs'), short: t('packsShort'), icon: 'package' },
      ],
    },
    {
      label: t('growth'),
      items: [
        { id: 'oferte', label: t('offers'), icon: 'ticket' },
        { id: 'campanii', label: t('campaigns'), icon: 'megaphone' },
        { id: 'audiente', label: t('audiences'), icon: 'users' },
        { id: 'rezultate', label: t('results'), icon: 'chart-line' },
        { id: 'control', label: t('control'), icon: 'sliders-horizontal' },
      ],
    },
    {
      label: t('system'),
      items: [
        { id: 'jurnal', label: t('log'), icon: 'history' },
        { id: 'setari', label: t('settings'), icon: 'settings' },
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
  children,
}: {
  active?: string;
  title?: string;
  user: { name: string; email?: string };
  notifications?: NotificationData[];
  businessesBadge?: number;
  children: ReactNode;
}) {
  const ui = useTranslations('ui');
  const s = useTranslations('founder.shell');
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
          appName="Founder"
          sections={nav}
          activeId={active}
          bottomItems={['afaceri', 'consum', 'campanii', 'control']}
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
          onSearch={() => {}}
          searchLabel={s('search')}
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
