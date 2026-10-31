'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AccountMenu,
  AppShell,
  ContextBar,
  NotificationsPanel,
  OrgSwitcher,
  Spine,
  type NavSection,
} from '@ventora/ui';
import { authApi } from '@ventora/screens';
import { rememberLocale } from '@/i18n/locale';
import { switchBusiness } from '@/server/shell-actions';

/* Shell-ul Hub (HubSettings din preview-urile ecranelor Hub, Lot 2.8): Spine cu „Contul tău”,
   „Afacerea” și „Ajutor”, ContextBar cu afacerea, notificările și contul. Navigația arată doar
   intrările care au ecran: „Profil și preferințe”, „Abonament și consum” și „Suport” apar odată
   cu ecranele lor; „Afacerea” doar pentru owner și admin. Notificările n-au încă sursă (F4). */

export type HubShellData = {
  user: { name: string; email: string };
  orgs: { id: string; name: string; role: string }[];
  currentOrgId: string | null;
  /** owner sau admin în afacerea activă: vede „Afacerea”. */
  manager: boolean;
};

type Route = { id: string; href: string };

const ROUTES: Route[] = [
  { id: 'securitate', href: '/account' },
  { id: 'echipa', href: '/admin/team' },
  { id: 'roluri', href: '/admin/access' },
];

function activeFor(pathname: string): string | undefined {
  return ROUTES.find((r) => pathname === r.href || pathname.startsWith(r.href + '/'))?.id;
}

export function useHubNav(manager: boolean): NavSection[] {
  const nav = useTranslations('hub.nav');
  const account = useTranslations('account');
  const sections: NavSection[] = [
    {
      label: account('title'),
      items: [
        { id: 'securitate', label: account('security.title'), icon: 'shield', href: '/account' },
      ],
    },
  ];
  if (manager) {
    sections.push({
      label: nav('business'),
      items: [
        {
          id: 'echipa',
          label: nav('team'),
          short: nav('teamShort'),
          icon: 'users',
          href: '/admin/team',
        },
        { id: 'roluri', label: nav('roles'), icon: 'key', href: '/admin/access' },
      ],
    });
  }
  return sections;
}

export function HubShell({
  data,
  title,
  children,
}: {
  data: HubShellData;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const ui = useTranslations('ui');
  const roles = useTranslations('roles');
  const nav = useHubNav(data.manager);
  const active = activeFor(pathname);
  // Titlul din ContextBar (se vede doar pe telefon): numele paginii active din Spine.
  const pageTitle = title ?? nav.flatMap((sec) => sec.items).find((i) => i.id === active)?.label;
  const orgs = data.orgs.map((o) => ({
    id: o.id,
    name: o.name,
    role: roles.has(o.role) ? roles(o.role) : o.role,
  }));
  const orgLabels = {
    switchBusiness: ui('switchBusiness'),
    yourBusinesses: ui('yourBusinesses'),
    findBusiness: ui('findBusiness'),
    noResultsFor: (q: string) => ui('noResultsFor', { q }),
  };
  const change = async (id: string | number) => {
    if (String(id) === data.currentOrgId) return;
    if (await switchBusiness(String(id))) router.refresh();
  };
  const go = (href?: string) => {
    if (href) router.push(href);
  };
  return (
    <AppShell
      height="100%"
      spine={
        <Spine
          sections={nav}
          activeId={active}
          onBackToHub={() => go('/')}
          bottomItems={['securitate', 'echipa', 'roluri']}
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
          title={pageTitle}
          org={
            orgs.length > 0 ? (
              <OrgSwitcher
                orgs={orgs}
                currentId={data.currentOrgId ?? undefined}
                onChange={change}
                labels={orgLabels}
              />
            ) : undefined
          }
          labels={{
            search: ui('search'),
            searchPlaceholder: ui('searchPlaceholder'),
            create: ui('create'),
          }}
          notifications={
            <NotificationsPanel
              items={[]}
              countCategory="operational"
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
              user={data.user}
              orgs={orgs}
              currentOrgId={data.currentOrgId ?? undefined}
              onOrgChange={change}
              onProfile={() => go('/account')}
              onSignOut={async () => {
                await authApi.signOut();
                router.replace('/sign-in');
              }}
              locale={locale}
              onLocaleChange={(code) => {
                rememberLocale(code);
                router.refresh();
              }}
              labels={{
                account: ui('account'),
                yourBusinesses: ui('yourBusinesses'),
                theme: ui('theme'),
                language: ui('language'),
                allApps: ui('allApps'),
                support: ui('support'),
                signOut: ui('signOut'),
                themeSwitcher: {
                  theme: ui('theme'),
                  light: ui('themeLight'),
                  dark: ui('themeDark'),
                  system: ui('themeSystem'),
                },
                orgSwitcher: orgLabels,
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
