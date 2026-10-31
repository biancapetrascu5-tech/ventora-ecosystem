'use client';

import { useTranslations } from 'next-intl';
import { APPS, AppIcon, Button, PageHeader, StatusPill, type AppName } from '@ventora/ui';
import s from './catalog.module.css';

/* HubCatalogBundles (Lotul 3.4, S117, D3-24): catalogul din Hub — bundle-urile disponibile acum
   („Ofertă valabilă până pe 30 noiembrie”), prețul lunar și anual, față de aceleași aplicații
   luate separat („Economisești … pe lună”), limitele și locurile incluse, implementarea; bundle-ul
   pe care afacerea îl are („Ai acest bundle”, îl păstrează la prețul ei); „Cere acest bundle”;
   dedesubt, aplicațiile la bucată (mentenanța, implementarea, ce includ). Prețurile, în moneda
   afacerii, în orice limbă (D3-2). Vedere fără logică: textele datelor vin gata scrise. */

export type CatalogBundleCard = {
  id: string;
  /** „Bundle Business” */
  title: string;
  /** „4 aplicații” */
  appsCount: string;
  /** „Ofertă valabilă până pe 30 noiembrie” (lipsă pentru o ofertă fără termen) */
  validUntil?: string;
  apps: AppName[];
  /** „319 lei pe lună” / „sau 3.190 lei pe an” */
  price: string;
  priceYear?: string;
  /** „Separat: 366 lei pe lună” / „Economisești 47 lei pe lună” */
  separate?: string;
  saving?: string;
  /** Limitele incluse; ultimul rând: locurile („10 locuri în echipă” · „3 incluse… + 7 din bundle”). */
  limits: string[];
  seats: { count: string; breakdown: string };
  /** „Implementare: 600 lei, o singură dată” / „Fără cost de implementare” */
  setup: string;
  /** Bundle-ul afacerii: „Îl păstrezi la prețul tău: 300 lei pe lună.” */
  have?: string;
  /** „Include și CampaignKit…”, „Abonamentul tău ar fi…” */
  notes?: string[];
  /** Doar owner-ul cere (D3-8); o cerere deja trimisă nu se trimite din nou. */
  canRequest: boolean;
};

export type CatalogAppCard = {
  id: AppName;
  /** „Mentenanță: 29 lei pe lună” */
  maintenance: string;
  /** „Fără cost de implementare” / „Implementare: 150 lei, o singură dată” */
  setup: string;
  /** „5 GB spațiu pentru documente” */
  limits?: string;
  onOpen?: () => void;
};

export function CatalogBundlesView({
  bundles,
  apps,
  phone,
  requesting,
  onRequest,
}: {
  bundles: CatalogBundleCard[];
  apps: CatalogAppCard[];
  phone: boolean;
  requesting?: string | null;
  onRequest: (b: CatalogBundleCard) => void;
}) {
  const t = useTranslations('catalog');
  return (
    <div className={s.wrap}>
      <PageHeader title={t('bundles.title')} description={t('bundles.lead')} />
      <div className={s.grid}>
        {bundles.map((b) => (
          <div key={b.id} className={s.card}>
            <div className={s.head}>
              <div className={s.stack1}>
                <span className="heading">{b.title}</span>
                <span className="body-small muted">{b.appsCount}</span>
              </div>
              {b.validUntil && (
                <StatusPill tone="neutral" icon="calendar-clock">
                  {b.validUntil}
                </StatusPill>
              )}
            </div>
            <div className={s.apps}>
              {b.apps.map((a) => (
                <span key={a} className={`${s.app} body-small`}>
                  <AppIcon app={a} size={20} />
                  {APPS[a]?.name}
                </span>
              ))}
            </div>
            <div className={s.price}>
              <span className="display-m v-num">{b.price}</span>
              {b.priceYear && <span className="body-small muted v-num">{b.priceYear}</span>}
            </div>
            {b.separate && (
              <div className={s.cmp}>
                <span className="body-small muted v-num">{b.separate}</span>
                {b.saving && <span className="body-strong v-num">{b.saving}</span>}
              </div>
            )}
            <div className={s.stack2}>
              <span className="caption muted">{t('bundles.limits')}</span>
              <ul className={`${s.inc} body-small`}>
                {b.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                <li>
                  {b.seats.count}
                  <span className="muted"> · {b.seats.breakdown}</span>
                </li>
              </ul>
            </div>
            <p className={`body-small ${s.m0}`}>{b.setup}</p>
            {b.have ? (
              <div className={s.stack2}>
                <span>
                  <StatusPill tone="done" icon="circle-check">
                    {t('bundles.have')}
                  </StatusPill>
                </span>
                <p className={`body-small muted ${s.m0}`}>{b.have}</p>
              </div>
            ) : (
              <div className={s.stack2}>
                {b.notes?.map((n) => (
                  <p key={n} className={`body-small ${s.m0}`}>
                    {n}
                  </p>
                ))}
                {b.canRequest && (
                  <Button
                    variant="primary"
                    block={phone}
                    icon="send"
                    isPending={requesting === b.id}
                    onPress={() => onRequest(b)}
                  >
                    {t('bundles.request')}
                  </Button>
                )}
                <p className={`caption muted ${s.m0}`}>{t('bundles.requestNote')}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {apps.length > 0 && (
        <div className={s.sec}>
          <div>
            <h2 className={`heading ${s.m0}`}>{t('alaCarte.title')}</h2>
            <p className={`body-small muted ${s.lead}`}>{t('alaCarte.lead')}</p>
          </div>
          <div className={s.alc}>
            {apps.map((a) => (
              <div key={a.id} className={s.alci}>
                <span className={`${s.app} body-strong`}>
                  <AppIcon app={a.id} size={28} />
                  {APPS[a.id]?.name}
                </span>
                <span className="body v-num">{a.maintenance}</span>
                <span className="body-small muted v-num">{a.setup}</span>
                {a.limits && <span className="body-small muted">{a.limits}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
