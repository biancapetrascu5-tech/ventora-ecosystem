'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Notice,
  PageHeader,
  Radio,
  RadioGroup,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  Textarea,
  type DataTableColumn,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import styles from '../business.module.css';
import s from './commercial.module.css';

/* FounderDiscounts (Lotul 3.4, S113, doar română): reducerile unei afaceri, în tabul „Plăți și
   facturi” (FounderBusinessBilling) — pe tot abonamentul sau pe o linie, procent sau sumă fixă în
   moneda afacerii, o dată / N luni / permanent, cu motiv; „Încheie reducerea”. Pagina „Reduceri”
   din Spine: toate reducerile permanente („Toate active” arată și pe cele temporare). Istoricul
   cumpărărilor, rambursarea și confirmarea transferului (FounderBusinessBilling) se leagă în
   loturile 3.5 / 3.6 / 3.8: aici e doar locul lor (`history`). */

export type DiscountRow = {
  id: string | number;
  /** „Tot abonamentul”, „CampaignKit · aplicație adăugată” */
  what: string;
  /** „15%”, „20 lei” */
  value: string;
  /** „5 luni, până pe 31 mar. 2027”, „Permanentă”, „O singură dată” */
  duration: string;
  reason: string;
  /** „Bianca Petrașcu · 1 mar.” */
  by: string;
};

/** Tabul „Plăți și facturi”: abonamentul (cum plătește) și reducerile active. */
export function BusinessBillingView({
  plan,
  discounts,
  canAdd,
  onAdd,
  onEdit,
  onEnd,
  history,
  phone: phoneProp,
}: {
  /** „Plătește lunar: 349 lei” · „se reînnoiește pe 17 noiembrie” / nota de sub. */
  plan: { strong: string; rest?: string; note?: string } | null;
  discounts: DiscountRow[];
  /** Fără abonament nu se poate adăuga o reducere. */
  canAdd: boolean;
  onAdd: () => void;
  onEdit: (row: DiscountRow) => void;
  onEnd: (row: DiscountRow) => void;
  /** Istoricul cumpărărilor (3.5 / 3.6 / 3.8). */
  history?: ReactNode;
  phone?: boolean;
}) {
  const t = useTranslations('founder.discounts');
  const b = useTranslations('founder.billing');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<DiscountRow>[] = [
    { key: 'what', header: t('col.what'), primary: true },
    {
      key: 'value',
      header: t('col.value'),
      secondary: true,
      render: (r) => <span className="body-strong v-num">{r.value}</span>,
    },
    { key: 'duration', header: t('col.duration'), secondary: true },
    { key: 'reason', header: t('col.reason'), optional: true, muted: true },
    { key: 'by', header: t('col.by'), optional: true, muted: true },
  ];
  return (
    <div className={styles.axb}>
      <Sheet>
        <SheetSection title={b('planTitle')}>
          {plan ? (
            <>
              <p className="body">
                <span className="body-strong">{plan.strong}</span>
                {plan.rest ? ` · ${plan.rest}` : ''}
              </p>
              {plan.note && <p className="body-small muted">{plan.note}</p>}
            </>
          ) : (
            <p className="body muted">{b('noPlan')}</p>
          )}
        </SheetSection>
        <SheetSection
          title={t('section')}
          description={t('sectionLead')}
          actions={
            canAdd ? (
              <Button icon="plus" size={phone ? 'sm' : undefined} onPress={onAdd}>
                {t('add')}
              </Button>
            ) : undefined
          }
        >
          {discounts.length ? (
            <DataTable
              caption={t('section')}
              columns={columns}
              rows={discounts}
              rowActions={(r) => [
                { label: t('edit'), icon: 'pencil', onClick: () => onEdit(r) },
                { separator: true },
                { label: t('end'), icon: 'x', destructive: true, onClick: () => onEnd(r) },
              ]}
              labels={labels}
              locale="ro"
            />
          ) : (
            <p className="body muted">{t('empty')}</p>
          )}
        </SheetSection>
      </Sheet>
      {history}
    </div>
  );
}

