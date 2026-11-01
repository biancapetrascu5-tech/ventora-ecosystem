'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  Dialog,
  Notice,
  PageHeader,
  StatusPill,
  type AppName,
  type IconName,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import styles from '../business.module.css';
import s from './commercial.module.css';

/* FounderBundles (Lotul 3.4, S117, D3-24; FounderPlans 2.0.0 în design): bundle-urile — mai multe
   aplicații la preț mai bun, cu limite și locuri incluse — cu prețul față de aplicațiile luate
   separat, perioada de vânzare și starea („În vânzare”, „Programat”, „Vânzare oprită”), ofertele
   (versiunile) cu perioada lor și câte afaceri au fiecare; „Oprește vânzarea”, „Ofertă nouă”.
   Afacerile își păstrează bundle-ul și prețul după ce oferta se încheie. Doar română (S57). */

export type BundleStatus = 'selling' | 'scheduled' | 'stopped';

export type BundleVersionRow = {
  id: string;
  /** „v2” */
  label: string;
  /** „Acum” / „Următoarea” / „Încheiată”, cu tonul ei. */
  pill: { tone: 'done' | 'neutral'; text: string };
  /** „1–30 nov. 2026” */
  sale: string;
  month: { lei: string; eur: string };
  year: { lei: string; eur: string };
  businesses: number;
  /** „9 afaceri pe Business v2, vezi lista” */
  businessesAria: string;
};

export type BundleCardData = {
  id: string;
  name: string;
  status: BundleStatus;
  /** „În vânzare”, „Programat”, „Vânzare oprită pe 28 oct.” */
  statusText: string;
  /** „Disponibil 1–30 noiembrie · 55 de afaceri” */
  subline: string;
  apps: AppName[];
  price: { month: string; monthEur: string; year: string; yearEur: string } | null;
  separate: { month: string; monthEur: string; saving: string } | null;
  /** Limitele, locurile, implementarea (rânduri gata scrise). */
  includes: string[];
  versions: BundleVersionRow[];
  keepNote: boolean;
};

const ST: Record<BundleStatus, ['done' | 'neutral', IconName]> = {
  selling: ['done', 'circle-check'],
  scheduled: ['neutral', 'calendar-clock'],
  stopped: ['neutral', 'calendar-off'],
};

export function BundleApps({ apps, size = 20 }: { apps: AppName[]; size?: number }) {
  return (
    <span className={s.fbApps}>
      {apps.map((a) => (
        <span key={a} className={`${s.fbApp} body-small`}>
          <AppIcon app={a} size={size} />
          {APPS[a]?.name}
        </span>
      ))}
    </span>
  );
}

