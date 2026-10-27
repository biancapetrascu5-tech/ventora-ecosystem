/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import {
  AppDock,
  AppIcon,
  AppLaunch,
  BrandZone,
  Button,
  Icon,
  IconButton,
  PortalPresence,
  type AppName,
  type DockApp,
} from '@ventora/ui';

const APP_LABELS: Partial<Record<AppName, string>> = {
  booking: 'Booking',
  crm: 'CRM',
  hr: 'HR',
  finance: 'Finance',
  projects: 'Projects',
  inventory: 'Inventory',
  analytics: 'Analytics',
  marketing: 'Marketing',
  network: 'Network',
};

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

type OtherConfig = {
  app: AppName;
  pillLabel: string;
  pillAttention?: boolean;
  body: string;
  primaryAction: string;
  hasMenu?: boolean;
};
const OTHER_CONFIGS: OtherConfig[] = [
  {
    app: 'inventory',
    pillLabel: 'Temporar indisponibilă',
    body: 'Lucrăm la ea acum. Revine în curând.',
    primaryAction: 'Vezi starea',
  },
  {
    app: 'analytics',
    pillLabel: 'Nu e în rolul tău',
    body: 'Aplicația e disponibilă doar pentru anumite roluri.',
    primaryAction: 'Cere acces',
  },
  {
    app: 'marketing',
    pillLabel: 'Recomandare',
    pillAttention: true,
    body: 'Nu e în abonamentul tău.',
    primaryAction: 'Vezi detaliile',
    hasMenu: true,
  },
  { app: 'network', pillLabel: 'Nu e în abonament', body: '', primaryAction: 'Scrie-ne' },
];

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

function AppTileRow({ config }: { config: OtherConfig }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <AppIcon app={config.app} size={36} muted title={APP_LABELS[config.app]} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}
        >
          <span className="body-strong">{APP_LABELS[config.app]}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: config.pillAttention ? 'var(--attention-soft)' : 'var(--neutral-soft)',
              color: config.pillAttention ? 'var(--attention-ink)' : 'var(--ink-secondary)',
              border: `1px solid ${config.pillAttention ? 'var(--attention-line)' : 'var(--line)'}`,
            }}
          >
            {config.pillLabel}
          </span>
        </div>
        {config.body && (
          <span className="body-small" style={{ color: 'var(--ink-secondary)' }}>
            {config.body}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center', flexShrink: 0 }}>
        <Button variant="quiet" size="sm">
          {config.primaryAction}
        </Button>
        {config.hasMenu && (
          <IconButton icon="more-horizontal" label="Mai multe opțiuni" variant="quiet" size="sm" />
        )}
      </div>
    </div>
  );
}

type LaunchState = { app: AppName; name: string; from: DOMRect; fromCard: DOMRect };

export function LauncherScreenClient({ theme }: { theme: 'light' | 'dark'; activeApp?: string }) {
  const [launch, setLaunch] = useState<LaunchState | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div
      data-theme={theme}
      style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)' }}
    >
      {/* Context bar */}
      <BrandZone>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-6)',
            height: 56,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <VentoraLogoFull height={24} />
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--on-brand-ink)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Salon Aurora</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Proprietar</span>
              </div>
              <Icon icon="chevron-down" size="sm" aria-hidden />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <IconButton icon="search" label="Caută" variant="quiet" />
            <IconButton icon="bell" label="Notificări" variant="quiet" />
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'var(--on-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                userSelect: 'none',
              }}
              aria-hidden
            >
              BP
            </span>
          </div>
        </div>
      </BrandZone>

      {/* Content wrap */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 var(--space-6)' }}>
        {/* Brand band */}
        <BrandZone
          style={{
            margin: '0 calc(-1 * var(--space-6))',
            padding: 'var(--space-8) var(--space-6) var(--space-6)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <p className="eyebrow" style={{ marginBottom: 'var(--space-2)', opacity: 0.75 }}>
            Duminică, 25 octombrie · Salon Aurora
          </p>
          <h1 className="display-hub">Bună dimineața, Bianca</h1>
          <p className="lead" style={{ marginTop: 'var(--space-2)', maxWidth: 560 }}>
            {'Azi ai '}
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--on-brand-soft)',
                color: 'var(--on-brand-ink)',
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              <AppIcon app="booking" size={16} />
              {' 8 programări'}
            </a>
            {', '}
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--on-brand-soft)',
                color: 'var(--on-brand-ink)',
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              <AppIcon app="finance" size={16} />
              {' 2 facturi scadente'}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--attention-base)',
                  display: 'inline-block',
                  marginLeft: 2,
                }}
                aria-hidden
              />
            </a>
            {' și '}
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--on-brand-soft)',
                color: 'var(--on-brand-ink)',
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              <AppIcon app="hr" size={16} />
              {' o cerere de concediu'}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--attention-base)',
                  display: 'inline-block',
                  marginLeft: 2,
                }}
                aria-hidden
              />
            </a>
            {' de aprobat.'}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 'var(--space-6)',
            }}
          >
            <h2 className="display-m">Aplicațiile tale</h2>
            <Button size="sm" variant="quiet">
              Reordonează
            </Button>
          </div>
          {/* Decorative chevrons */}
          <svg
            viewBox="0 0 176 240"
            aria-hidden
            style={{
              fill: 'none',
              stroke: 'var(--on-brand-ink)',
              strokeWidth: 1.5,
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 176,
              height: 240,
              opacity: 0.15,
            }}
          >
            {[40, 72, 104].map((y) => (
              <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
            ))}
            <polyline points="48,168 88,224 128,168" />
          </svg>
        </BrandZone>

        {/* AppDock + PortalPresence */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <AppDock
            apps={DOCK_APPS}
            onOpen={(_e, app, name, launchInfo) => {
              setLaunch({ app, name, from: launchInfo.from, fromCard: launchInfo.fromCard });
            }}
          />
          <PortalPresence
            status="published"
            onManage={() => {}}
            previewHref="#"
            translations={PORTAL_TRANSLATIONS}
          />
        </div>

        {/* Alte aplicații */}
        <div style={{ marginTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
          <h2 className="display-m">Alte aplicații Ventora</h2>
          <p
            className="body"
            style={{
              color: 'var(--ink-secondary)',
              marginTop: 'var(--space-1)',
              marginBottom: 'var(--space-4)',
            }}
          >
            Nu le poți deschide acum. La fiecare scrie de ce și ce poți face.
          </p>
          <div>
            {OTHER_CONFIGS.map((config) => (
              <AppTileRow key={config.app} config={config} />
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="quiet">Vezi toate aplicațiile Ventora</Button>
          </div>
        </div>
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
  );
}
