'use client';

import { useTranslations } from 'next-intl';
import { AppTile, Input, Toggle, type AppName, type AppTileRecommendation } from '@ventora/ui';
import { useAppTileLabels } from '../labels';
import s from './apps.module.css';

/* HubCatalog (Lotul 3.7): toate cele 15 aplicații Ventora Systems, pe categorii, cu căutare și
   „Doar cele pe care nu le ai”. Cele deținute spun „în abonament” și se deschid; celelalte arată
   ce fac și prețul. Fără Growth (S111): fără recomandări în aplicație; galeria le arată, ca în
   primul cadru din design. Vedere fără logică: textele vin gata scrise. */

export type AppsTile = {
  app: AppName;
  owned: boolean;
  /** Deținută: „Programări, calendar și reamintiri · în abonament”. */
  description?: string;
  /** Nedeținută: „Echipamente, revizii și garanții. 39 lei pe lună” */
  reason?: string;
  recommendation?: AppTileRecommendation;
  onOpen?: () => void;
  onDetails?: () => void;
  onWriteUs?: () => void;
};

export type AppsGroup = { id: string; title: string; tiles: AppsTile[] };

export function AppsView({
  phone,
  lead,
  query,
  onQuery,
  onlyMissing,
  onOnlyMissing,
  groups,
  empty,
}: {
  phone: boolean;
  lead: string;
  query: string;
  onQuery: (q: string) => void;
  onlyMissing: boolean;
  onOnlyMissing: (on: boolean) => void;
  groups: AppsGroup[];
  /** Fără rezultate la căutare. */
  empty?: string;
}) {
  const t = useTranslations('hub.apps');
  const labels = useAppTileLabels();
  return (
    <div className={s.wrap}>
      <div className={s.intro}>
        <h1 className={`display-m ${s.m0}`}>{t('title')}</h1>
        <p className={`body muted ${s.m0}`}>{lead}</p>
      </div>
      <div className={s.tools}>
        <div className={s.search}>
          <Input
            icon="search"
            placeholder={t('search')}
            aria-label={t('searchLabel')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
        <Toggle isSelected={onlyMissing} onChange={onOnlyMissing}>
          {t('only')}
        </Toggle>
      </div>
      {groups.map((g) =>
        g.tiles.length === 0 ? null : (
          <section key={g.id}>
            <h2 className={`heading ${s.sec}`}>{g.title}</h2>
            <div className={phone ? s.rows : s.tiles4}>
              {g.tiles.map((a) =>
                a.owned ? (
                  <AppTile
                    key={a.app}
                    app={a.app}
                    layout={phone ? 'row' : 'tile'}
                    description={a.description}
                    onOpen={a.onOpen}
                    labels={labels}
                  />
                ) : (
                  <AppTile
                    key={a.app}
                    app={a.app}
                    layout={phone ? 'row' : 'tile'}
                    access="notInPlan"
                    reason={a.reason}
                    recommendation={a.recommendation}
                    onDetails={a.onDetails}
                    onWriteUs={a.onWriteUs}
                    labels={labels}
                  />
                ),
              )}
            </div>
          </section>
        ),
      )}
      {empty && <p className={`body muted ${s.m0}`}>{empty}</p>}
    </div>
  );
}
