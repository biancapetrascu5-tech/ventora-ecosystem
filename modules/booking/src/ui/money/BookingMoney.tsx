'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  DatePicker,
  Dialog,
  FormField,
  Icon,
  Input,
  Notice,
  PageHeader,
  RadioGroup,
  Radio,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  Tabs,
  Textarea,
  Toggle,
  type DataTableColumn,
  type IconName,
} from '@ventora/ui';
import type { ReactNode } from 'react';
import type { ScreenMode } from '../services/BookingServicesView';
import { useTableLabels } from '../services/texts';
import { isoDay, pickerDay } from '../new/new-format';
import s from './money.module.css';

/* BookingMoney (B.21, S127) — the payments of an appointment, preview.html 1:1:
   - MoneyBlock: „Plată” in the detail: price, paid, „De încasat” (or „Achitat”) and „Istoricul
     plăților”, with „Rambursează…” on a row (booking:admin);
   - CollectDialog („Încasează”): the amount (a part is allowed), the method, the date, a note; the
     payment link (Stripe, B.22) only when the page passes the method;
   - RefundDialog: the amount (at most what was paid), card (Stripe) or cash, a required reason;
   - NoShowFeeDialog, FeesSection, ClientBalance: drawn in the gallery; their server is B.22
     (the fees) and a balance per client (not in a contract yet).
   Props only: the page and the gallery draw the same components. Plain Dialogs: the page puts them
   in its overlay; `framed` draws them inline (gallery). On a phone a dialog is a bottom sheet. */

export type MoneyMethod = 'cash' | 'card' | 'transfer' | 'link' | 'other';

export type MoneyHistoryRow = {
  id: string;
  /** „Avans · Card, online”, „Rest · Numerar” */
  what: string;
  /** „4 nov., 18:42” */
  when: string;
  /** „50 lei” (a refund: „−50 lei”) */
  amount: string;
  /** A payment that can still be refunded (not a refund itself). */
  refundable?: boolean;
};

