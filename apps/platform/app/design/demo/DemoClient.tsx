/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  FormField,
  Toggle,
  ContextBar,
  Spine,
  IconButton,
  type NavItem,
} from '@ventora/ui';
import styles from './demo.module.css';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'clients', label: 'Clienți', icon: 'users', badge: 5 },
  { id: 'appointments', label: 'Programări', icon: 'calendar' },
  { id: 'invoices', label: 'Facturi', icon: 'file-text' },
  { id: 'settings', label: 'Setări', icon: 'settings' },
];

const APPS = [
  { id: 'crm', label: 'CRM', emoji: '👥' },
  { id: 'calendar', label: 'Calendar', emoji: '📅' },
  { id: 'invoices', label: 'Facturare', emoji: '🧾' },
  { id: 'inventory', label: 'Stoc', emoji: '📦' },
  { id: 'hr', label: 'HR', emoji: '🏢' },
  { id: 'analytics', label: 'Analiză', emoji: '📊' },
  { id: 'pos', label: 'Casa de marcat', emoji: '🛒' },
  { id: 'loyalty', label: 'Fidelizare', emoji: '⭐' },
  { id: 'support', label: 'Suport', emoji: '💬' },
];

export function DemoClient() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <div data-theme={theme} className={styles.page}>
      <header className={styles.header}>
        <h1>Demo pagini — HubSignIn + HubLauncher</h1>
        <p>Date fictive · dev only · componentele reale din @ventora/ui</p>
      </header>

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

      <div className={styles.demoGrid}>
        {/* ── HubSignIn ── */}
        <div className={styles.demoCell}>
          <span className={styles.demoLabel}>HubSignIn — 390px (telefon)</span>
          <div className={styles.phoneFrame}>
            <div className={styles.signIn}>
              <div className={styles.signInLogo}>
                <svg
                  className={styles.signInLogoMark}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 400 400"
                  aria-hidden
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
                  <polygon
                    points="200,172 200,362 162,246"
                    fill="#FFAA75"
                    stroke="#0a1024"
                    strokeWidth="14"
                  />
                  <polygon
                    points="200,172 238,246 200,362"
                    fill="#B1744F"
                    stroke="#0a1024"
                    strokeWidth="14"
                  />
                </svg>
                <span className={styles.signInBrand}>Ventora</span>
              </div>

              <div className={styles.signInCard}>
                <h2 className={styles.signInTitle}>Bun venit</h2>
                <p className={styles.signInSubtitle}>Intră în contul tău</p>

                <div className={styles.signInFields}>
                  <FormField id="demo-email" label="Email">
                    <Input
                      id="demo-email"
                      type="email"
                      placeholder="ana@firma.ro"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      iconStart="mail"
                    />
                  </FormField>
                  <FormField id="demo-password" label="Parolă">
                    <Input
                      id="demo-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      iconStart="lock"
                    />
                  </FormField>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Toggle isSelected={rememberMe} onChange={setRememberMe}>
                      Ține-mă minte
                    </Toggle>
                    <a href="#" style={{ fontSize: '13px', color: 'var(--primary)' }}>
                      Ai uitat parola?
                    </a>
                  </div>
                </div>

                <div className={styles.signInActions}>
                  <Button variant="primary" size="lg">
                    Intră în cont
                  </Button>
                  <div className={styles.signInDivider}>sau</div>
                  <Button variant="secondary" size="lg">
                    Continuă cu Google
                  </Button>
                </div>

                <p className={styles.signInFooter}>
                  Nu ai cont? <a href="#">Înregistrează-te</a>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── HubLauncher ── */}
        <div className={styles.demoCell}>
          <span className={styles.demoLabel}>HubLauncher — 1280px (desktop)</span>
          <div className={styles.desktopFrame}>
            <div className={styles.launcher}>
              <ContextBar
                title="Ventora Hub"
                actions={
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <IconButton icon="search" label="Caută" variant="quiet" />
                    <IconButton icon="bell" label="Notificări" variant="quiet" />
                    <IconButton icon="help-circle" label="Ajutor" variant="quiet" />
                  </div>
                }
              />

              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <Spine
                  items={NAV_ITEMS}
                  activeId={activeNav}
                  footer={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-3) var(--space-4)',
                        borderTop: '1px solid var(--line)',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          color: 'var(--on-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        AP
                      </div>
                    </div>
                  }
                />

                <main style={{ flex: 1, overflow: 'auto' }}>
                  <div className={styles.launcherTop}>
                    <div className={styles.launcherGreeting}>
                      <div className={styles.launcherAvatar}>AP</div>
                      <div className={styles.launcherGreetingText}>
                        <span className={styles.launcherName}>Bună ziua, Ana Popescu</span>
                        <span className={styles.launcherOrg}>SC Firma Exemplu SRL</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.launcherApps}>
                    {APPS.map((app) => (
                      <button
                        key={app.id}
                        className={styles.appTile}
                        type="button"
                        onClick={() => setActiveNav(app.id)}
                        aria-label={app.label}
                      >
                        <div className={styles.appIcon}>{app.emoji}</div>
                        <span className={styles.appTileLabel}>{app.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.launcherFooter}>
                    <span className={styles.launcherFooterText}>Ventora Hub v0.1.0</span>
                    <Button variant="quiet" size="sm">
                      Deconectare
                    </Button>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
