'use client';

import { useState, type ReactNode } from 'react';
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
  type NotificationData,
} from '@ventora/ui';
import { authApi, useWhen } from '@ventora/screens';
import { rememberLocale } from '@/i18n/locale';
import { switchBusiness } from '@/server/shell-actions';
import { keepLocale } from '@/server/locale-actions';
import { markBellRead, openBellItem, readBell, type Bell } from '@/server/notification-actions';

/* Shell-ul Hub (HubSettings din preview-urile ecranelor Hub, Lot 2.8): Spine cu „Contul tău”,
   „Afacerea” și „Ajutor”, ContextBar cu afacerea, notificările și contul. Navigația arată doar
   intrările care au ecran: „Profil și preferințe”, „Abonament și consum” și „Suport” apar odată
   cu ecranele lor; „Afacerea” doar pentru owner și admin.
   Lot 4.4: clopoțelul are sursa reală (core/notifications): ultimele 30 de zile (D4-11), numără
   doar operaționalele necitite (D4-5); deschiderea duce la acțiunea notificării. */

export type HubShellData = {
  user: { name: string; email: string };
  /** Lot 2.9b (S112): o afacere suspendată apare oprită (lacăt, „Acces oprit”), nu se alege. */
  orgs: { id: string; name: string; role: string; suspended?: boolean }[];
  currentOrgId: string | null;
  /** owner sau admin în afacerea activă: vede „Afacerea”. */
  manager: boolean;
  /** S112: afacerea din sesiune a fost suspendată între timp — unde merge persoana. */
  suspendedRedirect: '/choose-business' | '/business-suspended' | null;
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

/** Clopoțelul: lista din core/notifications, cu ora (S110) și afacerea, când persoana are mai multe. */
function useBell(initial: Bell, orgs: HubShellData['orgs']) {
  const router = useRouter();
  const when = useWhen();
  const [bell, setBell] = useState(initial);
  const [open, setOpen] = useState(false);
  // o listă nouă de la server (navigare, router.refresh) o înlocuiește pe cea de aici
  const [fromServer, setFromServer] = useState(initial);
  if (fromServer !== initial) {
    setFromServer(initial);
    setBell(initial);
  }

  const orgName = (id: string | null) =>
    orgs.length > 1 && id ? orgs.find((o) => o.id === id)?.name : undefined;
  const items: NotificationData[] = bell.items.map((i) => ({
    id: i.id,
    title: i.title,
    body: i.body,
    action: i.action,
    read: i.read,
    category: i.category,
    group: i.group === 'recommendation' ? 'activity' : i.group,
    app: orgName(i.organizationId),
    time: when(new Date(i.createdAt)),
  }));
  const markRead = (pred: (id: string) => boolean) =>
    setBell((b) => ({ items: b.items.map((i) => (pred(i.id) ? { ...i, read: true } : i)) }));

  return {
    items,
    open,
    onOpenChange: (o: boolean) => {
      setOpen(o);
      // la fiecare deschidere, lista de acum
      if (o) void readBell().then(setBell);
    },
    onOpenItem: async (n: NotificationData) => {
      markRead((id) => id === String(n.id));
      setOpen(false);
      const res = await openBellItem(String(n.id));
      if (!res?.href) return;
      router.push(res.href);
      if (res.switched) router.refresh();
    },
    onMarkAllRead: async () => {
      markRead(() => true);
      await markBellRead();
    },
    onSettings: () => {
      setOpen(false);
      router.push('/account/notifications');
    },
  };
}

export function HubShell({
  data,
  bell: initialBell = { items: [] },
  title,
  children,
}: {
  data: HubShellData;
  bell?: Bell;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const bell = useBell(initialBell, data.orgs);
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
    suspended: o.suspended,
  }));
  const orgLabels = {
    switchBusiness: ui('switchBusiness'),
    yourBusinesses: ui('yourBusinesses'),
    findBusiness: ui('findBusiness'),
    noResultsFor: (q: string) => ui('noResultsFor', { q }),
    accessStopped: ui('accessStopped'),
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
              items={bell.items}
              open={bell.open}
              onOpenChange={bell.onOpenChange}
              onOpenItem={bell.onOpenItem}
              onMarkAllRead={bell.onMarkAllRead}
              onSettings={bell.onSettings}
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
                // D4-8: the notifications follow the language chosen here
                void keepLocale(code);
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
