'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_IDS, Toast, type AppName } from '@ventora/ui';
import {
  BundleEditorBar,
  BundleEditorView,
  amountInput,
  commercialStyles as cs,
  count,
  money,
  parseAmount,
  parseCount,
  useDates,
  useIsPhone,
  type BundleEditorState,
  type EditorField,
  type EditorPrices,
} from '@ventora/screens';
import {
  saveOffer,
  scheduleOffer,
  type OfferDetail,
  type OfferInput,
} from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { MEMBERS, appPrice, priceOf } from './bundleText';
import { dayDate, useQuotaText } from './labels';

/* FounderBundleEditor (Lotul 3.4, S117): „Ofertă nouă” pentru un bundle — aplicațiile (cu prețul
   la bucată și totalul separat), cele patru prețuri, implementarea, limitele, locurile din bundle
   și perioada de vânzare. „Salvează ciorna” și „Programează oferta” (publicarea: oferta nu se mai
   schimbă). Erorile se văd înainte, iar serverul le verifică din nou (suprapunerea, trigger-ul). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);
const iso = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;
const addDay = (isoDate: string) => {
  const d = dayDate(isoDate);
  d.setDate(d.getDate() + 1);
  return iso(d)!;
};

export function BundleEditorScreen({
  user,
  data,
  requestsBadge,
}: {
  user: { name: string };
  data: OfferDetail;
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.bundleEditor');
  const b = useTranslations('founder.bundles');
  const ed = useTranslations('founder.editor.price');
  const ui = useTranslations('ui');
  const q = useQuotaText();
  const dates = useDates();
  const phone = useIsPhone();
  const offer = data.offer;
  const base = data.base;
  const readOnly = offer.published;

  const [apps, setApps] = useState<string[]>(offer.applications);
  const [prices, setPrices] = useState<EditorPrices>({
    monthlyLei: amountInput(priceOf(offer, 'RON', 'month')),
    annualLei: amountInput(priceOf(offer, 'RON', 'year')),
    monthlyEur: amountInput(priceOf(offer, 'EUR', 'month')),
    annualEur: amountInput(priceOf(offer, 'EUR', 'year')),
    setupLei: amountInput(priceOf(offer, 'RON', 'setup') ?? 0),
    setupEur: amountInput(priceOf(offer, 'EUR', 'setup') ?? 0),
  });
  const keys = useMemo(() => {
    const k = new Set<string>([...Object.keys(offer.quotas), ...Object.keys(base?.quotas ?? {})]);
    for (const a of offer.applications) {
      for (const qk of Object.keys(data.apps.find((x) => x.id === a)?.quotas ?? {})) k.add(qk);
    }
    k.delete(MEMBERS);
    return [...k].sort();
  }, [offer, base, data.apps]);
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      keys.map((k) => [
        k,
        offer.quotas[k] === undefined || offer.quotas[k] === null ? '' : count(offer.quotas[k]!),
      ]),
    ),
  );
  const [seats, setSeats] = useState(count(offer.quotas[MEMBERS] ?? 0));
  const [from, setFrom] = useState<Date | null>(
    offer.availableFrom ? dayDate(offer.availableFrom) : null,
  );
  const [until, setUntil] = useState<Date | null>(
    offer.availableUntil ? dayDate(offer.availableUntil) : null,
  );
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<EditorField, string>>>({});
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);

  const sepM = apps.reduce((s, a) => s + appPrice(data.apps, a, 'RON', 'month'), 0);
  const sepY = apps.reduce((s, a) => s + appPrice(data.apps, a, 'RON', 'year'), 0);
  const sepE = apps.reduce((s, a) => s + appPrice(data.apps, a, 'EUR', 'month'), 0);
  const sepEY = apps.reduce((s, a) => s + appPrice(data.apps, a, 'EUR', 'year'), 0);
  const setupSepLei = apps.reduce((s, a) => s + appPrice(data.apps, a, 'RON', 'setup'), 0);
  const setupSepEur = apps.reduce((s, a) => s + appPrice(data.apps, a, 'EUR', 'setup'), 0);
  const mL = parseAmount(prices.monthlyLei);
  const yL = parseAmount(prices.annualLei);
  const mE = parseAmount(prices.monthlyEur);
  const yE = parseAmount(prices.annualEur);
  const longDay = (d: string) =>
    new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' }).format(dayDate(d));

  // the errors shown before saving (the server checks them again)
  const errors: Partial<Record<EditorField, string>> = { ...serverErrors };
  if (mL === null) errors.monthlyLei = t('error.required');
  else if (sepM > 0 && mL >= sepM)
    errors.monthlyLei = t('error.notCheaper', { amount: money(sepM, 'RON') });
  if (mE === null) errors.monthlyEur = t('error.eurMissing');
  if (prices.annualLei.trim() && yL === null) errors.annualLei = t('error.amount');
  if (prices.annualEur.trim() && yE === null) errors.annualEur = t('error.amount');
  if (!from) errors.from = t('error.fromRequired');
  if (from && until && until < from) errors.until = t('error.untilBeforeFrom');
  if (from && base?.published && base.availableUntil && iso(from)! <= base.availableUntil) {
    errors.from = t('error.overlap', {
      date: longDay(base.availableUntil),
      first: longDay(addDay(base.availableUntil)),
    });
  }
  if (parseCount(seats) === null) errors.seats = t('error.amount');
  const hasErrors = Object.keys(errors).length > 0;

  const state: BundleEditorState = {
    apps: data.apps
      .filter((a) => isApp(a.id))
      .map((a) => ({
        id: a.id as AppName,
        checked: apps.includes(a.id),
        price: b('perMonth', { amount: money(appPrice(data.apps, a.id, 'RON', 'month'), 'RON') }),
        isNew: !!base && apps.includes(a.id) && !base.applications.includes(a.id),
      })),
    separate: {
      label: t('apps.separate', { count: apps.length }),
      month: b('perMonth', { amount: money(sepM, 'RON') }),
      rest: `${money(sepY, 'RON')} · ${money(sepE, 'EUR')} · ${money(sepEY, 'EUR')}`,
    },
    prices,
    helpers: {
      monthlyLei:
        mL !== null && sepM > mL
          ? t('price.saving', {
              amount: money(sepM - mL, 'RON'),
              pct: Math.round(((sepM - mL) / sepM) * 100),
            })
          : undefined,
      annualLei:
        mL !== null && yL !== null && mL * 12 > yL
          ? ed('saving', { amount: money(mL * 12 - yL, 'RON') })
          : undefined,
      monthlyEur: t('price.separateEur', { amount: money(sepE, 'EUR') }),
      annualEur:
        mE !== null && yE !== null && mE * 12 > yE
          ? ed('saving', { amount: money(mE * 12 - yE, 'EUR') })
          : undefined,
    },
    setupDesc: t('setup.desc', {
      amount: money(setupSepLei, 'RON'),
      eur: money(setupSepEur, 'EUR'),
    }),
    limits: keys.map((k) => {
      const b0 = base?.quotas[k];
      const v = parseCount(limits[k] ?? '');
      const before = b0 === undefined ? 0 : b0;
      return {
        key: k,
        label: q.perMonth(k),
        base: b0 === undefined ? '—' : b0 === null ? q.amount(k, null) : count(b0),
        value: limits[k] ?? '',
        dir: v === null || before === null || v === before ? 'same' : v > before ? 'up' : 'down',
      };
    }),
    baseLabel: base ? `v${base.number}` : '—',
    newLabel: `v${offer.number}`,
    seats,
    seatsHelp: t('seats.help', {
      base: data.includedMembers,
      total: data.includedMembers + (parseCount(seats) ?? 0),
    }),
    from,
    until,
    catalogNote: until ? t('sale.catalog', { date: longDay(iso(until)!) }) : undefined,
    errors: readOnly ? {} : errors,
  };

  const input = (): OfferInput => ({
    versionId: offer.id,
    applications: apps,
    features: offer.features,
    quotas: {
      ...Object.fromEntries(
        Object.entries(limits)
          .map(([k, v]) => [k, parseCount(v)] as const)
          .filter(([, v]) => v !== null),
      ),
      [MEMBERS]: parseCount(seats) ?? 0,
    },
    prices: (
      [
        ['RON', 'month', mL],
        ['RON', 'year', yL],
        ['EUR', 'month', mE],
        ['EUR', 'year', yE],
        ['RON', 'setup', parseAmount(prices.setupLei || '0')],
        ['EUR', 'setup', parseAmount(prices.setupEur || '0')],
      ] as const
    )
      .filter(([, , v]) => v !== null)
      .map(([currency, kind, v]) => ({ currency, kind, amountMinor: v! })),
    availableFrom: iso(from),
    availableUntil: iso(until),
  });

  async function save(schedule: boolean) {
    setServerErrors({});
    if (schedule) setScheduling(true);
    else setSaving(true);
    const res = schedule ? await scheduleOffer(input()) : await saveOffer(input());
    setSaving(false);
    setScheduling(false);
    if (!res.ok) {
      if (res.field === 'availableFrom') setServerErrors({ from: t('error.overlapServer') });
      else if (res.field === 'availableUntil')
        setServerErrors({ until: t('error.untilBeforeFrom') });
      setToast({ tone: 'danger', text: t('error.save') });
      return;
    }
    if (schedule) {
      router.push('/bundles');
      return;
    }
    setSavedAt(new Date());
    router.refresh();
  }

  return (
    <div className={cs.frame}>
      <FounderShell
        active="planuri"
        title={t('title', { name: data.bundle.name, v: `v${offer.number}` })}
        user={user}
        requestsBadge={requestsBadge}
      >
        <BundleEditorView
          title={t('title', { name: data.bundle.name, v: `v${offer.number}` })}
          crumbs={{
            bundles: b('title'),
            bundle: data.bundle.name,
            current: readOnly ? `v${offer.number}` : t('crumb', { v: `v${offer.number}` }),
          }}
          notice={
            !readOnly && hasErrors
              ? { kind: 'error', body: t('error.publish') }
              : {
                  kind: 'keep',
                  title: t('keepTitle'),
                  body: base?.availableUntil
                    ? t('keepBody', {
                        date: longDay(base.availableUntil),
                        count: data.businessesOnBundle,
                        name: data.bundle.name,
                      })
                    : t('keepBodyOpen', { count: data.businessesOnBundle, name: data.bundle.name }),
                }
          }
          state={state}
          readOnly={readOnly}
          onApps={(id, on) => setApps(on ? [...apps, id] : apps.filter((x) => x !== id))}
          onPrices={setPrices}
          onLimit={(k, v) => setLimits({ ...limits, [k]: v })}
          onSeats={setSeats}
          onPeriod={(f, u) => {
            setFrom(f);
            setUntil(u);
          }}
        />
      </FounderShell>
      {!readOnly && (
        <BundleEditorBar
          savedLabel={savedAt ? t('savedAt', { time: dates.time(savedAt) }) : undefined}
          scheduleLabel={t('schedule')}
          canSchedule={!hasErrors}
          saving={saving}
          scheduling={scheduling}
          onSave={() => void save(false)}
          onSchedule={() => void save(true)}
        />
      )}
      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone={toast.tone}
            title={toast.text}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </div>
  );
}
