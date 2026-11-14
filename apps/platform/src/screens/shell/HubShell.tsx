'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BrandZone,
  AccountMenu,
  APP_IDS,
  APPS,
  AppShell,
  ContextBar,
  Logo,
  NotificationsPanel,
  type HubRecommendationData,
  OrgSwitcher,
  Spine,
  Toast,
  type AppName,
  type NavSection,
  type NotificationData,
  useThemeChoice,
} from '@ventora/ui';
import { authApi, useWhen } from '@ventora/screens';
import { supportHref } from '@ventora/support/apps';
import { rememberLocale } from '@/i18n/locale';
import { switchBusiness } from '@/server/shell-actions';
import { RejectRecommendationDialog } from '../growth/RecommendDialogs';
import { keepLocale } from '@/server/locale-actions';
import { markBellRead, openBellItem, readBell, type Bell } from '@/server/notification-actions';
import { growthInteraction, readBellRecommendation } from '@/server/growth-actions';
import {
  readTeamRecommendations,
  rejectRecommendation,
  type TeamRecommendationView,
} from '@/server/team-recommendation-actions';
import shellStyles from './shell.module.css';
import type { GrowthSlotView } from '@/server/growth-slot';
import { useCostLine } from '@/screens/growth/cost';
import { GrowthUpgrade } from '@/screens/growth/GrowthUpgrade';
import { BOOKING_BOTTOM, bookingActive, useBookingNav } from '@/screens/booking/useBookingNav';

/* Shell-ul Hub (HubSettings din preview-urile ecranelor Hub, Lot 2.8): Spine cu „Contul tău”,
   „Afacerea” și „Ajutor”, ContextBar cu afacerea, notificările și contul. Navigația arată doar
   intrările care au ecran: „Profil și preferințe” și „Suport” apar odată cu ecranele lor;
   „Abonament și consum” din Lotul 3.7; „Afacerea” doar pentru owner și admin.
   Lot 4.4: clopoțelul are sursa reală (core/notifications): ultimele 30 de zile (D4-11), numără
   doar operaționalele necitite (D4-5); deschiderea duce la acțiunea notificării. */

export type HubShellData = {
  /** S147: `avatar` — poza persoanei (`/account/photo/<id>`), dacă are. */
  user: { name: string; email: string; avatar?: string };
  /** Lot 2.9b (S112): o afacere suspendată apare oprită (lacăt, „Acces oprit”), nu se alege.
      S148: `logo` — logo-ul din Brand Kit (`/brand/logo/<id>`), dacă are. */
  orgs: { id: string; name: string; role: string; suspended?: boolean; logo?: string }[];
  currentOrgId: string | null;
  /** owner sau admin în afacerea activă: vede „Afacerea”. */
  manager: boolean;
  /** S112: afacerea din sesiune a fost suspendată între timp — unde merge persoana. */
  suspendedRedirect: '/choose-business' | '/business-suspended' | null;
};

type Route = { id: string; href: string };

/** /applications/<id> → numele aplicației (CampaignKit), titlul barei în HubCatalogApp. */
function appNameOf(pathname: string): string | undefined {
  const id = pathname.split('/')[2] ?? '';
  return (APP_IDS as string[]).includes(id) ? APPS[id as AppName]?.name : undefined;
}

const ROUTES: Route[] = [
  { id: 'recomandari', href: '/account/recommendations' },
  { id: 'profil', href: '/account/profile' },
  { id: 'securitate', href: '/account' },
  { id: 'echipa', href: '/admin/team' },
  { id: 'roluri', href: '/admin/access' },
  { id: 'abonament', href: '/admin/plan' },
  { id: 'brand', href: '/admin/brand' },
  { id: 'automatizari', href: '/admin/automations' },
  // Lotul 4.6: HubSupport, HubSupportThread
  { id: 'suport', href: '/support' },
];

function activeFor(pathname: string): string | undefined {
  return ROUTES.find((r) => pathname === r.href || pathname.startsWith(r.href + '/'))?.id;
}