export function MoneyBlock(p: {
  price: string;
  paid: string;
  /** What is still due; null = „Achitat” (✓); undefined = not known („de la” / interval). */
  due: string | null | undefined;
  history: MoneyHistoryRow[];
  /** booking:admin: „Rambursează…” on the payments. */
  onRefund?: (row: MoneyHistoryRow) => void;
}) {
  const t = useTranslations('booking.money');
  const labels = useTableLabels();
  const cells: [string, string, boolean][] = [
    [t('price'), p.price, false],
    [t('paid'), p.paid, false],
    p.due === null ? [t('settled'), '✓', false] : [t('due'), p.due ?? '—', p.due !== undefined],
  ];
  const columns: DataTableColumn<MoneyHistoryRow>[] = [
    { key: 'what', header: '', primary: true },
    { key: 'when', header: '', secondary: true },
    {
      key: 'amount',
      header: '',
      trailing: true,
      render: (r) => <span className={`v-num body-strong ${s.amount}`}>{r.amount}</span>,
    },
  ];
  return (
    <div className={s.stack}>
      <p className="subheading">{t('section')}</p>
      <dl className={s.sum}>
        {cells.map(([k, v, due]) => (
          <div key={k} className={due ? s.due : undefined}>
            <dt className="caption">{k}</dt>
            <dd className={`heading v-num ${s.amount}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.history.length > 0 && (
        <>
          <p className="subheading">{t('history')}</p>
          <DataTable
            caption={t('history')}
            columns={columns}
            rows={p.history}
            rowKey={(r) => r.id}
            labels={labels}
            rowActions={
              p.onRefund
                ? (r) =>
                    r.refundable
                      ? [{ label: t('refund'), icon: 'rotate-ccw', onClick: () => p.onRefund?.(r) }]
                      : []
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}

/** The pill next to the state: „De încasat · 300 lei” or „Achitat”. */
export function MoneyPill({ due }: { due: string | null }) {
  const t = useTranslations('booking.money');
  return due ? (
    <StatusPill tone="attention" icon="wallet">
      {`${t('due')} · ${due}`}
    </StatusPill>
  ) : (
    <StatusPill tone="done" icon="check">
      {t('settled')}
    </StatusPill>
  );
}

/** A line with an icon (preview.html Info / x-line). */
export function MoneyInfo({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <p className={`body-small ${s.line}`}>
      <Icon icon={icon} size={16} />
      {children}
    </p>
  );
}

type Common = { mode: ScreenMode; framed?: boolean; onClose?: () => void; busy?: boolean };
const common = (p: Common) => ({
  inline: p.framed,
  sheet: p.mode === 'mobile',
  onClose: p.onClose,
});

export function CollectDialog(
  p: Common & {
    client: string;
    /** „Vopsit rădăcină · 13 noiembrie, 12:00” */
    description: string;
    amount: string;
    onAmount?: (v: string) => void;
    /** „300 lei”: what is still due (the helper); null at „de la” / interval. */
    due: string | null;
    /** The currency's short name after the amount („lei”). */
    unit: string;
    method: MoneyMethod;
    methods: MoneyMethod[];
    onMethod?: (m: MoneyMethod) => void;
    /** „Data încasării” (B.21b): today by default, up to `min` back, never after today. */
    date?: { value: string; today: string; min?: string; onChange?: (date: string) => void };
    note: string;
    onNote?: (v: string) => void;
    error?: string | null;
    /** „Înregistrează 200 lei” */
    submitLabel: string;
    onSubmit?: () => void;
  },
) {
  const t = useTranslations('booking.money');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const link = p.method === 'link';
  return (
    <Dialog
      {...common(p)}
      title={t('collectTitle', { name: p.client })}
      description={p.description}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {ui('cancel')}
          </Button>
          <Button
            variant="primary"
            icon={link ? 'send' : 'check'}
            onPress={p.onSubmit}
            isPending={p.busy}
          >
            {link ? t('submitLink') : p.submitLabel}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <div className={s.grid2}>
          <FormField
            label={t('amount')}
            required
            hint={p.error ? undefined : p.due ? t('amountHelp', { due: p.due }) : undefined}
            error={p.error ?? undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              value={p.amount}
              onChange={(e) => p.onAmount?.(e.target.value)}
              isInvalid={!!p.error}
              suffix={<span className="body-small muted">{p.unit}</span>}
            />
          </FormField>
          <FormField label={t('method')} required>
            <Select
              value={p.method}
              onChange={(v) => p.onMethod?.(v as MoneyMethod)}
              options={p.methods.map((m) => ({ value: m, label: t(`m.${m}`) }))}
            />
          </FormField>
        </div>
        {link ? (
          <MoneyInfo icon="mail">{t('linkHelp')}</MoneyInfo>
        ) : p.date ? (
          <FormField label={t('date')}>
            <DatePicker
              value={pickerDay(p.date.value)}
              today={pickerDay(p.date.today)}
              min={pickerDay(p.date.min ?? null)}
              max={pickerDay(p.date.today)}
              locale={locale}
              onChange={(v) => v instanceof Date && p.date?.onChange?.(isoDay(v))}
            />
          </FormField>
        ) : null}
        <FormField label={t('note')} isOptional optionalLabel={ui('optional')}>
          <Input value={p.note} onChange={(e) => p.onNote?.(e.target.value)} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function RefundDialog(
  p: Common & {
    client: string;
    /** „Avans din 4 nov. · 50 lei · Card, online” */
    what: string;
    amount: string;
    onAmount?: (v: string) => void;
    /** „50 lei”: at most what was paid. */
    max: string;
    unit: string;
    /** card: back through Stripe (B.22, with the last 4 digits); otherwise the salon gives it back. */
    card?: { last4: string } | null;
    reason: string;
    onReason?: (v: string) => void;
    error?: { field: 'amount' | 'reason'; text: string } | null;
    /** „Rambursează 50 lei” */
    submitLabel: string;
    onSubmit?: () => void;
  },
) {
  const t = useTranslations('booking.money');
  const ui = useTranslations('ui');
  return (
    <Dialog
      {...common(p)}
      tone="danger"
      title={t('refundTitle', { name: p.client })}
      description={p.what}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {ui('cancel')}
          </Button>
          <Button variant="danger" icon="rotate-ccw" onPress={p.onSubmit} isPending={p.busy}>
            {p.submitLabel}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <div className={s.narrow}>
          <FormField
            label={t('refundAmount')}
            required
            hint={p.error?.field === 'amount' ? undefined : t('refundAmountHelp', { max: p.max })}
            error={p.error?.field === 'amount' ? p.error.text : undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              value={p.amount}
              onChange={(e) => p.onAmount?.(e.target.value)}
              isInvalid={p.error?.field === 'amount'}
              suffix={<span className="body-small muted">{p.unit}</span>}
            />
          </FormField>
        </div>
        <MoneyInfo icon={p.card ? 'credit-card' : 'banknote'}>
          {p.card ? t('refundCard', { last4: p.card.last4 }) : t('refundCash')}
        </MoneyInfo>
        <FormField
          label={t('refundReason')}
          required
          hint={p.error?.field === 'reason' ? undefined : t('refundReasonHelp')}
          error={p.error?.field === 'reason' ? p.error.text : undefined}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={p.reason}
            onChange={(e) => p.onReason?.(e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}

/** „Nu a venit”: keep the no-show fee (B.22, gallery). */
export function NoShowFeeDialog(
  p: Common & {
    client: string;
    fee: string;
    deposit: string;
    last4: string;
    /** „50 lei + 55 lei” */
    split: string;
    value: 'deposit' | 'balance' | 'none';
    onValue?: (v: 'deposit' | 'balance' | 'none') => void;
    onSubmit?: () => void;
  },
) {
  const t = useTranslations('booking.money');
  const ui = useTranslations('ui');
  return (
    <Dialog
      {...common(p)}
      title={t('noShowTitle', { name: p.client })}
      description={t('noShowFee', { amount: p.fee })}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {ui('cancel')}
          </Button>
          <Button variant="primary" icon="check" onPress={p.onSubmit} isPending={p.busy}>
            {p.value === 'none' ? t('noShowSubmitNone') : t('noShowSubmit', { amount: p.fee })}
          </Button>
        </>
      }
    >
      <RadioGroup
        label={t('noShowFrom')}
        value={p.value}
        onChange={(v) => p.onValue?.(v as 'deposit' | 'balance' | 'none')}
      >
        <Radio value="deposit" description={p.split}>
          {t('from.deposit', { deposit: p.deposit, last4: p.last4 })}
        </Radio>
        <Radio value="balance">{t('from.balance')}</Radio>
        <Radio value="none">{t('from.none')}</Radio>
      </RadioGroup>
    </Dialog>
  );
}

export type FeeRule = { on: boolean; kind: 'fixed' | 'percent'; amount: string };

/** Setări · „Plăți și avans”: the late-cancellation and no-show fees (B.22, gallery). */
export function FeesSection(p: {
  hours: number;
  late: FeeRule;
  noShow: FeeRule;
  card: boolean;
  unit: string;
}) {
  const t = useTranslations('booking.money');
  const rule = (r: FeeRule) => (
    <div className={`${s.grid2} ${s.indent}`}>
      <FormField label={t('fees.kind')}>
        <Select
          value={r.kind}
          options={[
            { value: 'fixed', label: t('fees.fixed') },
            { value: 'percent', label: t('fees.percent') },
          ]}
        />
      </FormField>
      <FormField label={t('fees.amount')}>
        <Input
          type="number"
          defaultValue={r.amount}
          suffix={<span className="body-small muted">{r.kind === 'percent' ? '%' : p.unit}</span>}
        />
      </FormField>
    </div>
  );
  return (
    <Sheet>
      <SheetSection title={t('fees.title')} description={t('fees.lead')}>
        <div className={s.stack}>
          <Toggle isSelected={p.late.on} description={t('fees.lateHelp', { hours: p.hours })}>
            {t('fees.late')}
          </Toggle>
          {rule(p.late)}
          <Toggle isSelected={p.noShow.on} description={t('fees.noShowHelp')}>
            {t('fees.noShow')}
          </Toggle>
          {rule(p.noShow)}
          <Toggle isSelected={p.card} description={t('fees.cardHelp')}>
            {t('fees.card')}
          </Toggle>
          <MoneyInfo>{t('fees.ask')}</MoneyInfo>
          <MoneyInfo icon="lock">{t('fees.needStripe')}</MoneyInfo>
        </div>
      </SheetSection>
    </Sheet>
  );
}

export type ClientPaymentRow = {
  id: string;
  service: string;
  date: string;
  what: string;
  amount: string;
  /** „100 lei” still due on that appointment. */
  due?: string | null;
};

/** The client card with an outstanding balance and the „Încasări” tab (frame 8, gallery). */
export function ClientBalance(p: {
  mode: ScreenMode;
  name: string;
  /** „100 lei” */
  balance: string;
  /** „Vopsit rădăcină, 13 noiembrie” */
  from: string;
  bookings: number;
  /** The count on „Încasări” (all the movements, not only the rows shown). */
  payments?: number;
  rows: ClientPaymentRow[];
  onCollect?: () => void;
  onNew?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations('booking.money');
  const c = useTranslations('booking.client');
  const labels = useTableLabels();
  const mob = p.mode === 'mobile';
  const columns: DataTableColumn<ClientPaymentRow>[] = [
    { key: 'service', header: c('pay.service'), primary: true },
    { key: 'date', header: c('pay.date'), secondary: true, width: '100px' },
    {
      key: 'what',
      header: c('pay.what'),
      secondary: true,
      render: (r) => (
        <span className={s.row}>
          {r.what}
          {r.due && (
            <StatusPill tone="attention" icon="wallet">
              {`${t('due')} ${r.due}`}
            </StatusPill>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: c('pay.amount'),
      trailing: true,
      align: 'end',
      render: (r) => <span className={`v-num body-strong ${s.amount}`}>{r.amount}</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title={p.name}
        breadcrumbs={[{ label: c('breadcrumb'), onClick: p.onBack }]}
        meta={
          <StatusPill tone="attention" icon="wallet">
            {`${t('balance')} · ${p.balance}`}
          </StatusPill>
        }
        actions={
          <Button variant="primary" icon="plus" onPress={p.onNew}>
            {c('newBooking')}
          </Button>
        }
      />
      <div className={`${s.body} ${mob ? s.m : ''}`}>
        <div className={mob ? s.pad : undefined}>
          <Notice
            className={s.notice}
            tone="attention"
            icon="wallet"
            title={t('balanceTitle', { name: p.name, amount: p.balance })}
          >
            <div className={s.stack}>
              <p>{t('balanceBody', { what: p.from })}</p>
              <div>
                <Button size="sm" variant="secondary" icon="wallet" onPress={p.onCollect}>
                  {`${t('collect')} · ${p.balance}`}
                </Button>
              </div>
            </div>
          </Notice>
        </div>
        <div className={mob ? s.pad : undefined}>
          <Tabs
            label={c('title')}
            selectedKey="payments"
            items={[
              { id: 'bookings', label: c('pay.tabBookings'), count: p.bookings },
              { id: 'payments', label: c('pay.tabPayments'), count: p.payments ?? p.rows.length },
            ]}
          />
        </div>
        <Sheet>
          <SheetSection title={c('pay.tabPayments')} description={c('pay.lead')}>
            <DataTable
              caption={c('pay.tabPayments')}
              columns={columns}
              rows={p.rows}
              rowKey={(r) => r.id}
              labels={labels}
            />
          </SheetSection>
        </Sheet>
      </div>
    </>
  );
}
