'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  CollectDialog,
  MoneyBlock,
  MoneyPill,
  RefundDialog,
  amountInput,
  checkCollect,
  minorOf,
  refundMax,
  useNewTexts,
  type MoneyHistoryRow,
  type MoneyMethod,
  type ScreenMode,
} from '@ventora/booking/ui';
import {
  readAppointmentMoney,
  recordPaymentAction,
  recordRefundAction,
  type MoneyActionError,
  type MoneyData,
  type PaymentRowData,
} from '@/server/booking-payments-actions';
import type { AppointmentDetailData } from '@/server/booking-appointments-actions';

/* Decision 7, screen 5 — BookingMoney (B.21) in the detail of „Programări”: „Plată” (price, paid,
   „De încasat” / „Achitat”, the history with „Rambursează…” for booking:admin), the pill next to
   the state, „Încasează” (cash, card at the location, transfer; a part is allowed) and the refund
   with its reason, „Data încasării” (B.21b: today by default, up to 30 days back). The payment
   link, the card refund through Stripe and the no-show fee are B.22 (gallery only). */

const METHODS: MoneyMethod[] = ['cash', 'card', 'transfer'];
/** B.21b (PAYMENT_DATE_LIMITS): „Data încasării” up to 30 days back. */
const PAYMENT_DAYS_BACK = 30;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type MoneyDialog =
  | {
      kind: 'collect';
      amount: string;
      method: MoneyMethod;
      note: string;
      paidOn: string;
      error: string | null;
    }
  | {
      kind: 'refund';
      payment: PaymentRowData;
      amount: string;
      reason: string;
      error: { field: 'amount' | 'reason'; text: string } | null;
    };

