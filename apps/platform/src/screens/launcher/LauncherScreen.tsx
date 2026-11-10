'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  APPS,
  AppDock,
  AppIcon,
  AppLaunch,
  AppTile,
  BrandZone,
  Button,
  EmptyState,
  type AppName,
  type DockApp,
} from '@ventora/ui';
import type { LauncherData } from '@/server/launcher-actions';
import { useAppTileLabels } from '../labels';
import styles from './launcher.module.css';

/* Lotul 5.1 — HubLauncher 1.1.0 (S136) pe datele afacerii, pe structura preview-ului:
   - banda: data și afacerea, salutul, fraza zilei — „Azi ai [8 programări].” doar cu EasyBook
     disponibil persoanei (singurul chip, D5-17), altfel propoziția simplă; „Aplicațiile tale”;
   - AppDock cu aplicațiile disponibile, peste marginea benzii; fără cardul Portal (D5-16) și fără
     „Reordonează” (D5-15);
   - „Alte aplicații Ventora Systems”: starea fiecăreia (D5-3) și ce poate face persoana;
   - fără nicio aplicație disponibilă: HubEmpty (fără „Cere acces” până la designul notificării
     către proprietar).
   Slotul Growth pe una dintre „Alte aplicații” vine în 5.9. */

/** Unde se deschide o aplicație disponibilă: EasyBook are rutele lui; restul, pagina din catalog. */
const appHref = (app: AppName) => (app === 'booking' ? '/booking' : `/applications/${app}`);

function greetingKey(hour: number): 'morning' | 'day' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  return 'evening';
}

function Chevrons() {
  return (
    <svg className={styles.chev} viewBox="0 0 176 240" aria-hidden>
      {[40, 72, 104].map((y) => (
        <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
      ))}
      <polyline points="48,168 88,224 128,168" />
    </svg>
  );
}

export interface LauncherScreenProps {
  data: LauncherData;
  userName: string;
  businessName: string;
  /** Momentul randării (din server), ca data și salutul să nu se schimbe la hidratare. */
  now: string;
}

export function LauncherScreen({ data, userName, businessName, now }: LauncherScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('hub.launcher');
  const desc = useTranslations('hub.apps.desc');
  const labels = useAppTileLabels();
  const [launch, setLaunch] = useState<{
    app: AppName;
    name: string;
    from?: DOMRect;
    fromCard?: DOMRect;
  } | null>(null);

  const at = new Date(now);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: data.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: data.timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at),
  );
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;

  const available = data.apps.filter((a) => a.state === 'available');
  const others = data.apps.filter((a) => a.state !== 'available');
  const empty = available.length === 0;
  const dock: DockApp[] = available.map((a) => ({ app: a.app, description: desc(a.app) }));

  const day = empty
    ? t('empty.welcome', { business: businessName })
    : data.appointmentsToday === null
      ? t('sentence.plain')
      : data.appointmentsToday === 0
        ? t('sentence.noAppointments')
        : t.rich('sentence.appointments', {
            count: data.appointmentsToday,
            chip: (chunks) => (
              <Link className={styles.chip} href="/booking">
                <AppIcon app="booking" size={20} />
                <span>{chunks}</span>
              </Link>
            ),
          });

  const sechead = (cls: string, id?: string) => (
    <div className={cls}>
      <h2 className="display-m" id={id}>
        {t('yourApps')}
      </h2>
    </div>
  );

  return (
    <div className={styles.lb}>
      <div className={styles.wrap}>
        <BrandZone className={styles.band}>
          <div className={styles.hero}>
            <div className={styles.heroText}>
              <p className={`eyebrow ${styles.eyebrow}`}>
                {t('eyebrow', { date, business: businessName })}
              </p>
              <h1 className="display-hub">
                {t(`greeting.${greetingKey(hour)}`, { name: firstName })}
              </h1>
              <p className={`lead ${styles.day}`}>{day}</p>
            </div>
            <Chevrons />
          </div>
          {!empty && sechead(styles.sechead, 'launcher-your-apps')}
        </BrandZone>

        {empty ? (
          <div className={styles.empty}>
            <EmptyState
              icon="layout-grid"
              title={t('empty.title')}
              description={
                data.ownerName ? t('empty.body', { owner: data.ownerName }) : t('empty.bodyNoOwner')
              }
            />
          </div>
        ) : (
          <>
            {sechead(styles.secheadMobile)}
            <div className={styles.mine}>
              <AppDock
                apps={dock}
                label={t('yourApps')}
                tileLabels={labels}
                onOpen={(_e, app, name, info) => {
                  setLaunch({ app, name, from: info.from, fromCard: info.fromCard });
                  router.push(appHref(app));
                }}
              />
            </div>
          </>
        )}

        {others.length > 0 && (
          <section aria-labelledby="launcher-others">
            <h2 id="launcher-others" className={`display-m ${styles.sec}`}>
              {t('others.title')}
            </h2>
            <p className={`body ${styles.intro}`}>{t('others.lead')}</p>
            <div className={styles.rows}>
              {others.map((a) => (
                <AppTile
                  key={a.app}
                  app={a.app}
                  layout="row"
                  access={a.state}
                  labels={labels}
                  grantedBy={data.ownerName ?? undefined}
                  reason={
                    a.reason === 'trialEnded'
                      ? t('trialEnded', { app: APPS[a.app]?.name ?? a.app })
                      : undefined
                  }
                  onSeeStatus={
                    a.state === 'unavailable'
                      ? () => router.push(`/applications/${a.app}`)
                      : undefined
                  }
                  onWriteUs={
                    a.state === 'notInPlan'
                      ? () => router.push(`/applications/${a.app}`)
                      : undefined
                  }
                />
              ))}
            </div>
            <div className={styles.seeAll}>
              <Button
                variant="quiet"
                icon="layout-grid"
                iconEnd="arrow-right"
                onClick={() => router.push('/applications')}
              >
                {t('seeAll')}
              </Button>
            </div>
          </section>
        )}
      </div>

      {launch && (
        <AppLaunch
          openingLabel={(app) => t('launching', { app })}
          app={launch.app}
          name={launch.name}
          from={launch.from}
          fromCard={launch.fromCard}
          onDone={() => setLaunch(null)}
        />
      )}
    </div>
  );
}
