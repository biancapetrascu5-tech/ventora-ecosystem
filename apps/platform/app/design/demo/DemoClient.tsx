/* eslint-disable i18next/no-literal-string */
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Input,
  FormField,
  Checkbox,
  Icon,
  IconButton,
  AppIcon,
  BrandZone,
  AppDock,
  PortalPresence,
  AppLaunch,
  cn,
  type AppName,
  type DockApp,
} from '@ventora/ui';
import styles from './demo.module.css';

/* ── Traduceri componente (în producție vin din useTranslations) ─────── */

const PORTAL_TRANSLATIONS = {
  eyebrow: 'Portal · pentru clienții tăi',
  title: 'Pagina afacerii în Portal',
  description:
    'Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.',
  memberNote: 'Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.',
  manage: 'Gestionează pagina',
  finish: 'Termină pagina',
  preview: 'Vezi cum arată în Portal',
  previewTab: '(se deschide într-un tab nou)',
  statusPublished: 'Publicată',
  statusHidden: 'Ascunsă',
  statusDraft: 'Nu e publicată încă',
};

/* ── Date aprobate din preview.html ─────────────────────────────────────── */

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

/* Logo complet — varianta B: gem + wordmark VENTORA (în BrandZone var(--ink) → brand-ink = crem) */
function VentoraLogoFull({ height = 28 }: { height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 6 250 68"
      role="img"
      aria-label="Ventora"
      height={height}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <svg x="8" y="10" width="60" height="60" viewBox="0 0 400 400" overflow="visible">
        <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
        <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
        <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
        <polygon
          points="28,16 120,80 188,352 200,392"
          fill="#FFAA75"
          stroke="#0a1024"
          strokeWidth="6"
        />
        <polygon
          points="372,16 280,80 212,352 200,392"
          fill="#B1744F"
          stroke="#0a1024"
          strokeWidth="6"
        />
        <polygon points="200,172 200,362 162,246" fill="#FFAA75" stroke="#0a1024" strokeWidth="7" />
        <polygon points="200,172 238,246 200,362" fill="#B1744F" stroke="#0a1024" strokeWidth="7" />
      </svg>
      <path
        fill="#FFAA75"
        d="M90.960 47L85.695 47L77.622 28.100L83.400 28.100L88.530 40.412L93.768 28.100L99.060 28.100L90.960 47"
      />
      <path
        fill="var(--ink)"
        d="M118.986 47L103.812 47L103.812 28.100L118.635 28.100L118.635 32.231L109.104 32.231L109.104 35.417L117.501 35.417L117.501 39.413L109.104 39.413L109.104 42.869L118.986 42.869L118.986 47M130.434 47L125.196 47L125.196 28.100L129.597 28.100L137.940 38.171L137.940 28.100L143.178 28.100L143.178 47L138.777 47L130.434 36.929L130.434 47M159.567 47L154.221 47L154.221 32.339L148.416 32.339L148.416 28.100L165.345 28.100L165.345 32.339L159.567 32.339L159.567 47M180.114 47.378Q177.846 47.378 175.929 46.649Q174.012 45.920 172.595 44.584Q171.177 43.247 170.394 41.465Q169.611 39.683 169.611 37.550Q169.611 35.417 170.394 33.635Q171.177 31.853 172.595 30.517Q174.012 29.180 175.929 28.451Q177.846 27.722 180.114 27.722Q182.409 27.722 184.313 28.451Q186.216 29.180 187.620 30.517Q189.024 31.853 189.821 33.635Q190.617 35.417 190.617 37.550Q190.617 39.683 189.821 41.478Q189.024 43.274 187.620 44.597Q186.216 45.920 184.313 46.649Q182.409 47.378 180.114 47.378M180.114 42.950Q181.194 42.950 182.126 42.572Q183.057 42.194 183.746 41.478Q184.434 40.763 184.826 39.764Q185.217 38.765 185.217 37.550Q185.217 36.308 184.826 35.322Q184.434 34.337 183.746 33.621Q183.057 32.906 182.126 32.528Q181.194 32.150 180.114 32.150Q179.034 32.150 178.103 32.528Q177.171 32.906 176.483 33.621Q175.794 34.337 175.403 35.322Q175.011 36.308 175.011 37.550Q175.011 38.765 175.403 39.764Q175.794 40.763 176.483 41.478Q177.171 42.194 178.103 42.572Q179.034 42.950 180.114 42.950M202.011 47L196.665 47L196.665 28.100L205.116 28.100Q209.247 28.100 211.475 29.977Q213.702 31.853 213.702 35.093Q213.702 37.226 212.676 38.765Q211.704 40.250 210.003 41.060L214.080 47L208.356 47L204.927 41.978L202.011 41.978L202.011 47M202.011 32.312L202.011 37.847L204.981 37.847Q206.655 37.847 207.479 37.118Q208.302 36.389 208.302 35.093Q208.302 33.770 207.479 33.041Q206.655 32.312 204.981 32.312L202.011 32.312M223.071 47L217.617 47L225.960 28.100L231.225 28.100L239.595 47L234.033 47L232.548 43.328L224.556 43.328L223.071 47M226.122 39.386L230.982 39.386L228.552 33.338"
      />
    </svg>
  );
}

