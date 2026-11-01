'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_IDS, DialogTrigger, type AppName } from '@ventora/ui';
import {
  BusinessBillingView,
  BusinessUsageSection,
  DiscountDialog,
  EndDiscountDialog,
  ExceptionsSection,
  PlanCardContent,
  count,
  money,
  parseAmount,
  useDates,
  useIsPhone,
  type DiscountFormErrors,
  type DiscountFormValues,
  type DiscountRow,
  type ExceptionRow,
  type UsageItem,
} from '@ventora/screens';
import {
  addDiscount,
  editDiscount,
  endException,
  finishDiscount,
  type BusinessCommercialData,
} from '@/server/commercial-actions';
import { dayDate, useQuotaText } from '../commercial/labels';

/* Partea comercială a paginii unei afaceri (Lotul 3.4): consumul față de limite pe perioada reală
   (D3-3), excepțiile, fișa abonamentului (cum plătește, moneda, reînnoirea, ziua de reset) și tabul
   „Plăți și facturi” (abonamentul și reducerile, D3-21). Istoricul cumpărărilor, rambursarea și
   confirmarea transferului cer Stripe / SmartBill (loturile 3.5, 3.6, 3.8). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

type C = BusinessCommercialData;

export function useCommercialText(c: C | null) {
  const t = useTranslations('founder.business');
  const d = useTranslations('founder.discounts');
  const q = useQuotaText();
  const dates = useDates();
  const sub = c?.subscription ?? null;
  const longDay = (iso: string) =>
    new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' }).format(dayDate(iso));
  const fullDay = (iso: string) =>
    new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      dayDate(iso),
    );

  const price = sub ? money(sub.priceMinor, c!.currency) : '';
  const billing = sub
    ? sub.planName
      ? sub.interval === 'year'
        ? t('billingAnnual', { amount: price })
        : t('billingMonthly', { amount: price })
      : t('alaCarte')
    : '';
  const discountValue = (x: C['discounts'][number]) =>
    x.kind === 'percent' ? `${x.percentOff}%` : money(x.amountOffMinor ?? 0, c!.currency);
  const lineName = (id: string | null) => c?.lines.find((l) => l.id === id)?.name ?? '';
  const discountWhat = (x: C['discounts'][number]) =>
    x.scope === 'subscription'
      ? d('what.plan')
      : x.scope === 'application'
        ? d('what.application', { name: lineName(x.lineId) })
        : d('what.addon', { name: lineName(x.lineId) });
  const duration = (x: C['discounts'][number]) =>
    x.duration === 'once'
      ? d('duration.once')
      : x.duration === 'forever'
        ? d('duration.permanent')
        : d('duration.months', {
            count: x.durationMonths ?? 0,
            date: x.lastInvoiceOn ? fullDay(x.lastInvoiceOn) : '',
          });

  const subDiscount = c?.discounts.find((x) => x.scope === 'subscription');
  const note = sub
    ? [
        t('currency', { currency: c!.currency === 'EUR' ? t('currencyEur') : t('currencyLei') }),
        subDiscount
          ? subDiscount.duration === 'forever'
            ? t('discountForever', { value: discountValue(subDiscount) })
            : subDiscount.lastInvoiceOn || subDiscount.firstInvoiceOn
              ? t('discountNote', {
                  value: discountValue(subDiscount),
                  date: longDay(subDiscount.lastInvoiceOn ?? subDiscount.firstInvoiceOn),
                })
              : null
          : null,
        sub.trialEndsAt ? t('trialUntil', { date: dates.day(new Date(sub.trialEndsAt)) }) : null,
        t('renews', { date: longDay(sub.nextBillingDate) }),
        t('resetShort', { day: sub.anchorDay }),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const usageTitle = sub
    ? t('usage.title', {
        from: dates.day(dayDate(sub.quotaPeriod.start)),
        to: dates.day(new Date(dayDate(sub.quotaPeriod.end).getTime() - 86_400_000)),
      })
    : t('usage.titleNoPeriod');
  const usageItems: UsageItem[] = (c?.quotas ?? [])
    .filter((x) => x.limit !== null && x.limit > 0)
    .map((x) => ({
      key: x.key,
      label: q.label(x.key),
      used: x.used,
      limit: x.limit!,
      unit: x.key === 'documents.storage' ? 'GB' : undefined,
      note:
        x.estimate.state === 'date' && x.estimate.date
          ? t('usage.estimate', { date: longDay(x.estimate.date) })
          : undefined,
    }));
  const exceptions: ExceptionRow[] = (c?.overrides ?? []).map((o) => ({
    id: o.id,
    what: o.quotaKey ? q.limit(o.quotaKey) : '',
    value: t('exceptions.value', {
      value: o.limit === null ? t('exceptions.unlimited') : count(o.limit),
      base: o.planLimit === null ? t('exceptions.unlimited') : count(o.planLimit),
    }),
    until: dates.day(new Date(o.expiresAt)),
    reason: o.reason,
    by: t('exceptions.by', { name: o.by, date: dates.day(new Date(o.createdAt)) }),
  }));
  const discounts: DiscountRow[] = (c?.discounts ?? []).map((x) => ({
    id: x.id,
    what: discountWhat(x),
    value: discountValue(x),
    duration: duration(x),
    reason: x.reason,
    by: t('exceptions.by', { name: x.by, date: dates.day(new Date(x.createdAt)) }),
  }));
  const meta = sub
    ? sub.planName
      ? `${sub.planName} · v${sub.versionNumber}`
      : t('alaCarte')
    : t('noPlan');
  return {
    billing,
    note,
    usageTitle,
    usageItems,
    exceptions,
    discounts,
    meta,
    planTitle: sub?.planName ? `${sub.planName} · v${sub.versionNumber}` : undefined,
    apps: (c?.applications ?? []).filter(isApp),
    longDay,
    discountValue,
  };
}

export function useUsageAndExceptions({
  organizationId,
  c,
  phone,
  onAdd,
  onExtend,
  onEnded,
}: {
  organizationId: string;
  c: C | null;
  phone: boolean;
  onAdd: () => void;
  onExtend: (overrideId: string) => void;
  onEnded: (text: string) => void;
}) {
  const text = useCommercialText(c);
  const t = useTranslations('founder.business.exceptions');
  const [ending, setEnding] = useState<ExceptionRow | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return {
    usage: <BusinessUsageSection title={text.usageTitle} items={text.usageItems} />,
    exceptions: (
      <>
        <ExceptionsSection
          rows={text.exceptions}
          onAdd={onAdd}
          onExtend={(r) => onExtend(String(r.id))}
          onEnd={(r) => {
            setFailed(false);
            setEnding(r);
          }}
        />
        <DialogTrigger isOpen={!!ending} onOpenChange={(o) => !o && setEnding(null)}>
          {ending ? (
            <EndDiscountDialog
              title={t('endTitle', { what: ending.what })}
              body={t('endBody')}
              pending={pending}
              failed={failed}
              mob={phone}
              onCancel={() => setEnding(null)}
              onConfirm={async () => {
                setPending(true);
                const res = await endException(organizationId, String(ending.id));
                setPending(false);
                if (!res.ok) {
                  setFailed(true);
                  return;
                }
                setEnding(null);
                onEnded(t('endedToast'));
              }}
            />
          ) : (
            <></>
          )}
        </DialogTrigger>
      </>
    ),
  };
}

export function PlanCard({ c }: { c: C | null }) {
  const text = useCommercialText(c);
  if (!c?.subscription) return null;
  return (
    <PlanCardContent title={text.planTitle} rest={text.billing} note={text.note} apps={text.apps} />
  );
}

const EMPTY: DiscountFormValues = {
  scope: 'plan',
  lineId: '',
  kind: 'percent',
  value: '',
  duration: 'once',
  months: '',
  reason: '',
};

/** Tabul „Plăți și facturi”: abonamentul și reducerile (adaugă / editează / încheie). */
export function BillingTab({
  organizationId,
  business,
  c,
  onDone,
}: {
  organizationId: string;
  business: string;
  c: C | null;
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const t = useTranslations('founder.discounts');
  const b = useTranslations('founder.billing');
  const text = useCommercialText(c);
  const phone = useIsPhone();
  const [dialog, setDialog] = useState<{ editing?: string } | null>(null);
  const [values, setValues] = useState<DiscountFormValues>(EMPTY);
  const [errors, setErrors] = useState<DiscountFormErrors>({});
  const [ending, setEnding] = useState<DiscountRow | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sub = c?.subscription ?? null;
  const currency = c?.currency ?? 'RON';
  const lines = (c?.lines ?? []).map((l) => ({
    value: l.id,
    label: `${l.name} · ${money(l.amountMinor, currency)}`,
  }));

  function base(v: DiscountFormValues): number {
    if (v.scope === 'line') return c?.lines.find((l) => l.id === v.lineId)?.amountMinor ?? 0;
    return (
      c?.nextInvoice?.lines.find((l) => l.kind === 'plan')?.amountMinor ?? sub?.priceMinor ?? 0
    );
  }

  const preview = (() => {
    if (!c?.nextInvoice) return undefined;
    const full = base(values);
    const n = values.kind === 'percent' ? Number(values.value) : parseAmount(values.value);
    if (!n || n <= 0) return undefined;
    const off =
      values.kind === 'percent' ? Math.round((full * Math.min(n, 100)) / 100) : Math.min(n, full);
    const label =
      values.scope === 'plan'
        ? t('planLine', { plan: sub?.planName ?? '' })
        : (c.lines.find((l) => l.id === values.lineId)?.name ?? '');
    return {
      caption: t('dialog.preview', { date: text.longDay(c.nextInvoice.date) }),
      rows: [
        { label, amount: money(full, currency) },
        {
          label: t('discountLine', {
            value: values.kind === 'percent' ? `${n}%` : money(n, currency),
          }),
          amount: `−${money(off, currency)}`,
        },
      ],
      total: money(full - off, currency),
    };
  })();

  function openAdd() {
    setValues({ ...EMPTY, lineId: lines[0]?.value ?? '' });
    setErrors({});
    setFailed(false);
    setDialog({});
  }

  function openEdit(row: DiscountRow) {
    const x = c!.discounts.find((d) => d.id === row.id)!;
    setValues({
      scope: x.scope === 'subscription' ? 'plan' : 'line',
      lineId: x.lineId ?? '',
      kind: x.kind,
      value:
        x.kind === 'percent'
          ? String(x.percentOff)
          : money(x.amountOffMinor ?? 0, currency).replace(/ (lei|€)$/, ''),
      duration:
        x.duration === 'repeating' ? 'months' : x.duration === 'forever' ? 'permanent' : 'once',
      months: x.durationMonths ? String(x.durationMonths) : '',
      reason: x.reason,
    });
    setErrors({});
    setFailed(false);
    setDialog({ editing: x.id });
  }

  async function submit() {
    const e: DiscountFormErrors = {};
    let value: { kind: 'percent'; percentOff: number } | { kind: 'amount'; amountOffMinor: number };
    if (values.kind === 'percent') {
      const n = Number(values.value.trim());
      if (!Number.isInteger(n) || n < 1 || n > 100) e.value = t('error.percent');
      value = { kind: 'percent', percentOff: n };
    } else {
      const n = parseAmount(values.value);
      if (!n || n <= 0) e.value = t('error.amountInvalid');
      else if (values.scope === 'line' && n > base(values)) {
        e.value = t('error.amount', { amount: money(base(values), currency) });
      }
      value = { kind: 'amount', amountOffMinor: n ?? 0 };
    }
    const months = Number(values.months);
    if (values.duration === 'months' && (!Number.isInteger(months) || months < 1 || months > 120)) {
      e.months = t('error.months');
    }
    const reason = values.reason.trim();
    if (!reason) e.reason = t('error.reason');
    else if (reason.length < 10 || reason.length > 1000) e.reason = t('error.reasonLength');
    if (values.scope === 'line' && !values.lineId) e.lineId = t('error.reason');
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFailed(false);
    const line = c!.lines.find((l) => l.id === values.lineId);
    const res = dialog?.editing
      ? await editDiscount({ organizationId, discountId: dialog.editing, value: value!, reason })
      : await addDiscount({
          organizationId,
          target:
            values.scope === 'plan'
              ? { scope: 'subscription' }
              : { scope: line?.type === 'addon' ? 'addon' : 'application', lineId: values.lineId },
          value: value!,
          duration:
            values.duration === 'once'
              ? { duration: 'once' }
              : values.duration === 'permanent'
                ? { duration: 'forever' }
                : { duration: 'repeating', durationMonths: months },
          reason,
        });
    setPending(false);
    if (!res.ok) {
      if (res.field === 'reason') setErrors({ reason: t('error.reasonLength') });
      else if (res.field === 'percentOff') setErrors({ value: t('error.percent') });
      else setFailed(true);
      return;
    }
    setDialog(null);
    onDone(
      dialog?.editing
        ? t('updated')
        : t('added', { date: c?.nextInvoice ? text.longDay(c.nextInvoice.date) : '' }),
    );
    router.refresh();
  }

  async function end() {
    if (!ending) return;
    setPending(true);
    setFailed(false);
    const res = await finishDiscount(organizationId, String(ending.id));
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setEnding(null);
    onDone(t('endedNoDate'));
    router.refresh();
  }

  return (
    <>
      <BusinessBillingView
        plan={
          sub
            ? {
                strong: sub.planName
                  ? sub.interval === 'year'
                    ? b('annualStrong', { amount: money(sub.priceMinor, currency) })
                    : b('monthlyStrong', { amount: money(sub.priceMinor, currency) })
                  : text.billing,
                rest: b('renews', { date: text.longDay(sub.nextBillingDate) }),
                note: text.note,
              }
            : null
        }
        discounts={text.discounts}
        canAdd={!!sub}
        onAdd={openAdd}
        onEdit={openEdit}
        onEnd={(r) => {
          setFailed(false);
          setEnding(r);
        }}
      />
      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog ? (
          <DiscountDialog
            title={
              dialog.editing ? t('dialog.editTitle', { business }) : t('dialog.title', { business })
            }
            values={values}
            errors={errors}
            lines={lines}
            currency={{
              name: currency === 'EUR' ? 'euro' : 'lei',
              suffix: currency === 'EUR' ? '€' : 'lei',
            }}
            preview={preview}
            editing={!!dialog.editing}
            pending={pending}
            failed={failed}
            mob={phone}
            onChange={setValues}
            onCancel={() => setDialog(null)}
            onSubmit={() => void submit()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      <DialogTrigger isOpen={!!ending} onOpenChange={(o) => !o && setEnding(null)}>
        {ending ? (
          <EndDiscountDialog
            title={t('endDialog.title', { value: ending.value, business })}
            body={t('endDialog.bodyNoDate')}
            pending={pending}
            failed={failed}
            mob={phone}
            onCancel={() => setEnding(null)}
            onConfirm={() => void end()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
    </>
  );
}
