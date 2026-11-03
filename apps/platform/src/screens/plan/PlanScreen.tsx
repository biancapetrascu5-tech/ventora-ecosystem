'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { APPS, APP_IDS, Notice, PageHeader, Toast, type AppName, type IconName } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import type { BillingRefusal } from '@/server/billing-actions';
import { requestPack, tellOwner, type PlanData } from '@/server/plan-actions';
import { CardDialog } from './CardDialog';
import { dayBefore, quotaSlug, useDays, useMoney } from './format';
import { LimitDialog } from './LimitDialog';
import { PlanView, type PlanHaveRow, type PlanMeter, type PlanPackRow } from './PlanView';
import { PurchaseDialog, type PurchaseTarget } from './PurchaseDialog';
import s from './plan.module.css';

/* Lotul 3.7 — HubAdminPlan din datele afacerii (S111 / S113 / S117). Fără Growth Engine (S111):
   fără GrowthSlot și fără recomandări; pachetul care rezolvă un consum de peste 80% urcă primul și
   spune cât s-a folosit. Prețurile, în moneda afacerii (D3-2). Doar owner-ul cumpără (D3-8);
   adminul anunță owner-ul. */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

const MEMBERS = 'platform.members';
const SMS = 'messaging.sms';
const STORAGE = 'documents.storage';
const ATTENTION = 0.8;

const PACK_ICONS: Record<string, IconName> = {
  [MEMBERS]: 'users',
  [SMS]: 'message-square',
  'messaging.email': 'mail',
  'marketing.campaigns': 'megaphone',
  'booking.appointments': 'calendar',
  [STORAGE]: 'folder',
};

type Toasted = { tone: 'done' | 'danger'; title: string; description?: string };