/* Chevron-uri decorative — Direcția B (stroke folosește var(--line-strong) care în BrandZone → brand-line-strong) */
function Chevrons({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 176 240"
      aria-hidden
      style={{ fill: 'none', stroke: 'var(--line-strong)', strokeWidth: 1.5 }}
    >
      {[40, 72, 104].map((y) => (
        <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
      ))}
      <polyline points="48,168 88,224 128,168" />
    </svg>
  );
}

/* ── AppTile row (OTHER apps — NECESITĂ DECIZIE FONDATORI: Lot 5) */
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

/* ── Preview scalat — iframe la lățimea reală, scalat să încapă în coloană ── */

const FRAME_WIDTH = 1280;

function ScaledPreview({ src, title }: { src: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [contentH, setContentH] = useState(800);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new ResizeObserver(([e]) => {
      setScale(e.contentRect.width / FRAME_WIDTH);
    });
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  const handleLoad = () => {
    const iframe = iframeRef.current;
    try {
      const h = iframe?.contentDocument?.documentElement?.scrollHeight;
      if (h && h > 0) setContentH(h);
    } catch {
      /* sandbox poate bloca — fallback la contentH inițial */
    }
  };

  return (
    <div
      ref={wrapRef}
      style={{
        width: '100%',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line-strong)',
        boxShadow: 'var(--shadow-3)',
        background: 'var(--canvas)',
      }}
    >
      <div style={{ height: contentH * scale }}>
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          onLoad={handleLoad}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: FRAME_WIDTH,
            height: contentH,
            border: 0,
            display: 'block',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
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
  const [launchLB, setLaunchLB] = useState<LaunchState | null>(null);
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [invitePassword, setInvitePassword] = useState('aurora2026');
  const [inviteExpired, setInviteExpired] = useState(false);

  return (
    <div data-theme={theme} data-testid="demo-page" className={styles.page}>
      {/* ── Header pagină ── */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Demo — HubSignIn + HubInvite + HubLauncher</h1>
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
            <ScaledPreview src="/design/preview/HubSignIn" title="HubSignIn — design aprobat" />
          </div>

          {/* Dreapta: implementare React — Direcția B: panou brand 46% + formular */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Implementare React (@ventora/ui)</span>
            <div className={styles.frameDesktop}>
              <div className={styles.signInSplit}>
                <BrandZone as="aside" className={styles.signInBrand}>
                  <div className={styles.signInBrandTop}>
                    <VentoraLogoMark size={40} />
                  </div>
                  <p className={cn('display-xl', styles.signInStatement)}>
                    Afacerea ta.
                    <br />
                    Într-un singur loc.
                  </p>
                  <Chevrons className={styles.signInChev} />
                  <p className={cn('caption', styles.signInFoot)}>© 2026 Ventora Systems</p>
                </BrandZone>

                <div className={styles.signInFormSide}>
                  <header className={cn(styles.authTop, styles.signInFormHeader)}>
                    {/* NECESITĂ DECIZIE FONDATORI: LanguageSwitcher din @ventora/ui */}
                    <button type="button" className={styles.langBtn}>
                      RO
                    </button>
                  </header>
                  <main className={styles.signInFormMain}>
                    <div className={styles.signInCard}>
                      <div className={styles.authHead}>
                        <h1 className="display-hub">Bine ai revenit</h1>
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
                  <footer className={styles.authFoot}>Termeni · Confidențialitate · Ajutor</footer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Secțiunea HubInvite ══════════════════════════════════════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>HubInvite</h2>
        <div className={styles.compareRow}>
          {/* Stânga: design aprobat */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Design aprobat (preview.html)</span>
            <ScaledPreview src="/design/preview/HubInvite" title="HubInvite — design aprobat" />
          </div>

          {/* Dreapta: implementare React — aceeași BrandZone ca HubSignIn */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Implementare React (@ventora/ui)</span>
            {/* Toggle stare invitație */}
            <div className={styles.stateToggle}>
              <button
                type="button"
                className={cn(styles.stateBtn, !inviteExpired && styles.stateBtnActive)}
                onClick={() => setInviteExpired(false)}
              >
                Activă
              </button>
              <button
                type="button"
                className={cn(styles.stateBtn, inviteExpired && styles.stateBtnActive)}
                onClick={() => setInviteExpired(true)}
              >
                Expirată
              </button>
            </div>
            <div className={styles.frameDesktop}>
              <div className={styles.signInSplit}>
                <BrandZone as="aside" className={styles.signInBrand}>
                  <div className={styles.signInBrandTop}>
                    <VentoraLogoMark size={40} />
                  </div>
                  <p className={cn('display-xl', styles.signInStatement)}>
                    Afacerea ta.
                    <br />
                    Într-un singur loc.
                  </p>
                  <Chevrons className={styles.signInChev} />
                  <p className={cn('caption', styles.signInFoot)}>© 2026 Ventora Systems</p>
                </BrandZone>

                <div className={styles.signInFormSide}>
                  <header className={cn(styles.authTop, styles.signInFormHeader)}>
                    <button type="button" className={styles.langBtn}>
                      RO
                    </button>
                  </header>
                  <main className={cn(styles.signInFormMain, styles.signInFormMainTop)}>
                    <div className={styles.signInCard}>
                      {inviteExpired ? (
                        /* ── Stare expirată ── */
                        <>
                          <div className={styles.invHead}>
                            <span className={styles.invMark}>SA</span>
                            <div>
                              <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                              <h1 className="display-m">Invitație expirată</h1>
                            </div>
                          </div>
                          {/* Notice inline — va fi înlocuit cu <Notice> după Lot 4 */}
                          <div className={styles.invExpiredNotice} role="alert">
                            <Icon icon="clock" size="sm" />
                            <div>
                              <p className="body-strong">Această invitație nu mai este valabilă</p>
                              <p className="body-small">
                                Invitațiile expiră după 7 zile. Cere proprietarului să trimită una
                                nouă.
                              </p>
                            </div>
                          </div>
                          <Button variant="primary" size="lg" className={styles.blockBtn}>
                            Cere o invitație nouă
                          </Button>
                        </>
                      ) : (
                        /* ── Stare activă ── */
                        <>
                          {/* inv-head: inițiale + de la cine + titlu */}
                          <div className={styles.invHead}>
                            <span className={styles.invMark}>SA</span>
                            <div>
                              <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                              <h1 className="display-m">Intră în echipa Salon Aurora</h1>
                            </div>
                          </div>
                          {/* rol + aplicații */}
                          <div className={styles.invRole}>
                            <p className="body">
                              Rolul tău: <strong className="body-strong">Recepție</strong>. Vei avea
                              acces la:
                            </p>
                            <div className={styles.invApps}>
                              {(['booking', 'crm', 'shifts'] as AppName[]).map((a) => (
                                <span key={a} className={styles.invApp}>
                                  <AppIcon app={a} size={24} />
                                  <span className="body-small">{APP_LABELS[a]}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          <FormField label="Nume complet">
                            <Input type="text" autoComplete="name" defaultValue="Ioana Pavel" />
                          </FormField>
                          {/* email readonly */}
                          <div className={styles.invEmail}>
                            <span className="caption muted">E-mail</span>
                            <span className="body-strong">ioana.pavel@salonaurora.ro</span>
                            <span className="caption muted">
                              Pe această adresă ai primit invitația.
                            </span>
                          </div>
                          <div className={styles.passwordField}>
                            <div className={styles.passwordLabel}>
                              <span>Parolă nouă</span>
                              <button
                                type="button"
                                className={styles.showPassBtn}
                                onClick={() => setShowInvitePassword((v) => !v)}
                                aria-pressed={showInvitePassword}
                              >
                                {showInvitePassword ? 'Ascunde parola' : 'Arată parola'}
                              </button>
                            </div>
                            <Input
                              type={showInvitePassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={invitePassword}
                              onChange={(e) => setInvitePassword(e.target.value)}
                            />
                          </div>
                          {/* cerințe parolă live — lime când sunt îndeplinite */}
                          <ul className={styles.invReqs}>
                            {[
                              { ok: invitePassword.length >= 10, text: 'Cel puțin 10 caractere' },
                              { ok: /\d/.test(invitePassword), text: 'Cel puțin o cifră' },
                              { ok: /[A-Z]/.test(invitePassword), text: 'Cel puțin o literă mare' },
                            ].map(({ ok, text }) => (
                              <li key={text} className={cn(styles.invReq, ok && styles.invReqOk)}>
                                <Icon icon={ok ? 'circle-check' : 'circle'} size="sm" />
                                <span className="body-small">{text}</span>
                              </li>
                            ))}
                          </ul>
                          <Checkbox defaultSelected>
                            Accept Termenii și Politica de confidențialitate
                          </Checkbox>
                          <Button variant="primary" size="lg" className={styles.blockBtn}>
                            Acceptă invitația
                          </Button>
                          <p className="caption muted" style={{ textAlign: 'center' }}>
                            Invitația e valabilă până pe 31 octombrie 2026.
                          </p>
                        </>
                      )}
                    </div>
                  </main>
                  <footer className={styles.authFoot}>Termeni · Confidențialitate · Ajutor</footer>
                </div>
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
            <PortalPresence
              status="published"
              onManage={() => {}}
              previewHref="#"
              translations={PORTAL_TRANSLATIONS}
            />
            <PortalPresence
              status="hidden"
              onManage={() => {}}
              translations={PORTAL_TRANSLATIONS}
            />
            <PortalPresence status="draft" onManage={() => {}} translations={PORTAL_TRANSLATIONS} />
            <PortalPresence
              status="published"
              canManage={false}
              previewHref="#"
              translations={PORTAL_TRANSLATIONS}
            />
            <PortalPresence
              status="published"
              compact
              onManage={() => {}}
              previewHref="#"
              translations={PORTAL_TRANSLATIONS}
            />
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
            <ScaledPreview src="/design/preview/HubLauncher" title="HubLauncher — design aprobat" />
          </div>

          {/* Dreapta: implementare React — Direcția B
              Structură: BrandZone (contextBar) + BrandZone (bandă full-width) + AppDock sub bandă */}
          <div className={styles.compareCol}>
            <span className={styles.colLabel}>Implementare React (@ventora/ui)</span>
            {/* fără cutie cu margini — launcher arată ca un ecran real */}
            <div className={styles.launcherShell}>
              {/* Context bar în BrandZone — logo complet (varianta B) + afacere + butoane */}
              <BrandZone>
                <div className={styles.hubContextBar}>
                  <div className={styles.hubBarLeft}>
                    <VentoraLogoFull />
                    <span className={styles.hubOrgName}>Salon Aurora</span>
                  </div>
                  <div className={styles.hubBarRight}>
                    <IconButton icon="search" label="Caută" variant="quiet" />
                    <IconButton icon="bell" label="Notificări" variant="quiet" />
                    {/* NECESITĂ DECIZIE FONDATORI: OrgSwitcher, NotificationsPanel, AccountMenu */}
                    <span className={styles.hubAvatar} aria-hidden>
                      BP
                    </span>
                  </div>
                </div>
              </BrandZone>

              {/* Conținut: wrap cu marjă max 1120 + overflow scroll */}
              <div className={styles.lbWrap}>
                {/* Bandă brand full-width — clip-path extinde box-shadow la 100vmax */}
                <BrandZone className={styles.lbBand}>
                  <div className={styles.lbHero}>
                    <div className={styles.lbHeroText}>
                      <p className={cn('eyebrow', styles.lbEyebrow)}>
                        Duminică, 25 octombrie · Salon Aurora
                      </p>
                      <h1 className="display-hub">Bună dimineața, Bianca</h1>
                      <p className={cn('lead', styles.lbDay)}>
                        {'Azi ai '}
                        <a className={styles.lbChip} href="#">
                          <AppIcon app="booking" size={20} />
                          {'8 programări'}
                        </a>
                        {', '}
                        <a className={styles.lbChip} href="#">
                          <AppIcon app="finance" size={20} />
                          {'2 facturi scadente'}
                          <span className={styles.lbDot} aria-hidden />
                        </a>
                        {' și '}
                        <a className={styles.lbChip} href="#">
                          <AppIcon app="hr" size={20} />
                          {'o cerere de concediu'}
                          <span className={styles.lbDot} aria-hidden />
                        </a>
                        {' de aprobat.'}
                      </p>
                    </div>
                    <Chevrons className={styles.lbChev} />
                  </div>
                  {/* „Aplicațiile tale" e în bandă pe desktop */}
                  <div className={styles.lbSechead}>
                    <h2 className="display-m">Aplicațiile tale</h2>
                    <Button size="sm" variant="quiet">
                      Reordonează
                    </Button>
                  </div>
                </BrandZone>

                {/* Telefon <560px: titlul "Aplicațiile tale" apare pe canvas (banda se termină după fraza zilei) */}
                <h2 className={cn('display-m', styles.lbSecheadMobile)}>Aplicațiile tale</h2>

                {/* AppDock + PortalPresence — margin negativ trage peste marginea de jos a benzii */}
                <div className={styles.lbMine}>
                  <AppDock
                    apps={DOCK_APPS}
                    onOpen={(_e, app, name, launchInfo) => {
                      setLaunchLB({
                        app,
                        name,
                        from: launchInfo.from,
                        fromCard: launchInfo.fromCard,
                      });
                    }}
                  />
                  {/* PortalPresence: un rând pe desktop (compact=false), stivuit pe tablet/mobil */}
                  <PortalPresence
                    status="published"
                    onManage={() => {}}
                    previewHref="#"
                    translations={PORTAL_TRANSLATIONS}
                  />
                </div>

                {/* Alte aplicații Ventora */}
                <div className={styles.lbOther}>
                  <h2 className="display-m">Alte aplicații Ventora</h2>
                  <p className={cn('body', styles.lbOtherIntro)}>
                    Nu le poți deschide acum. La fiecare scrie de ce și ce poți face.
                  </p>
                  <div className={styles.lbOtherRows}>
                    {OTHER.map(([app, access]) => (
                      <AppTileRow key={app} app={app} access={access} />
                    ))}
                  </div>
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <Button variant="quiet">Vezi toate aplicațiile Ventora</Button>
                  </div>
                </div>

                {launchLB && (
                  <AppLaunch
                    app={launchLB.app}
                    name={launchLB.name}
                    from={launchLB.from}
                    fromCard={launchLB.fromCard}
                    contained
                    onDone={() => setTimeout(() => setLaunchLB(null), 300)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