export function useHubNav(manager: boolean, supportBadge = 0, canRecommend = false): NavSection[] {
  const nav = useTranslations('hub.nav');
  const account = useTranslations('account');
  const automations = useTranslations('automations');
  const ui = useTranslations('ui');
  const mine = useTranslations('pay.mine');
  const sections: NavSection[] = [
    {
      label: account('title'),
      items: [
        // Lotul 5.9e (HubMyRecommendations, S136): „Recomandările mele”, pentru cine poate
        // recomanda (oricine în afară de owner, D3-8)
        ...(canRecommend
          ? [
              {
                id: 'recomandari',
                label: mine('nav'),
                short: mine('navShort'),
                icon: 'lightbulb' as const,
                href: '/account/recommendations',
              },
            ]
          : []),
        // S147: „Profil și preferințe”, deocamdată cu poza de profil
        {
          id: 'profil',
          label: nav('profile'),
          short: nav('profileShort'),
          icon: 'circle-user',
          href: '/account/profile',
        },
        { id: 'securitate', label: account('security.title'), icon: 'shield', href: '/account' },
      ],
    },
  ];
  // S148 (HubBrand): „Brand” e primul în „Afacerea”; membrii îl văd doar în citire
  const brand = {
    id: 'brand',
    label: nav('brand'),
    short: nav('brandShort'),
    icon: 'store' as const,
    href: '/admin/brand',
  };
  if (!manager) sections.push({ label: nav('business'), items: [brand] });
  if (manager) {
    sections.push({
      label: nav('business'),
      items: [
        brand,
        {
          id: 'echipa',
          label: nav('team'),
          short: nav('teamShort'),
          icon: 'users',
          href: '/admin/team',
        },
        { id: 'roluri', label: nav('roles'), icon: 'key-round', href: '/admin/access' },
        {
          id: 'abonament',
          label: nav('plan'),
          short: nav('planShort'),
          icon: 'credit-card',
          href: '/admin/plan',
        },
        // Lotul 4.10 (S116, S120): după „Abonament și consum”, doar owner și admin
        {
          id: 'automatizari',
          label: automations('nav'),
          icon: 'refresh-cw',
          href: '/admin/automations',
        },
      ],
    });
  }
  // Lotul 4.6 (HubSupport): „Ajutor · Suport”, cu numărul solicitărilor cu „Răspuns nou”
  sections.push({
    label: nav('help'),
    items: [
      {
        id: 'suport',
        label: ui('support'),
        icon: 'life-buoy',
        href: '/support',
        ...(supportBadge ? { badge: supportBadge } : {}),
      },
    ],
  });
  return sections;
}

