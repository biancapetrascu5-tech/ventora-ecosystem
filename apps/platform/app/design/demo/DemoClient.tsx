/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  FormField,
  Checkbox,
  Icon,
  ContextBar,
  IconButton,
  AppIcon,
  BrandZone,
  AppDock,
  PortalPresence,
  AppLaunch,
  type AppName,
  type DockApp,
} from '@ventora/ui';
import styles from './demo.module.css';

/* ── Date aprobate din preview.html ─────────────────────────────────────── */

const MINE: Array<[AppName, string, number?]> = [
  ['booking', 'Programări, calendar și reamintiri', 3],
  ['crm', 'Clienți, istoric și oportunități'],
  ['hr', 'Echipă, prezență și concedii', 1],
  ['finance', 'Facturi, scadențe și restanțe', 2],
  ['projects', 'Proiecte, sarcini și termene'],
  ['shifts', 'Ture și înlocuiri'],
  ['documents', 'Documente și șabloane'],
  ['portal', 'Pagina afacerii pentru clienți'],
];

const APP_LABELS: Record<AppName, string> = {
  booking: 'Booking',
  crm: 'CRM',
  hr: 'HR',
  finance: 'Finance',
  projects: 'Projects',
  shifts: 'Shifts',
  documents: 'Documents',
  portal: 'Portal',
  inventory: 'Inventory',
  analytics: 'Analytics',
  marketing: 'Marketing',
  network: 'Network',
  contracts: 'Contracts',
  events: 'Events',
  assets: 'Assets',
};

const ACCESS_LABELS: Record<string, string> = {
  unavailable: 'Indisponibilă',
  notInRole: 'Rolul tău nu include această aplicație',
  notInPlan: 'Nu e în planul tău',
};

const OTHER: Array<[AppName, string]> = [
  ['inventory', 'unavailable'],
  ['analytics', 'notInRole'],
  ['marketing', 'notInPlan'],
  ['network', 'notInPlan'],
];

/* ── Logo Ventora inline — NECESITĂ DECIZIE FONDATORI (Logo din @ventora/ui) */
function VentoraLogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 400"
      width={size}
      height={size}
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
      <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
      <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
      <polygon
        points="28,16 120,80 188,352 200,392"
        fill="#FFAA75"
        stroke="#0a1024"
        strokeWidth="12"
      />
      <polygon
        points="372,16 280,80 212,352 200,392"
        fill="#B1744F"
        stroke="#0a1024"
        strokeWidth="12"
      />
      <polygon points="200,172 200,362 162,246" fill="#FFAA75" stroke="#0a1024" strokeWidth="14" />
      <polygon points="200,172 238,246 200,362" fill="#B1744F" stroke="#0a1024" strokeWidth="14" />
    </svg>
  );
}

/* ── AppTile demo — NECESITĂ DECIZIE FONDATORI (AppTile din @ventora/ui Lot 5) */
function AppTileCard({
  app,
  description,
  badge,
}: {
  app: AppName;
  description: string;
  badge?: number;
}) {
  return (
    <button type="button" className={styles.appTileCard} aria-label={APP_LABELS[app]}>
      <div className={styles.appTileIconWrap}>
        <AppIcon app={app} size={44} title={APP_LABELS[app]} />
        {badge != null && badge > 0 && <span className={styles.appTileBadge}>{badge}</span>}
      </div>
      <span className={styles.appTileCardLabel}>{APP_LABELS[app]}</span>
      <span className={styles.appTileCardDesc}>{description}</span>
    </button>
  );
}

function AppTileRow({ app, access }: { app: AppName; access: string }) {
  return (
    <div className={styles.appTileRow}>
      <AppIcon app={app} size={36} muted title={APP_LABELS[app]} />
      <div className={styles.appTileRowText}>
        <span className={styles.appTileRowLabel}>{APP_LABELS[app]}</span>
        <span className={styles.appTileRowAccess}>{ACCESS_LABELS[access] ?? access}</span>
      </div>
      <Button variant="quiet" size="sm">
        Solicită acces
      </Button>
    </div>
  );
}

/* ── Componenta principală ───────────────────────────────────────────────── */

const DOCK_APPS: DockApp[] = [
  {
    app: 'booking',
    description: 'Programări, calendar și reamintiri',
    badge: 3,
    live: { text: 'Următoarea: 09:30 · Ana Popescu' },
  },
  { app: 'crm', description: 'Clienți, istoric și oportunități' },
  {
    app: 'hr',
    description: 'Echipă, prezență și concedii',
    badge: 1,
    live: { text: '1 cerere de aprobat', attention: true },
  },
  {
    app: 'finance',
    description: 'Facturi, scadențe și restanțe',
    badge: 2,
    live: { text: '2 facturi scadente · 2.480 lei', attention: true },
  },
  { app: 'projects', description: 'Proiecte, sarcini și termene' },
];

