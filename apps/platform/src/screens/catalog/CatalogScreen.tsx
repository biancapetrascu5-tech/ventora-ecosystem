'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { APPS, APP_IDS, Toast, type AppName } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import { requestBundle, type CatalogData } from '@/server/catalog-actions';
import {
  CatalogBundlesView,
  type CatalogAppCard,
  type CatalogBundleCard,
} from './CatalogBundlesView';
import s from './catalog.module.css';

/* HubCatalogBundles (Lotul 3.4, S117 / D3-24): textele catalogului din datele afacerii. Prețurile
   sunt în moneda afacerii, cu cifrele scrise în limba persoanei (D3-2). O limită fără text în Hub
   (alte chei decât programări, SMS, e-mailuri, campanii, spațiu) nu apare în listă. */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

const GROUPING = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

const LIMIT_KEYS: Record<string, 'appointments' | 'sms' | 'emails' | 'campaigns'> = {
  'booking.appointments': 'appointments',
  'messaging.sms': 'sms',
  'messaging.email': 'emails',
  'marketing.campaigns': 'campaigns',
};
const STORAGE_KEY = 'documents.storage';

export function CatalogScreen({ data }: { data: CatalogData }) {
  const t = useTranslations('catalog');
  const lim = useTranslations('limits');
  const seats = useTranslations('seats');
  const have = useTranslations('billing.have');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const phone = useIsPhone();
  const [requesting, setRequesting] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; name?: string } | null>(null);

  const money = (minor: number) => {
    const n = minor / 100;
    const text = new Intl.NumberFormat(locale, {
      ...GROUPING,
      minimumFractionDigits: minor % 100 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
    return data.currency === 'EUR' ? `${text} €` : `${text} lei`;
  };
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const limits = (quotas: Record<string, number | null>) =>
    Object.entries(quotas).flatMap(([key, value]) => {
      if (value === null) return [];
      if (key === STORAGE_KEY) return [lim('storage', { amount: `${value} GB` })];
      const k = LIMIT_KEYS[key];
      return k ? [lim(k, { count: value })] : [];
    });
  const appName = (id: string) => (isApp(id) ? APPS[id]?.name : undefined) ?? id;
  const setup = (minor: number) =>
    minor > 0 ? t('setup', { amount: money(minor) }) : t('noSetup');

  const alaCarte = new Set(data.current.lines.map((l) => l.applicationId));
  const bundles: CatalogBundleCard[] = data.bundles.map((b) => {
    const notes: string[] = [];
    if (!b.have) {
      for (const a of b.applications) {
        if (alaCarte.has(a)) notes.push(t('bundles.alsoHave', { app: appName(a) }));
      }
      if (data.interval === 'month' && data.current.totalMinor > 0) {
        const after =
          b.monthMinor +
          data.current.lines
            .filter((l) => !b.applications.includes(l.applicationId))
            .reduce((sum, l) => sum + l.amountMinor, 0);
        notes.push(
          t('bundles.planTotal', { amount: money(after), now: money(data.current.totalMinor) }),
        );
      }
    }
    return {
      id: b.planId,
      title: have('bundle', { name: b.name }),
      appsCount: t('bundles.apps', { count: b.applications.length }),
      validUntil: b.availableUntil
        ? t('bundles.validUntil', { date: day(b.availableUntil) })
        : undefined,
      apps: b.applications.filter(isApp),
      price: t('bundles.price', { amount: money(b.monthMinor) }),
      priceYear:
        b.yearMinor !== null ? t('bundles.priceYear', { amount: money(b.yearMinor) }) : undefined,
      separate:
        b.separateMonthMinor > b.monthMinor
          ? t('bundles.separate', { amount: money(b.separateMonthMinor) })
          : undefined,
      saving:
        b.separateMonthMinor > b.monthMinor
          ? t('bundles.saving', { amount: money(b.separateMonthMinor - b.monthMinor) })
          : undefined,
      limits: limits(b.quotas),
      seats: {
        count: seats('count', { count: data.includedMembers + b.seats }),
        breakdown:
          b.seats > 0
            ? seats('breakdown', { base: data.includedMembers, bundle: b.seats })
            : seats('breakdownBase', { base: data.includedMembers }),
      },
      setup: setup(b.setupMinor),
      have: b.have
        ? t('bundles.haveKeep', { amount: money(b.have.priceMinor ?? b.monthMinor) })
        : undefined,
      notes,
      canRequest: data.owner && !b.have && !sent.includes(b.planId),
    };
  });
  const apps: CatalogAppCard[] = data.applications
    .filter((a) => !a.active && a.monthMinor !== null && isApp(a.id))
    .map((a) => ({
      id: a.id as AppName,
      maintenance: t('app.maintenance', { amount: money(a.monthMinor ?? 0) }),
      setup: setup(a.setupMinor),
      limits: limits(a.quotas).join(' · ') || undefined,
    }));

  async function request(card: CatalogBundleCard) {
    setRequesting(card.id);
    const res = await requestBundle(card.id);
    setRequesting(null);
    if (res.ok) setSent((x) => [...x, card.id]);
    const name = data.bundles.find((b) => b.planId === card.id)?.name;
    setToast({ ok: res.ok, name });
  }

  return (
    <>
      <CatalogBundlesView
        bundles={bundles}
        apps={apps}
        phone={phone}
        requesting={requesting}
        onRequest={(b) => void request(b)}
      />
      {toast && (
        <div className={s.toast}>
          <Toast
            tone={toast.ok ? 'done' : 'danger'}
            title={
              toast.ok
                ? t('bundles.requestSent', { name: toast.name ?? '' })
                : t('bundles.requestFailed')
            }
            description={toast.ok ? t('bundles.requestSentBody') : undefined}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </>
  );
}