/** Clopoțelul: lista din core/notifications, cu ora (S110) și afacerea, când persoana are mai multe. */
function useBell(initial: Bell, orgs: HubShellData['orgs'], manager: boolean) {
  const router = useRouter();
  const when = useWhen();
  const [bell, setBell] = useState(initial);
  const [open, setOpen] = useState(false);
  // Lotul 5.9b: recomandarea Ventora, în secțiunea ei („Recomandări”), sub operaționale
  const [reco, setReco] = useState<GrowthSlotView | null>(null);
  const [upgrading, setUpgrading] = useState<GrowthSlotView | null>(null);
  const recoCost = useCostLine(reco);
  // Lotul 5.9e (HubRecommendation): „Recomandare de la echipă”, doar pentru owner și admini
  const [team, setTeam] = useState<TeamRecommendationView[]>([]);
  const [rejected, setRejected] = useState<{ member: string } | null>(null);
  // S147: „Respinge” deschide întâi dialogul cu motivul opțional
  const [rejecting, setRejecting] = useState<TeamRecommendationView | null>(null);
  const pay = useTranslations('pay');
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
  const recommendations: HubRecommendationData[] = [
    ...(reco
      ? [
          {
            id: reco.contentId,
            ...(reco.app ? { app: reco.app } : { icon: 'package' as const }),
            title: reco.title,
            body: reco.audience === 'member' || !recoCost ? reco.body : `${reco.body} ${recoCost}`,
          },
        ]
      : []),
    ...team.map((r) => ({
      id: `team:${r.id}`,
      kind: 'team' as const,
      app: r.app,
      title: pay('teamTitle', { name: r.by, app: r.name }),
      ...(r.note ? { note: r.note } : {}),
    })),
  ];
  const teamOf = (r: HubRecommendationData) =>
    team.find((t) => `team:${t.id}` === String(r.id)) ?? null;
  const interact = (kind: 'click' | 'dismiss') =>
    reco && void growthInteraction({ contentId: reco.contentId, kind, key: crypto.randomUUID() });
  const markRead = (pred: (id: string) => boolean) =>
    setBell((b) => ({ items: b.items.map((i) => (pred(i.id) ? { ...i, read: true } : i)) }));

  return {
    items,
    open,
    onOpenChange: (o: boolean) => {
      setOpen(o);
      // la fiecare deschidere, lista de acum
      if (o) {
        void readBell().then(setBell);
        void readBellRecommendation().then(setReco);
        if (manager) void readTeamRecommendations().then(setTeam);
      }
    },
    recommendations,
    onOpenRecommendation: () => {
      if (!reco) return;
      interact('click');
      setOpen(false);
      // UpgradeDialog la `options` (5.9c); nicio activare fără confirmare
      setUpgrading(reco);
    },
    upgrading,
    closeUpgrade: () => setUpgrading(null),
    continueUpgrade: (v: GrowthSlotView) =>
      router.push(
        v.app ? `/applications/${v.app}` : v.kind === 'addon' ? '/admin/plan' : '/catalog',
      ),
    onDismissRecommendation: () => {
      interact('dismiss');
      setReco(null);
    },
    // „Vezi aplicația”: pagina aplicației, unde doar owner-ul activează (D3-8)
    onSeeApp: (r: HubRecommendationData) => {
      const t = teamOf(r);
      if (!t) return;
      setOpen(false);
      router.push(`/applications/${t.app}`);
    },
    // „Respinge”: dialogul cu motivul opțional (S147), apoi „Nu acum”; membrul nu primește
    // notificare (CommercialStates), dar vede motivul în „Recomandările mele”
    onRejectRecommendation: (r: HubRecommendationData) => {
      const t = teamOf(r);
      if (!t) return;
      setOpen(false);
      setRejecting(t);
    },
    rejecting,
    closeRejecting: () => setRejecting(null),
    confirmReject: async (reason: string): Promise<boolean> => {
      const t = rejecting;
      if (!t) return false;
      const res = await rejectRecommendation(t.id, reason);
      if (!res.ok) return false;
      setTeam((list) => list.filter((x) => x.id !== t.id));
      setRejected({ member: t.by });
      return true;
    },
    rejected,
    closeRejected: () => setRejected(null),
    pay,
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
  supportBadge = 0,
  title,
  children,
}: {
  data: HubShellData;
  bell?: Bell;
  /** Lotul 4.6: solicitările cu „Răspuns nou” (Spine · Suport). */
  supportBadge?: number;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const bell = useBell(initialBell, data.orgs, data.manager);
  const pathname = usePathname();
  const locale = useLocale();
  const ui = useTranslations('ui');
  const themeChoice = useThemeChoice();
  const roles = useTranslations('roles');
  const hubNav = useHubNav(
    data.manager,
    supportBadge,
    data.orgs.find((o) => o.id === data.currentOrgId)?.role !== 'owner',
  );
  // Lot B.1-UI: under /booking the shell is EasyBook's (Spine app=booking, BK_SECTIONS, the meter)
  const booking = pathname === '/booking' || pathname.startsWith('/booking/');
  const bookingNav = useBookingNav(booking);
  const nav = booking ? bookingNav.sections : hubNav;
  const active = booking ? bookingActive(pathname) : activeFor(pathname);
  // S117: catalogul (HubCatalogBundles, HubCatalog, HubCatalogApp) se deschide fără Spine, cu
  // sigla în bară; titlul barei e al paginii.
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const catalog = under('/catalog') || under('/applications');
  // Lotul 5.1 (HubLauncher 1.1.0): pagina principală e launcher-ul — fără Spine, sigla în bară,
  // bara pe banda de brand (ca în preview).
  const home = pathname === '/';
  const bundlesTitle = useTranslations('catalog.bundles')('title');
  const appsTitle = useTranslations('hub.apps')('bar');
  const appTitle =
    under('/applications') && pathname !== '/applications' ? appNameOf(pathname) : undefined;
  const catalogTitle = under('/applications') ? (appTitle ?? appsTitle) : bundlesTitle;
  // Titlul din ContextBar (se vede doar pe telefon): numele paginii active din Spine.
  const pageTitle =
    title ??
    (catalog ? catalogTitle : undefined) ??
    nav.flatMap((sec) => sec.items).find((i) => i.id === active)?.label;
  const orgs = data.orgs.map((o) => ({
    id: o.id,
    name: o.name,
    role: roles.has(o.role) ? roles(o.role) : o.role,
    suspended: o.suspended,
    logo: o.logo,
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
        catalog || home ? undefined : (
          <Spine
            app={booking ? 'booking' : undefined}
            sections={nav}
            activeId={active}
            onBackToHub={() => go('/')}
            bottomItems={booking ? BOOKING_BOTTOM : ['securitate', 'echipa', 'abonament', 'suport']}
            footer={booking ? bookingNav.footer : undefined}
            labels={{
              backToHub: ui('backToHub'),
              expandMenu: ui('expandMenu'),
              collapseMenu: ui('collapseMenu'),
              more: ui('more'),
              close: ui('close'),
              back: ui('back'),
            }}
          />
        )
      }
      contextBar={
        <BrandBar on={home}>
          <ContextBar
            title={pageTitle}
            leading={catalog || home ? <Logo size={32} /> : undefined}
            org={
              orgs.length > 0 ? (
                <OrgSwitcher
                  orgs={orgs}
                  avatar={data.user.avatar}
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
                recommendations={bell.recommendations}
                onOpenRecommendation={bell.onOpenRecommendation}
                onDismissRecommendation={bell.onDismissRecommendation}
                onSeeApp={bell.onSeeApp}
                onRejectRecommendation={bell.onRejectRecommendation}
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
                // Lotul 4.6 (S-3): HubSupport, cu aplicația paginii de pornire precompletată
                // (Lotul 4.11: testat din fiecare rută (hub), core/support hub-routes.test.ts)
                onSupport={() => go(supportHref(pathname))}
                onSignOut={async () => {
                  await authApi.signOut();
                  router.replace('/sign-in');
                }}
                theme={themeChoice.theme}
                onThemeChange={themeChoice.onThemeChange}
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
        </BrandBar>
      }
    >
      {children}
      {bell.rejecting && (
        <RejectRecommendationDialog
          member={bell.rejecting.by}
          open
          onClose={bell.closeRejecting}
          onReject={bell.confirmReject}
        />
      )}
      {bell.rejected && (
        <div className={shellStyles.toast}>
          <Toast
            tone="neutral"
            title={bell.pay('states.rejected.title')}
            description={bell.pay('states.rejected.body', { member: bell.rejected.member })}
            onDismiss={bell.closeRejected}
            dismissLabel={ui('close')}
          />
        </div>
      )}
      {bell.upgrading && (
        <GrowthUpgrade
          view={bell.upgrading}
          owner={data.orgs.find((o) => o.id === data.currentOrgId)?.role === 'owner'}
          onContinue={bell.continueUpgrade}
          onClose={bell.closeUpgrade}
        />
      )}
    </AppShell>
  );
}

/** Lotul 5.1: bara de sus pe banda de brand doar pe launcher (HubLauncher 1.1.0). */
function BrandBar({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <BrandZone>{children}</BrandZone> : <>{children}</>;
}