export function PlanScreen({ data }: { data: PlanData }) {
  const router = useRouter();
  const locale = useLocale();
  const phone = useIsPhone();
  const t = useTranslations('hub.plan');
  const pay = useTranslations('pay');
  const billing = useTranslations('billing');
  const have = useTranslations('billing.have');
  const seatsT = useTranslations('seats');
  const quota = useTranslations('quota');
  const catalogT = useTranslations('catalog');
  const meterT = useTranslations('usageMeter');
  const ui = useTranslations('ui');
  const days = useDays();
  const summary = data.summary;
  const money = useMoney(summary?.currency ?? data.catalog.currency);
  const [purchase, setPurchase] = useState<PurchaseTarget | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [limitKey, setLimitKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toasted | null>(null);

  if (!summary) {
    return (
      <>
        <PageHeader title={t('title')} description={phone ? undefined : t('lead')} />
        <Notice tone="neutral" icon="credit-card">
          {t('noSubscription')}
        </Notice>
      </>
    );
  }

  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const appName = (id: string) => (isApp(id) ? APPS[id]?.name : undefined) ?? id;
  const quotaLabel = (key: string) => {
    const k = `${quotaSlug(key)}.label`;
    return quota.has(k) ? quota(k) : key;
  };
  const usageOf = (key: string) => summary.quotas.find((q) => q.key === key);
  const failed = () => setToast({ tone: 'danger', title: t('sendFailed') });

  // ---- cumpărarea: direct cu cardul sau „Cere activare” (D3-7)
  const account = data.billing;
  const canPayByCard = !!account && !!account.card && !account.manualPayment;
  const buyable = (o: PlanData['offers'][number]) =>
    o.purchaseMode === 'direct' &&
    canPayByCard &&
    !(o.validity === 'monthly' && summary.interval !== 'month');
  const validity = (o: PlanData['offers'][number]) =>
    o.validity === 'monthly'
      ? t('perMonth')
      : billing('packs.validUntil', { date: days.long(dayBefore(summary.quotaPeriod.end)) });

  function openPack(o: PlanData['offers'][number]) {
    const u = usageOf(o.quotaKey);
    setPurchase({
      kind: 'addon',
      addonId: o.id,
      name: o.name,
      description: validity(o),
      icon: PACK_ICONS[o.quotaKey] ?? 'package',
      priceMinor: o.priceMinor,
      usage: u
        ? {
            label: quotaLabel(o.quotaKey),
            used: u.used,
            limit: u.limit,
            unit: o.quotaKey === STORAGE ? 'GB' : undefined,
            perPack: o.quantity,
          }
        : undefined,
    });
  }

  async function askForPack(id: string) {
    setBusy(id);
    const res = await requestPack(id);
    setBusy(null);
    if (!res.ok) return failed();
    setToast({
      tone: 'done',
      title: catalogT('app.requestSent'),
      description: t('requestSentBody'),
    });
  }

  async function tell(kind: 'addon' | 'quota', id: string) {
    setBusy(`${kind}:${id}`);
    const res = await tellOwner(kind, id);
    setBusy(null);
    if (!res.ok) {
      failed();
      return false;
    }
    setToast({ tone: 'done', title: pay('recommendSent', { who: data.ownerName ?? '' }) });
    return true;
  }

  function onRefused(reason: BillingRefusal) {
    const p = purchase;
    setPurchase(null);
    if (p?.kind === 'addon' && reason !== 'already_active' && reason !== 'not_available') {
      void askForPack(p.addonId);
    } else {
      failed();
    }
  }

  // ---- „Ce plătești” (S117): linia, reducerile ei, locurile, pachetele, totalul (D3-21)
  const invoice = summary.nextInvoice;
  const alaCarte = new Set(data.catalog.current.lines.map((l) => l.applicationId));
  const bundleApps = summary.applications.filter((a) => !alaCarte.has(a));
  const discountRows = (lineId: string | null) =>
    invoice.discounts
      .filter((d) => (lineId === null ? d.scope === 'subscription' : d.lineId === lineId))
      .map((d): PlanHaveRow => {
        const value =
          d.kind === 'percent' ? `${d.percentOff ?? 0}%` : money.minor(d.amountOffMinor ?? 0);
        const label = billing('plan.discountValue', { value });
        const when =
          d.duration === 'once'
            ? billing('plan.discount.once')
            : d.duration === 'forever'
              ? billing('plan.discount.permanent')
              : null;
        return {
          label: when ? `${label} · ${when}` : label,
          amount: money.minor(-d.appliedMinor),
          muted: true,
        };
      });
  const rows: PlanHaveRow[] = [];
  for (const line of invoice.lines) {
    if (line.kind === 'plan') {
      rows.push({
        label: have('bundle', { name: summary.planName ?? line.key }),
        sub: bundleApps.map(appName).join(', ') || undefined,
        amount: money.minor(line.amountMinor),
      });
    } else if (line.kind === 'application') {
      rows.push({
        label: have('app', { app: appName(line.key) }),
        amount: money.minor(line.amountMinor),
      });
    } else {
      const pack = data.packs.find((p) => p.grantId === line.lineId);
      rows.push({
        label: have('pack', { name: pack?.name ?? line.key }),
        amount: money.minor(line.amountMinor),
      });
    }
    // sub linia la care se aplică; reducerea pe tot abonamentul, sub bundle (HubPlanBilling)
    if (line.lineId) rows.push(...discountRows(line.lineId));
    else if (line.kind === 'plan') rows.push(...discountRows(null));
  }
  if (data.seats) {
    const sd = data.seats;
    rows.push({
      label: seatsT('count', { count: sd.total ?? sd.included + sd.bundle + sd.packs }),
      sub:
        sd.packs > 0
          ? seatsT('breakdownPack', { base: sd.included, bundle: sd.bundle, pack: sd.packs })
          : sd.bundle > 0
            ? seatsT('breakdown', { base: sd.included, bundle: sd.bundle })
            : seatsT('breakdownBase', { base: sd.included }),
      amount: have('included'),
      muted: true,
    });
  }
  if (!invoice.lines.some((l) => l.kind === 'addon')) {
    rows.push({ label: have('noPacks'), amount: '', muted: true });
  }
  if (!invoice.lines.some((l) => l.kind === 'plan')) rows.push(...discountRows(null));

  const total = money.minor(invoice.totalMinor);
  const status =
    summary.status === 'active'
      ? { label: t('status.active'), tone: 'done' as const }
      : summary.status === 'past_due'
        ? { label: t('status.past_due'), tone: 'attention' as const }
        : { label: t('status.trialing'), tone: 'neutral' as const };

  // ---- consumul: ce cere acțiune urcă primul (S111)
  const ratio = (q: { used: number; limit: number }) => (q.limit > 0 ? q.used / q.limit : 0);
  const quotas = [...summary.quotas].sort((a, b) => ratio(b) - ratio(a));
  const packFor = (key: string) =>
    data.offers.filter((o) => o.quotaKey === key).sort((a, b) => a.priceMinor - b.priceMinor);
  const meters: PlanMeter[] = quotas.map((q) => {
    const direct = packFor(q.key).find(buyable);
    const buyLabel =
      q.key === MEMBERS ? t('buySeats') : q.key === SMS ? t('buySms') : meterT('buyMore');
    return {
      key: q.key,
      label: quotaLabel(q.key),
      used: q.used,
      limit: q.limit,
      unit: q.key === STORAGE ? 'GB' : undefined,
      ...(data.owner
        ? {
            onBuy: direct ? () => openPack(direct) : undefined,
            buyLabel,
            onUpgrade: () => setLimitKey(q.key),
          }
        : {
            owner: data.ownerName ?? undefined,
            onNotifyOwner: data.ownerName ? () => void tell('quota', q.key) : undefined,
          }),
    };
  });

  // ---- pachetele în plus: cel care rezolvă un consum peste 80% urcă primul
  const urgent = (o: PlanData['offers'][number]) => {
    const u = usageOf(o.quotaKey);
    return u ? ratio(u) >= ATTENTION : false;
  };
  const offers = [...data.offers].sort((a, b) => Number(urgent(b)) - Number(urgent(a)));
  const packRows: PlanPackRow[] = offers.map((o) => {
    const u = usageOf(o.quotaKey);
    const action: PlanPackRow['action'] = data.owner
      ? buyable(o)
        ? {
            label: t('buy', { price: money.minor(o.priceMinor) }),
            variant: 'secondary',
            onPress: () => openPack(o),
          }
        : {
            label: pay('requestActivation'),
            variant: 'quiet',
            pending: busy === o.id,
            onPress: () => void askForPack(o.id),
          }
      : data.ownerName
        ? {
            label: pay('notifyOwner'),
            variant: 'quiet',
            pending: busy === `addon:${o.id}`,
            onPress: () => void tell('addon', o.id),
          }
        : undefined;
    return {
      id: o.id,
      icon: PACK_ICONS[o.quotaKey] ?? 'package',
      name: o.name,
      price: `${money.minor(o.priceMinor)} · ${validity(o)}`,
      usageNote:
        u && urgent(o)
          ? billing('packs.usageNote', { used: num(u.used), limit: num(u.limit) })
          : undefined,
      onRequestOnly: o.purchaseMode !== 'direct',
      action,
    };
  });

  // ---- facturile: plățile; factura vine cu Lotul 3.6 („Factura se emite”)
  const invoiceRows = (data.payments ?? []).map((p) => ({
    id: p.id,
    number: '—',
    what:
      p.kind === 'subscription'
        ? t('forSubscription')
        : p.item?.kind === 'application'
          ? have('app', { app: appName(p.item.name) })
          : t('forPack', { name: p.item?.name ?? '' }),
    date: days.shortYear(p.paidAt),
    amount: money.minor(p.amountMinor),
    pending: p.invoice === null,
  }));

  const limitQuota = limitKey ? usageOf(limitKey) : undefined;
  const card = account?.card ?? null;

  return (
    <>
      <PlanView
        phone={phone}
        plan={{
          name: summary.planName
            ? have('bundle', { name: summary.planName })
            : catalogT('alaCarte.title'),
          status,
          pay:
            summary.interval === 'year'
              ? `${billing('plan.totalYear')}: ${total}`
              : billing('plan.payMonthly', { amount: total }),
          next: billing('plan.nextPayment', { date: days.longYear(summary.nextBillingDate) }),
          apps: summary.applications.filter(isApp),
          onUpgrade: data.owner ? () => router.push('/catalog') : undefined,
        }}
        annualNotice={
          summary.interval === 'year'
            ? billing('plan.annualLimits', { day: days.dayOfMonth(summary.startedOn) })
            : undefined
        }
        have={{
          rows,
          totalLabel: billing(summary.interval === 'year' ? 'plan.totalYear' : 'plan.total'),
          total,
          keep: summary.planName ? have('bundleKeep') : undefined,
        }}
        card={
          account
            ? {
                card: card
                  ? {
                      brand: card.brand,
                      last4: card.last4,
                      expiry: `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`,
                    }
                  : null,
                onChange: account.publishableKey ? () => setCardOpen(true) : undefined,
                onAdd: account.publishableKey ? () => setCardOpen(true) : undefined,
              }
            : undefined
        }
        usage={{
          title: billing('plan.usagePeriod', {
            from: days.short(summary.quotaPeriod.start),
            to: days.short(dayBefore(summary.quotaPeriod.end)),
          }),
          description: billing('plan.reset', { date: days.long(summary.quotaPeriod.end) }),
          meters,
        }}
        packs={{ rows: packRows }}
        invoices={
          data.payments ? { rows: invoiceRows, withDate: true, empty: t('noPayments') } : undefined
        }
      />

      {purchase && (
        <PurchaseDialog
          key={purchase.kind === 'addon' ? purchase.addonId : purchase.applicationId}
          target={purchase}
          currency={summary.currency}
          card={card}
          publishableKey={account?.publishableKey ?? null}
          onClose={() => setPurchase(null)}
          onRefused={onRefused}
          onUseOtherCard={
            account?.publishableKey
              ? () => {
                  setPurchase(null);
                  setCardOpen(true);
                }
              : undefined
          }
        />
      )}

      {account && cardOpen && (
        <CardDialog
          open={cardOpen}
          publishableKey={account.publishableKey}
          onOpenChange={setCardOpen}
          onSaved={(ok) => {
            if (ok) {
              setToast({ tone: 'done', title: t('cardSaved') });
              router.refresh();
            } else {
              setToast({ tone: 'danger', title: t('cardError') });
            }
          }}
        />
      )}

      <LimitDialog
        open={limitKey !== null}
        usage={
          limitQuota && limitKey
            ? {
                label: quotaLabel(limitKey),
                used: limitQuota.used,
                limit: limitQuota.limit,
                unit: limitKey === STORAGE ? 'GB' : undefined,
              }
            : null
        }
        packs={(limitKey ? packFor(limitKey) : []).map((o) => ({
          id: o.id,
          title: o.name,
          price: `${money.minor(o.priceMinor)} · ${validity(o)}`,
        }))}
        owner={data.owner}
        ownerName={data.ownerName}
        onBuy={(id) => {
          const o = data.offers.find((x) => x.id === id);
          setLimitKey(null);
          if (!o) return;
          if (buyable(o)) openPack(o);
          else void askForPack(o.id);
        }}
        onPlan={() => {
          setLimitKey(null);
          router.push('/catalog');
        }}
        onRecommend={() => (limitKey ? tell('quota', limitKey) : Promise.resolve(false))}
        onClose={() => setLimitKey(null)}
      />

      {toast && (
        <div className={s.toast}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.description}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </>
  );
}
