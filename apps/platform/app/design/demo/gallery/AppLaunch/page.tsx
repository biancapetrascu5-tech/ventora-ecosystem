/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import {
  AppDock,
  AppIcon,
  AppLaunch,
  type AppName,
  type DockApp,
  type DockLaunch,
} from '@ventora/ui';
import { APPTILE_RO, LAUNCH_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Demo → Frame({ th: "light" }) / Frame({ th: "dark" }): cadrele animației, „waiting”, Live
const LFRAMES = [0, 0.15, 0.35, 0.55, 0.75, 1];
const FROM = { left: 16, top: 16, width: 44, height: 44 };
const CARD = { left: 4, top: 4, width: 68, height: 76 };
const APPS: DockApp[] = (
  [
    ['booking', 'Programări, calendar și reamintiri', 3],
    ['crm', 'Clienți, istoric și oportunități'],
    ['hr', 'Echipă, prezență și concedii', 1],
    ['finance', 'Facturi, scadențe și restanțe', 2],
    ['projects', 'Proiecte, sarcini și termene'],
  ] as [AppName, string, number?][]
).map(([app, description, badge]) => ({ app, description, badge }));
const muted = { color: 'var(--ink-muted)' };

function Frames({ app = 'booking' }: { app?: AppName }) {
  const tiles: AppName[] = [
    app,
    ...(['booking', 'crm', 'hr', 'finance'] as AppName[]).filter((x) => x !== app),
  ];
  return (
    <div className={f.lframes}>
      {LFRAMES.map((p) => (
        <div key={p} className={f.lframe}>
          <div className={f.lframeTiles}>
            {tiles.map((a) => (
              <AppIcon key={a} app={a} size={44} />
            ))}
          </div>
          <AppLaunch
            app={app}
            contained
            progress={p}
            fromLocal={FROM}
            fromCard={CARD}
            openingLabel={LAUNCH_RO}
          />
        </div>
      ))}
    </div>
  );
}

const Waiting = ({ app }: { app: AppName }) => (
  <div className={f.lframe}>
    <AppLaunch app={app} contained progress={1} waiting fromLocal={FROM} openingLabel={LAUNCH_RO} />
  </div>
);

function Live() {
  const [run, setRun] = useState<(DockLaunch & { app: AppName; name: string; t: number }) | null>(
    null,
  );
  return (
    <>
      <div className={f.r}>
        <span className="body-small" style={muted}>
          Apasă pe o aplicație din rând.
        </span>
      </div>
      <div className={`${f.lstage} ${f.lstage2}`}>
        <AppDock
          apps={APPS}
          label="Aplicațiile tale"
          tileLabels={APPTILE_RO}
          onOpen={(_e, app, name, l) => setRun({ app, name, t: Date.now(), ...l })}
        />
        {run && (
          <AppLaunch
            key={run.t}
            contained
            app={run.app}
            name={run.name}
            from={run.from}
            fromCard={run.fromCard}
            iconEl={run.iconEl}
            onDone={() => setTimeout(() => setRun(null), 600)}
            openingLabel={LAUNCH_RO}
          />
        )}
      </div>
    </>
  );
}

function Frame({ th }: { th: 'light' | 'dark' }) {
  return (
    <section className={f.thf} data-gallery-frame data-theme={th}>
      <p className={`caption ${f.thl}`}>{th === 'dark' ? 'Dark' : 'Light'}</p>
      {th === 'light' ? (
        <>
          <p className="caption" style={muted}>
            Cadre: 0 · 130 · 300 · 470 · 640 · 850 ms. Iconul crește la 112%, aplicația crește din
            card (duration-launch 420ms, ease-standard), iconul trece prin centru la 88px și se
            așază în bara aplicației; conținutul urcă și apare.
          </p>
          <Frames />
          <p className="caption" style={muted}>
            Dacă aplicația se încarcă greu (waiting): iconul rămâne în centru cu numele dedesubt, ca
            în prima versiune.
          </p>
        </>
      ) : (
        <Frames app="finance" />
      )}
      <div className={f.lframes}>
        <Waiting app="booking" />
        <Waiting app="contracts" />
      </div>
      <Live />
    </section>
  );
}

export default function AppLaunchGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.d}>
        <Frame th="light" />
        <Frame th="dark" />
      </div>
    </div>
  );
}