type LaunchState = { app: AppName; name: string; from: DOMRect; fromCard: DOMRect };

export function DemoClient() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [launch, setLaunch] = useState<LaunchState | null>(null);

  return (
    <div data-theme={theme} className={styles.page}>
      {/* ── Header pagină ── */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Demo — HubSignIn + HubLauncher</h1>
        <p className={styles.pageSubtitle}>
          Date fictive · dev only · componente reale din @ventora/ui
        </p>
        <div className={styles.themeRow}>
          <Button
            variant={theme === 'light' ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => setTheme('light')}
          >
            ☀ Light
          </Button>
          <Button
            variant={theme === 'dark' ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => setTheme('dark')}
          >
            ☾ Dark
          </Button>
        </div>
      </header>

      {/* ══ Secțiunea HubSignIn ══════════════════════════════════════════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>HubSignIn</h2>
        <div className={styles.compareRow}>
          {/* Stânga: design aprobat */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Design aprobat (preview.html)</span>
            <div className={styles.framePhone}>
              <iframe
                src="/preview/signin.html"
                title="HubSignIn — design aprobat"
                className={styles.iframe}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          {/* Dreapta: implementare React */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Implementare React (@ventora/ui)</span>
            <div className={styles.framePhone}>
              <div className={styles.signIn}>
                {/* Header logo + language */}
                <div className={styles.authTop}>
                  <div className={styles.authBrand}>
                    <VentoraLogoMark size={36} />
                    <span className={styles.brandName}>Ventora</span>
                  </div>
                  {/* NECESITĂ DECIZIE FONDATORI: LanguageSwitcher din @ventora/ui */}
                  <button type="button" className={styles.langBtn}>
                    RO
                  </button>
                </div>

                {/* Card autentificare */}
                <main className={styles.authMain}>
                  <div className={styles.authCard}>
                    <div className={styles.authHead}>
                      <h1 className="display-l">Bine ai revenit</h1>
                      <p className="body muted">Intră în contul tău Ventora.</p>
                    </div>

                    <FormField label="E-mail">
                      <Input
                        type="email"
                        autoComplete="username"
                        iconStart="mail"
                        placeholder="bianca@salonaurora.ro"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </FormField>

                    {/* Câmp parolă cu link "Ai uitat parola?" pe linie separată */}
                    <div className={styles.passwordField}>
                      <div className={styles.passwordLabel}>
                        <span>Parolă</span>
                        <a href="#" className={styles.forgotLink}>
                          Ai uitat parola?
                        </a>
                      </div>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>

                    <Checkbox isSelected={rememberMe} onChange={setRememberMe}>
                      Ține-mă minte pe acest dispozitiv timp de 30 de zile
                    </Checkbox>

                    <Button variant="primary" size="lg" className={styles.blockBtn}>
                      Intră în cont
                    </Button>

                    <div className={styles.authNote}>
                      <Icon icon="mail" size="sm" />
                      <p className="body-small">
                        Nu ai cont? Conturile se fac doar prin invitație. Dacă ai primit una,
                        deschide linkul din e-mail și îți alegi parola.
                      </p>
                    </div>
                  </div>
                </main>

                <footer className={styles.authFoot}>
                  © 2026 Ventora Systems · Termeni · Confidențialitate · Ajutor
                </footer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Secțiunea Hub — Direcția B ════════════════════════════════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Hub — Direcția B (BrandZone + AppDock + PortalPresence)
        </h2>

        {/* BrandZone demo */}
        <div className={styles.compareRow}>
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>BrandZone — wrapper Navy de comandă</span>
            <BrandZone style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)' }}>
              <p
                className="eyebrow"
                style={{ textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}
              >
                Duminică, 25 octombrie · Salon Aurora
              </p>
              <h2 className="display-l">Bună dimineața, Bianca</h2>
              <p className="lead" style={{ marginTop: 'var(--space-2)' }}>
                Azi ai 8 programări, 2 facturi scadente și o cerere de concediu de aprobat.
              </p>
            </BrandZone>
          </div>

          <div className={styles.compareCol}>
            <span className={styles.colLabel}>BrandZone dark</span>
            <BrandZone
              data-theme="dark"
              style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)' }}
            >
              <p
                className="eyebrow"
                style={{ textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}
              >
                Duminică, 25 octombrie · Salon Aurora
              </p>
              <h2 className="display-l">Bună dimineața, Bianca</h2>
              <p className="lead" style={{ marginTop: 'var(--space-2)' }}>
                Azi ai 8 programări, 2 facturi scadente și o cerere de concediu de aprobat.
              </p>
            </BrandZone>
          </div>
        </div>

        {/* AppDock + PortalPresence demo */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            padding: 'var(--space-6)',
            background: 'var(--canvas)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--line)',
          }}
        >
          <span className={styles.colLabel}>AppDock — treci cu mouse-ul peste icoane</span>
          <AppDock
            apps={DOCK_APPS}
            onOpen={(_e, app, name, launchInfo) => {
              setLaunch({ app, name, from: launchInfo.from, fromCard: launchInfo.fromCard });
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span className={styles.colLabel}>PortalPresence — toate stările</span>
            <PortalPresence status="published" onManage={() => {}} previewHref="#" />
            <PortalPresence status="hidden" onManage={() => {}} />
            <PortalPresence status="draft" onManage={() => {}} />
            <PortalPresence status="published" canManage={false} previewHref="#" />
            <PortalPresence status="published" compact onManage={() => {}} previewHref="#" />
          </div>
          {launch && (
            <AppLaunch
              app={launch.app}
              name={launch.name}
              from={launch.from}
              fromCard={launch.fromCard}
              contained
              onDone={() => setTimeout(() => setLaunch(null), 300)}
            />
          )}
        </div>

        {/* AppLaunch static frames */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-6)',
            background: 'var(--canvas)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--line)',
          }}
        >
          <span className={styles.colLabel}>AppLaunch v2 — frame-uri statice (progress 0 → 1)</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 'var(--space-3)',
            }}
          >
            {[0, 0.15, 0.35, 0.55, 0.75, 1.0].map((p) => (
              <div
                key={p}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 100,
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                  }}
                >
                  <AppLaunch
                    app="booking"
                    from={{
                      left: 0,
                      top: 0,
                      right: 64,
                      bottom: 64,
                      width: 64,
                      height: 64,
                      x: 0,
                      y: 0,
                      toJSON: () => ({}),
                    }}
                    progress={p}
                  />
                </div>
                <span className="caption" style={{ color: 'var(--ink-muted)' }}>
                  {p}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Secțiunea HubLauncher ════════════════════════════════════════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>HubLauncher</h2>
        <div className={styles.compareRow}>
          {/* Stânga: design aprobat */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Design aprobat (preview.html)</span>
            <div className={styles.frameDesktop}>
              <iframe
                src="/preview/launcher.html"
                title="HubLauncher — design aprobat"
                className={styles.iframe}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          {/* Dreapta: implementare React */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Implementare React (@ventora/ui)</span>
            <div className={styles.frameDesktop}>
              <div className={styles.launcher}>
                {/* ContextBar — NECESITĂ DECIZIE FONDATORI: OrgSwitcher, AccountMenu, NotificationsPanel */}
                <ContextBar
                  logo={
                    <div className={styles.hubLogo}>
                      <VentoraLogoMark size={28} />
                    </div>
                  }
                  title="Ventora Hub"
                  actions={
                    <div className={styles.contextActions}>
                      <IconButton icon="search" label="Caută" variant="quiet" />
                      <IconButton icon="bell" label="Notificări" variant="quiet" />
                      {/* NECESITĂ DECIZIE FONDATORI: OrgSwitcher, NotificationsPanel, AccountMenu */}
                    </div>
                  }
                />

                {/* Conținut launcher */}
                <div className={styles.launcherContent}>
                  {/* Salut */}
                  <div className={styles.greet}>
                    <h1 className="display-l">Bună dimineața, Bianca</h1>
                    <p className="body muted">
                      Azi ai{' '}
                      <a href="#" className={styles.dayLink}>
                        8 programări
                      </a>
                      ,{' '}
                      <a href="#" className={styles.dayLink}>
                        2 facturi scadente
                      </a>{' '}
                      și{' '}
                      <a href="#" className={styles.dayLink}>
                        o cerere de concediu
                      </a>{' '}
                      de aprobat.
                    </p>
                  </div>

                  {/* Aplicațiile tale */}
                  <section className={styles.appsSection}>
                    <div className={styles.secHead}>
                      <h2 className="display-m">Aplicațiile tale</h2>
                      <Button size="sm" variant="quiet">
                        Reordonează
                      </Button>
                    </div>
                    {/* NECESITĂ DECIZIE FONDATORI: AppTile din @ventora/ui Lot 5 */}
                    <div className={styles.tiles4}>
                      {MINE.map(([app, description, badge]) => (
                        <AppTileCard key={app} app={app} description={description} badge={badge} />
                      ))}
                    </div>
                  </section>

                  {/* Alte aplicații */}
                  <section className={styles.appsSection}>
                    <h2 className="display-m">Alte aplicații Ventora</h2>
                    <p className="body-small muted" style={{ marginBottom: 'var(--space-3)' }}>
                      Nu le poți deschide acum. La fiecare scrie de ce și ce poți face.
                    </p>
                    {/* NECESITĂ DECIZIE FONDATORI: AppTile layout="row" din @ventora/ui Lot 5 */}
                    <div className={styles.rows2}>
                      {OTHER.map(([app, access]) => (
                        <AppTileRow key={app} app={app} access={access} />
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
