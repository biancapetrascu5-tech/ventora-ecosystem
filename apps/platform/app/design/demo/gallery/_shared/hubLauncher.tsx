/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (Launcher) */
'use client';
// Launcher din preview-urile ecranelor Hub (HubSupportSession, HubTwoFactorVerify · R-2F10):
// AppShell cu bara Hub, salutul, „Aplicațiile tale” și „Alte aplicații Ventora”.
import {
  AppShell,
  AppTile,
  Button,
  GrowthSlot,
  Logo,
  type AccessState,
  type AppName,
} from '@ventora/ui';
import { Bar, noop } from './shell';
import { APPTILE_RO } from './labels';
import l from './hubLauncher.module.css';

const MINE: [AppName, string, number?][] = [
  ['booking', 'Programări, calendar și reamintiri', 3],
  ['crm', 'Clienți, istoric și oportunități'],
  ['hr', 'Echipă, prezență și concedii', 1],
  ['finance', 'Facturi, scadențe și restanțe', 2],
  ['projects', 'Proiecte, sarcini și termene'],
  ['shifts', 'Ture și înlocuiri'],
  ['documents', 'Documente și șabloane'],
  ['portal', 'Pagina afacerii pentru clienți'],
];
const OTHER: [AppName, AccessState][] = [
  ['inventory', 'unavailable'],
  ['analytics', 'notInRole'],
  ['marketing', 'notInPlan'],
  ['network', 'notInPlan'],
];
const RECO = {
  reason: 'Se potrivește cu EasyBook: trimite automat reamintiri și campanii clienților tăi.',
  cost: '49 lei pe lună · fără cost de implementare',
};

export function HubBarLeading() {
  return (
    <span className={l.lead}>
      <Logo size={32} />
    </span>
  );
}

export function DemoLauncher() {
  return (
    <div className={l.frameRel}>
      <AppShell
        height="100%"
        contextBar={<Bar hub leading={<HubBarLeading />} countCategory="operational" />}
      >
        <div className={l.wrap}>
          <div className={l.greet}>
            <h1 className="display-l">Bună dimineața, Bianca</h1>
            <p className={`body muted ${l.daylinks}`}>
              Azi ai{' '}
              <a className="v-link" href="#">
                8 programări
              </a>
              ,{' '}
              <a className="v-link" href="#">
                2 facturi scadente
              </a>{' '}
              și{' '}
              <a className="v-link" href="#">
                o cerere de concediu
              </a>{' '}
              de aprobat.
            </p>
          </div>
          <section>
            <div className={l.sechead}>
              <h2 className="display-m">Aplicațiile tale</h2>
              <Button size="sm" variant="quiet" icon="grip-vertical">
                Reordonează
              </Button>
            </div>
            <div className={l.tiles4}>
              {MINE.map(([a, d, b]) => (
                <AppTile
                  key={a}
                  app={a}
                  description={d}
                  badge={b}
                  onOpen={noop}
                  labels={APPTILE_RO}
                />
              ))}
            </div>
          </section>
          <section>
            <h2 className={`display-m ${l.sec}`}>Alte aplicații Ventora</h2>
            <p className={`body-small muted ${l.intro}`}>
              Nu le poți deschide acum. La fiecare scrie de ce și ce poți face.
            </p>
            <div className={`${l.rows} ${l.rows2}`}>
              {OTHER.map(([a, s]) =>
                a === 'marketing' ? (
                  <GrowthSlot key={a} label="Recomandare">
                    <AppTile
                      app={a}
                      access={s}
                      layout="row"
                      recommendation={RECO}
                      onDetails={noop}
                      onDismiss={noop}
                      onRemindLater={noop}
                      labels={APPTILE_RO}
                    />
                  </GrowthSlot>
                ) : (
                  <AppTile
                    key={a}
                    app={a}
                    access={s}
                    layout="row"
                    grantedBy="Bianca Petrașcu"
                    onRequestAccess={noop}
                    onWriteUs={noop}
                    onSeeStatus={noop}
                    labels={APPTILE_RO}
                  />
                ),
              )}
            </div>
            <div className={l.more}>
              <Button variant="quiet" icon="layout-grid" iconEnd="arrow-right">
                Vezi toate aplicațiile Ventora
              </Button>
            </div>
          </section>
        </div>
      </AppShell>
    </div>
  );
}