export type ForeverDiscountRow = {
  id: string | number;
  business: string;
  what: string;
  value: string;
  /** „12 oct. 2026” */
  since: string;
  reason: string;
  by: string;
};

/** „Reduceri” (Spine, sub „Model comercial”): toate reducerile permanente, din toate afacerile. */
export function DiscountsPageView({
  rows,
  filter,
  onFilterChange,
  permanentCount,
  onOpen,
  onEnd,
  phone: phoneProp,
}: {
  rows: ForeverDiscountRow[];
  filter: 'permanent' | 'active';
  onFilterChange: (f: 'permanent' | 'active') => void;
  permanentCount: number;
  onOpen: (row: ForeverDiscountRow) => void;
  onEnd: (row: ForeverDiscountRow) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.discounts');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<ForeverDiscountRow>[] = [
    { key: 'business', header: t('col.business'), primary: true },
    { key: 'what', header: t('col.what'), secondary: true },
    {
      key: 'value',
      header: t('col.value'),
      secondary: true,
      render: (r) => <span className="body-strong v-num">{r.value}</span>,
    },
    { key: 'since', header: t('col.since'), optional: true },
    { key: 'reason', header: t('col.reason'), optional: true, muted: true },
    { key: 'by', header: t('col.by'), optional: true, muted: true },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : t('lead')} />
      <div className={styles.axb}>
        <div className={s.stack}>
          <div>
            <SegmentedControl
              aria-label={t('filterLabel')}
              value={filter}
              onChange={(v) => onFilterChange(v as 'permanent' | 'active')}
              options={[
                {
                  value: 'permanent',
                  label: permanentCount
                    ? `${t('filterPermanent')} · ${permanentCount}`
                    : t('filterPermanent'),
                },
                { value: 'active', label: t('filterActive') },
              ]}
            />
          </div>
          {rows.length ? (
            <DataTable
              caption={t('title')}
              columns={columns}
              rows={rows}
              rowActions={(r) => [
                { label: t('open'), icon: 'building-2', onClick: () => onOpen(r) },
                { separator: true },
                { label: t('end'), icon: 'x', destructive: true, onClick: () => onEnd(r) },
              ]}
              labels={labels}
              locale="ro"
            />
          ) : (
            <EmptyState
              icon="percent"
              title={t('empty')}
              description={filter === 'permanent' ? t('emptyPermanent') : undefined}
            />
          )}
        </div>
      </div>
    </>
  );
}

export type DiscountFormValues = {
  scope: 'plan' | 'line';
  lineId: string;
  kind: 'percent' | 'amount';
  value: string;
  duration: 'once' | 'months' | 'permanent';
  months: string;
  reason: string;
};

export type DiscountFormErrors = Partial<Record<'value' | 'months' | 'reason' | 'lineId', string>>;

/**
 * „Adaugă o reducere pentru {business}” (S113). La editare („Editează”, fără design propriu) se
 * schimbă doar valoarea și motivul: ținta, felul și durata rămân (D3-21, contractul updateDiscount).
 */