export function useAppointmentMoney(p: {
  mode: ScreenMode;
  onToast: (toast: { tone: 'done' | 'danger'; title: string }) => void;
  /** After a payment or a refund: read the appointment and the list again. */
  onChanged: () => void;
}) {
  const t = useTranslations('booking.money');
  const locale = useLocale();
  const nx = useNewTexts();
  const [money, setMoney] = useState<MoneyData | null>(null);
  const [dialog, setDialog] = useState<MoneyDialog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (appointmentId: string) =>
    readAppointmentMoney(appointmentId).then((r) => setMoney(r.ok ? r.data : null));
  const clear = () => {
    setMoney(null);
    setDialog(null);
  };

  const cur = money?.currency ?? 'RON';
  const fmt = (minor: number) => nx.money(minor, cur);
  const unit = nx.money(0, cur).replace('0', '').trim();
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  const method = (m: PaymentRowData['method']) => t(`m.${m}`);
  const errorText = (e: MoneyActionError) =>
    e === 'amount' ? t('err.amount') : e === 'date' ? t('err.date') : t('failed');

  /** What the drawer draws for this appointment (nothing while the payments are read). */
  const view = (detail: AppointmentDetailData, canWrite: boolean) => {
    if (!money || detail.row.status === 'cancelled' || money.fromPackage) {
      return { pill: null, block: null, collect: null };
    }
    const due =
      money.outstandingMinor === null
        ? undefined
        : money.outstandingMinor > 0
          ? fmt(money.outstandingMinor)
          : null;
    const history: MoneyHistoryRow[] = money.payments.map((x) => ({
      id: x.id,
      what:
        x.kind === 'refund'
          ? t('h.refund', { method: method(x.method) })
          : t('h.rest', { method: method(x.method) }),
      // the day of the payment (B.21b); the time only when it was recorded that day
      when: x.paidOn === x.date ? `${day(x.paidOn)}, ${x.time}` : day(x.paidOn),
      amount: x.kind === 'refund' ? `−${fmt(x.amountMinor)}` : fmt(x.amountMinor),
      refundable: x.kind === 'payment' && x.amountMinor - x.refundedMinor > 0,
    }));
    const started = ['in_progress', 'completed', 'no_show'].includes(detail.row.status);
    const price =
      money.priceKind === 'fixed'
        ? fmt(money.priceMinor)
        : t('priceFrom', { amount: fmt(money.priceMinor) });
    const canCollect = canWrite && due !== null;
    return {
      pill: started && due !== undefined ? <MoneyPill due={due} /> : null,
      block: (
        <MoneyBlock
          price={price}
          paid={fmt(money.netMinor)}
          due={due}
          history={history}
          onRefund={
            money.canRefund
              ? (row) => {
                  const pay = money.payments.find((x) => x.id === row.id);
                  if (pay)
                    setDialog({
                      kind: 'refund',
                      payment: pay,
                      amount: amountInput(refundMax(pay, money.netMinor)),
                      reason: '',
                      error: null,
                    });
                }
              : undefined
          }
        />
      ),
      collect: canCollect
        ? {
            label: due ? `${t('collect')} · ${due}` : t('collect'),
            open: () =>
              setDialog({
                kind: 'collect',
                amount:
                  money.outstandingMinor && money.outstandingMinor > 0
                    ? amountInput(money.outstandingMinor)
                    : '',
                method: 'cash',
                note: '',
                paidOn: money.today,
                error: null,
              }),
          }
        : null,
    };
  };

  const dialogs = (detail: AppointmentDetailData) => {
    if (!money) return null;
    const r = detail.row;
    const description = `${r.service} · ${new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${r.date}T12:00:00Z`))}, ${r.start}`;
    const collect = async (d: Extract<MoneyDialog, { kind: 'collect' }>) => {
      const due = money.outstandingMinor;
      const c = checkCollect(d.amount, due);
      if (!c.ok)
        return setDialog({
          ...d,
          error: c.error === 'amount' ? t('err.amount') : t('err.max', { max: fmt(due ?? 0) }),
        });
      const minor = c.minor;
      setBusy(true);
      const x = await recordPaymentAction({
        appointmentId: r.id,
        amountMinor: minor,
        method: d.method as 'cash' | 'card' | 'transfer',
        note: d.note,
        paidOn: d.paidOn,
      });
      setBusy(false);
      if (!x.ok) return setDialog({ ...d, error: errorText(x.error) });
      setDialog(null);
      const left = due === null ? null : due - minor;
      p.onToast({
        tone: 'done',
        title:
          left !== null && left > 0
            ? t('collected', { amount: fmt(minor), due: fmt(left) })
            : t('collectedAll', { amount: fmt(minor) }),
      });
      void load(r.id);
      p.onChanged();
    };
    const refund = async (d: Extract<MoneyDialog, { kind: 'refund' }>) => {
      const minor = minorOf(d.amount);
      const max = refundMax(d.payment, money.netMinor);
      if (!minor || minor < 1)
        return setDialog({ ...d, error: { field: 'amount', text: t('err.amount') } });
      if (minor > max)
        return setDialog({
          ...d,
          error: { field: 'amount', text: t('err.max', { max: fmt(max) }) },
        });
      if (!d.reason.trim())
        return setDialog({ ...d, error: { field: 'reason', text: t('err.reason') } });
      setBusy(true);
      const x = await recordRefundAction({
        appointmentId: r.id,
        paymentId: d.payment.id,
        amountMinor: minor,
        method: d.payment.method,
        reason: d.reason,
      });
      setBusy(false);
      if (!x.ok) {
        return setDialog({
          ...d,
          error: {
            field: 'amount',
            text: x.error === 'exceeds' ? t('err.max', { max: fmt(max) }) : t('refundFailed'),
          },
        });
      }
      setDialog(null);
      p.onToast({ tone: 'done', title: t('refunded', { amount: fmt(minor) }) });
      void load(r.id);
      p.onChanged();
    };
    const amountNow = dialog?.kind === 'collect' ? minorOf(dialog.amount) : null;
    const refundNow = dialog?.kind === 'refund' ? minorOf(dialog.amount) : null;
    return (
      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <>
          {dialog?.kind === 'collect' && (
            <CollectDialog
              mode={p.mode}
              client={r.client}
              description={description}
              amount={dialog.amount}
              onAmount={(amount) => setDialog({ ...dialog, amount, error: null })}
              due={
                money.outstandingMinor && money.outstandingMinor > 0
                  ? fmt(money.outstandingMinor)
                  : null
              }
              unit={unit}
              method={dialog.method}
              methods={METHODS}
              onMethod={(m) => setDialog({ ...dialog, method: m })}
              note={dialog.note}
              onNote={(note) => setDialog({ ...dialog, note })}
              date={{
                value: dialog.paidOn,
                today: money.today,
                min: addDays(money.today, -PAYMENT_DAYS_BACK),
                onChange: (paidOn) => setDialog({ ...dialog, paidOn, error: null }),
              }}
              error={dialog.error}
              submitLabel={t('submit', { amount: amountNow ? fmt(amountNow) : fmt(0) })}
              busy={busy}
              onClose={() => setDialog(null)}
              onSubmit={() => void collect(dialog)}
            />
          )}
          {dialog?.kind === 'refund' && (
            <RefundDialog
              mode={p.mode}
              client={r.client}
              what={t('refundWhat', {
                kind: t('kind.rest'),
                date: day(dialog.payment.date),
                amount: fmt(dialog.payment.amountMinor),
                method: method(dialog.payment.method),
              })}
              amount={dialog.amount}
              onAmount={(amount) => setDialog({ ...dialog, amount, error: null })}
              max={fmt(refundMax(dialog.payment, money.netMinor))}
              unit={unit}
              card={null}
              reason={dialog.reason}
              onReason={(reason) => setDialog({ ...dialog, reason, error: null })}
              error={dialog.error}
              submitLabel={t('refundSubmit', { amount: refundNow ? fmt(refundNow) : fmt(0) })}
              busy={busy}
              onClose={() => setDialog(null)}
              onSubmit={() => void refund(dialog)}
            />
          )}
        </>
      </DialogTrigger>
    );
  };

  return { money, load, clear, view, dialogs };
}
