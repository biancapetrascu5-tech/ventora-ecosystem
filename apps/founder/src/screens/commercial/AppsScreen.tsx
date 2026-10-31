'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, APP_IDS, Toast, type AppName } from '@ventora/ui';
import {
  AppPriceDrawer,
  AppsView,
  amountInput,
  commercialStyles as cs,
  count,
  money,
  parseAmount,
  parseCount,
  useIsPhone,
  type AppPriceErrors,
  type AppPriceValues,
  type AppRow,
} from '@ventora/screens';
import {
  saveAppPrices,
  setAppMode,
  type AppData,
  type QuotaInfo,
} from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { useQuotaText } from './labels';

/* FounderApps (Lotul 3.4; S117 1.1.0; D3-24): aplicațiile la bucată — mentenanța lunară și
   anuală și implementarea, în lei și în euro, limitele incluse și comutatorul „Direct / La
   cerere”. D3-23 / D3-24: cu implementare, comutatorul rămâne pe „La cerere” (verificat și în
   baza de date); S117 îl desenează liber — NECESITĂ DECIZIE (raportul 3.4). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);
type Kind = 'month' | 'year' | 'setup';

export function AppsScreen({
  user,
  apps,
  quotas,
  requestsBadge,
}: {
  user: { name: string };
  apps: AppData[];
  quotas: QuotaInfo[];
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.apps');
  const ed = useTranslations('founder.editor.price');
  const ui = useTranslations('ui');
  const q = useQuotaText();
  const phone = useIsPhone();
  const [editing, setEditing] = useState<AppData | null>(null);
  const [values, setValues] = useState<AppPriceValues | null>(null);
  const [errors, setErrors] = useState<AppPriceErrors>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);

  const price = (a: AppData, kind: Kind, currency: 'RON' | 'EUR') =>
    a.prices.find((p) => p.kind === kind && p.currency === currency)?.amountMinor;
  const m = (v: number | undefined, c: 'RON' | 'EUR') => (v === undefined ? '' : money(v, c));

  const rows: AppRow[] = apps
    .filter((a) => isApp(a.id))
    .map((a) => {
      const setupLei = price(a, 'setup', 'RON') ?? 0;
      const setupEur = price(a, 'setup', 'EUR') ?? 0;
      const hasSetup = setupLei > 0 || setupEur > 0;
      return {
        id: a.id,
        app: a.id as AppName,
        maintenance: {
          lei: [m(price(a, 'month', 'RON'), 'RON'), m(price(a, 'year', 'RON'), 'RON')]
            .filter(Boolean)
            .join(' · '),
          eur: [m(price(a, 'month', 'EUR'), 'EUR'), m(price(a, 'year', 'EUR'), 'EUR')]
            .filter(Boolean)
            .join(' · '),
        },
        maintenanceShort: t('mobMaint', {
          amount: m(price(a, 'month', 'RON'), 'RON'),
          eur: m(price(a, 'month', 'EUR'), 'EUR'),
        }),
        setup: hasSetup ? { lei: money(setupLei, 'RON'), eur: money(setupEur, 'EUR') } : null,
        setupShort: hasSetup
          ? t('mobSetup', { amount: money(setupLei, 'RON'), eur: money(setupEur, 'EUR') })
          : t('noSetupShort'),
        limits: Object.entries(a.quotas).map(([k, v]) => q.amount(k, v)),
        direct: a.activationMode === 'direct',
        locked: hasSetup,
      };
    });

  async function toggle(row: AppRow, direct: boolean) {
    const res = await setAppMode(row.id, direct);
    const name = APPS[row.app]?.name ?? row.id;
    setToast(
      res.ok
        ? {
            tone: 'done',
            text: direct ? t('switched', { app: name }) : t('switchedOff', { app: name }),
          }
        : { tone: 'danger', text: t('dialog.error') },
    );
    router.refresh();
  }

  function openEdit(row: AppRow) {
    const a = apps.find((x) => x.id === row.id)!;
    setValues({
      monthlyLei: amountInput(price(a, 'month', 'RON')),
      annualLei: amountInput(price(a, 'year', 'RON')),
      monthlyEur: amountInput(price(a, 'month', 'EUR')),
      annualEur: amountInput(price(a, 'year', 'EUR')),
      setupLei: amountInput(price(a, 'setup', 'RON') ?? 0),
      setupEur: amountInput(price(a, 'setup', 'EUR') ?? 0),
      limits: Object.fromEntries(
        Object.entries(a.quotas).map(([k, v]) => [k, v === null ? '' : count(v)]),
      ),
    });
    setErrors({});
    setFailed(false);
    setEditing(a);
  }

  const saving = (monthly: string, annual: string, c: 'RON' | 'EUR') => {
    const mm = parseAmount(monthly);
    const yy = parseAmount(annual);
    return mm !== null && yy !== null && mm * 12 > yy
      ? ed('saving', { amount: money(mm * 12 - yy, c) })
      : undefined;
  };

  async function save() {
    if (!editing || !values) return;
    const e: AppPriceErrors = {};
    const amounts: Record<string, number | null> = {};
    for (const f of [
      'monthlyLei',
      'annualLei',
      'monthlyEur',
      'annualEur',
      'setupLei',
      'setupEur',
    ] as const) {
      const v = values[f].trim();
      amounts[f] = v ? parseAmount(v) : null;
      if (v && amounts[f] === null) e[f] = t('dialog.errorAmount');
    }
    if (amounts.monthlyLei === null && !e.monthlyLei) e.monthlyLei = t('dialog.errorRequired');
    if (amounts.monthlyEur === null && !e.monthlyEur) e.monthlyEur = t('dialog.errorEur');
    const limits: Record<string, number | null> = {};
    const limitErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(values.limits)) {
      if (!v.trim()) continue;
      const n = parseCount(v);
      if (n === null) limitErrors[k] = t('dialog.errorAmount');
      else limits[k] = n;
    }
    if (Object.keys(limitErrors).length) e.limits = limitErrors;
    setErrors(e);
    if (Object.keys(e).length) return;
    const prices = (
      [
        ['RON', 'month', amounts.monthlyLei],
        ['RON', 'year', amounts.annualLei],
        ['EUR', 'month', amounts.monthlyEur],
        ['EUR', 'year', amounts.annualEur],
        ['RON', 'setup', amounts.setupLei],
        ['EUR', 'setup', amounts.setupEur],
      ] as const
    )
      .filter(([, , v]) => v !== null)
      .map(([currency, kind, v]) => ({ currency, kind, amountMinor: v! }));
    setPending(true);
    setFailed(false);
    const res = await saveAppPrices({ id: editing.id, prices, quotas: limits });
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setToast({
      tone: 'done',
      text: t('dialog.saved', { app: APPS[editing.id as AppName]?.name ?? editing.id }),
    });
    setEditing(null);
    router.refresh();
  }

  return (
    <FounderShell active="aplicatii" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <AppsView rows={rows} onToggle={(r, d) => void toggle(r, d)} onEdit={openEdit} />
      {editing && values && (
        <AppPriceDrawer
          isOpen
          app={editing.id as AppName}
          values={values}
          errors={errors}
          helpers={{
            annualLei: saving(values.monthlyLei, values.annualLei, 'RON'),
            annualEur: saving(values.monthlyEur, values.annualEur, 'EUR'),
          }}
          quotas={quotas.map((x) => ({ key: x.key, label: q.perMonth(x.key) }))}
          pending={pending}
          failed={failed}
          mob={phone}
          onChange={setValues}
          onCancel={() => setEditing(null)}
          onSave={() => void save()}
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
    </FounderShell>
  );
}