export function DiscountDialog({
  title,
  values,
  errors = {},
  lines,
  currency,
  preview,
  editing,
  pending,
  failed,
  mob,
  inline,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  values: DiscountFormValues;
  errors?: DiscountFormErrors;
  /** Liniile: o aplicație adăugată, un pachet lunar („5 locuri în echipă în plus · 60 lei pe lună”). */
  lines: { value: string; label: string }[];
  /** „lei” / „euro” */
  currency: { name: string; suffix: string };
  /** Următoarea factură: „Următoarea factură, pe {date}” și rândurile ei; fără, nu apare. */
  preview?: { caption: string; rows: { label: string; amount: string }[]; total: string };
  editing?: boolean;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onChange: (v: DiscountFormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('founder.discounts.dialog');
  const e = useTranslations('founder.discounts');
  const ui = useTranslations('ui');
  const set = (patch: Partial<DiscountFormValues>) => onChange({ ...values, ...patch });
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={title}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            icon={editing ? undefined : 'plus'}
            isPending={pending}
            onPress={onSubmit}
          >
            {editing ? t('save') : t('submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        <RadioGroup
          label={t('scope')}
          value={values.scope}
          isDisabled={editing}
          onChange={(v) => set({ scope: v as DiscountFormValues['scope'] })}
        >
          <Radio value="plan" description={t('scopePlanDesc')}>
            {t('scopePlan')}
          </Radio>
          <Radio value="line" description={t('scopeLineDesc')} isDisabled={!lines.length}>
            {t('scopeLine')}
          </Radio>
        </RadioGroup>
        {values.scope === 'line' && (
          <FormField label={t('line')} isRequired error={errors.lineId}>
            <Select
              value={values.lineId}
              options={lines}
              isDisabled={editing}
              onChange={(v) => set({ lineId: v })}
            />
          </FormField>
        )}
        <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
          <FormField label={t('kind')}>
            <SegmentedControl
              aria-label={t('kind')}
              value={values.kind}
              isDisabled={editing}
              onChange={(v) => set({ kind: v as DiscountFormValues['kind'] })}
              options={[
                { value: 'percent', label: t('kindPercent') },
                { value: 'amount', label: t('kindAmount') },
              ]}
            />
          </FormField>
          <FormField
            label={t('value')}
            isRequired
            hint={
              errors.value
                ? undefined
                : values.kind === 'percent'
                  ? t('percentHelp')
                  : t('amountHelp', { currency: currency.name })
            }
            error={errors.value}
          >
            <Input
              value={values.value}
              suffix={values.kind === 'percent' ? '%' : currency.suffix}
              inputMode="decimal"
              isInvalid={!!errors.value}
              onChange={(ev) => set({ value: ev.target.value })}
            />
          </FormField>
        </div>
        {values.kind === 'percent' && values.value.trim() === '100' && (
          <Notice tone="neutral" icon="info">
            {t('free')}
          </Notice>
        )}
        <RadioGroup
          label={t('duration')}
          value={values.duration}
          isDisabled={editing}
          onChange={(v) => set({ duration: v as DiscountFormValues['duration'] })}
        >
          <Radio value="once" description={t('durationOnceDesc')}>
            {t('durationOnce')}
          </Radio>
          <Radio value="months">{t('durationMonths')}</Radio>
          <Radio value="permanent" description={t('durationPermanentDesc')}>
            {t('durationPermanent')}
          </Radio>
        </RadioGroup>
        {values.duration === 'months' && (
          <FormField label={t('monthsLabel')} isRequired error={errors.months}>
            <Input
              className={s.narrow}
              value={values.months}
              inputMode="numeric"
              disabled={editing}
              isInvalid={!!errors.months}
              onChange={(ev) => set({ months: ev.target.value })}
            />
          </FormField>
        )}
        <FormField
          label={t('reason')}
          isRequired
          hint={errors.reason ? undefined : t('reasonHelp')}
          error={errors.reason}
        >
          <Textarea
            rows={2}
            value={values.reason}
            isInvalid={!!errors.reason}
            onChange={(ev) => set({ reason: ev.target.value })}
          />
        </FormField>
        {preview && (
          <div className={s.invoice}>
            <p className="caption muted">{preview.caption}</p>
            {preview.rows.map((r) => (
              <div key={r.label} className={s.invoiceLine}>
                <span className="body">{r.label}</span>
                <span className="body v-num">{r.amount}</span>
              </div>
            ))}
            <div className={s.invoiceTotal}>
              <span className="body-strong">{e('total')}</span>
              <span className="body-strong v-num">{preview.total}</span>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** „Închei reducerea de {value} pentru {business}?” */
export function EndDiscountDialog({
  title,
  body,
  pending,
  failed,
  mob,
  inline,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.discounts');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      tone="danger"
      title={title}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('dialog.cancel')}
          </Button>
          <Button variant="danger" icon="x" isPending={pending} onPress={onConfirm}>
            {t('endDialog.submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed && <Notice tone="danger">{t('dialog.error')}</Notice>}
        <p className="body">{body}</p>
      </div>
    </Dialog>
  );
}