function BundleCard({
  b,
  phone,
  onStop,
  onNewOffer,
  onEditOffer,
  onOpenVersion,
  onBusinesses,
}: {
  b: BundleCardData;
  phone: boolean;
  onStop: (b: BundleCardData) => void;
  onNewOffer: (b: BundleCardData) => void;
  onEditOffer: (b: BundleCardData) => void;
  onOpenVersion: (b: BundleCardData, versionId: string) => void;
  onBusinesses: (b: BundleCardData, versionId: string) => void;
}) {
  const t = useTranslations('founder.bundles');
  const p = useTranslations('founder.plans.col');
  return (
    <div className={s.fbCard}>
      <div className={s.fbHead}>
        <div className={s.fbStack1}>
          <div className={s.fbTitle}>
            <span className="heading">{b.name}</span>
            <StatusPill tone={ST[b.status][0]} icon={ST[b.status][1]}>
              {b.statusText}
            </StatusPill>
          </div>
          <p className="body-small muted">{b.subline}</p>
        </div>
        <div className={s.fbActs}>
          {b.status === 'selling' && (
            <Button size="sm" variant="quiet" icon="lock" onPress={() => onStop(b)}>
              {t('stop')}
            </Button>
          )}
          {b.status === 'scheduled' ? (
            <Button size="sm" variant="quiet" icon="pencil" onPress={() => onEditOffer(b)}>
              {t('editOffer')}
            </Button>
          ) : (
            <Button size="sm" icon="plus" onPress={() => onNewOffer(b)}>
              {t('newOffer')}
            </Button>
          )}
        </div>
      </div>
      <BundleApps apps={b.apps} />
      <div className={phone ? `${s.fbGrid} ${s.fbGridMob}` : s.fbGrid}>
        <div>
          <p className={`caption ${s.fbK}`}>{t('price')}</p>
          {b.price && (
            <>
              <p className="body-strong v-num">
                {b.price.month} · <span className="body muted">{b.price.monthEur}</span>
              </p>
              <p className="body-small muted v-num">
                {b.price.year} · {b.price.yearEur}
              </p>
            </>
          )}
        </div>
        <div>
          <p className={`caption ${s.fbK}`}>{t('separate')}</p>
          {b.separate && (
            <>
              <p className="body v-num">
                {b.separate.month} · <span className="muted">{b.separate.monthEur}</span>
              </p>
              <p className="body-small v-num">{b.separate.saving}</p>
            </>
          )}
        </div>
        <div>
          <p className={`caption ${s.fbK}`}>{t('includes')}</p>
          <ul className={`${s.fbInc} body-small`}>
            {b.includes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={s.fbTw}>
        <table className={s.fbVer}>
          <thead>
            <tr>
              <th className="caption" scope="col">
                {p('version')}
              </th>
              <th className="caption" scope="col">
                {t('col.sale')}
              </th>
              <th className="caption" scope="col">
                {p('monthly')}
              </th>
              {!phone && (
                <th className="caption" scope="col">
                  {p('annual')}
                </th>
              )}
              <th className="caption" scope="col">
                {p('businesses')}
              </th>
            </tr>
          </thead>
          <tbody>
            {b.versions.map((v) => (
              <tr key={v.id}>
                <td className="body-strong">
                  <span className={s.fbTitle}>
                    <button
                      type="button"
                      className={s.versionLink}
                      onClick={() => onOpenVersion(b, v.id)}
                    >
                      {v.label}
                    </button>
                    <StatusPill size="sm" tone={v.pill.tone}>
                      {v.pill.text}
                    </StatusPill>
                  </span>
                </td>
                <td className="body-small v-num">{v.sale}</td>
                <td>
                  <span className={s.fbCell}>
                    <span className="body v-num">{v.month.lei}</span>
                    <span className="body-small muted v-num">{v.month.eur}</span>
                  </span>
                </td>
                {!phone && (
                  <td>
                    <span className={s.fbCell}>
                      <span className="body v-num">{v.year.lei}</span>
                      <span className="body-small muted v-num">{v.year.eur}</span>
                    </span>
                  </td>
                )}
                <td className="body">
                  {v.businesses ? (
                    <button
                      type="button"
                      className={`${s.link} v-num`}
                      aria-label={v.businessesAria}
                      onClick={() => onBusinesses(b, v.id)}
                    >
                      {v.businesses}
                    </button>
                  ) : (
                    <span className="muted v-num">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.keepNote && <p className="body-small muted">{t('keepNote')}</p>}
    </div>
  );
}

export function BundlesView({
  bundles,
  onNew,
  onStop,
  onNewOffer,
  onEditOffer,
  onOpenVersion,
  onBusinesses,
  phone: phoneProp,
}: {
  bundles: BundleCardData[];
  onNew: () => void;
  onStop: (b: BundleCardData) => void;
  onNewOffer: (b: BundleCardData) => void;
  onEditOffer: (b: BundleCardData) => void;
  onOpenVersion: (b: BundleCardData, versionId: string) => void;
  onBusinesses: (b: BundleCardData, versionId: string) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.bundles');
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  return (
    <>
      <PageHeader
        title={t('title')}
        description={phone ? undefined : t('lead')}
        actions={
          <Button icon="plus" onPress={onNew}>
            {t('new')}
          </Button>
        }
      />
      <div className={styles.axb}>
        <div className={s.stack}>
          {bundles.length ? (
            bundles.map((b) => (
              <BundleCard
                key={b.id}
                b={b}
                phone={phone}
                onStop={onStop}
                onNewOffer={onNewOffer}
                onEditOffer={onEditOffer}
                onOpenVersion={onOpenVersion}
                onBusinesses={onBusinesses}
              />
            ))
          ) : (
            <p className="body muted">{t('empty')}</p>
          )}
        </div>
      </div>
    </>
  );
}

/** „Oprești vânzarea pentru {name}?” (S117): ce se întâmplă, cine îl păstrează, jurnalul. */
export function StopBundleDialog({
  name,
  body,
  keep,
  pending,
  failed,
  mob,
  inline,
  onCancel,
  onConfirm,
}: {
  name: string;
  body: string;
  keep: string;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.bundles');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      icon="lock"
      title={t('stopDialog.title', { name })}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('stopDialog.cancel')}
          </Button>
          <Button variant="primary" icon="lock" isPending={pending} onPress={onConfirm}>
            {t('stop')}
          </Button>
        </>
      }
    >
      <div className={s.stack2}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        <p className="body">{body}</p>
        <p className="body">{keep}</p>
        <p className="body-small muted">{t('stopDialog.log')}</p>
      </div>
    </Dialog>
  );
}
