'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  FormField,
  Input,
  Notice,
  PageHeader,
  Radio,
  RadioGroup,
  Select,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import s from './commercial.module.css';

/* FounderPacks (Lotul 3.4, S113, doar română): „Pachete în plus” — singurul loc pentru prețurile
   pachetelor: prețul în lei și în euro, cum se plătește, implementarea, planurile, cumpărarea
   directă sau la cerere. Vedere fără logică: rândurile vin gata scrise din ecran (sau din
   galerie, cu exemplele din preview). */

export type PackRow = {
  id: string | number;
  name: string;
  /** „49 lei · 10 €” */
  price: string;
  /** „o dată, perioada în curs” / „lunar, cu abonamentul” */
  period: string;
  /** „150 lei · 30 €” sau „Fără” */
  setup: string;
  /** „Toate”, „Start, Business” */
  plans: string;
  direct: boolean;
  /** „Oprește vânzarea” s-a apăsat: rândul nu mai are acțiunea. */
  stopped?: boolean;
};

export function PacksView({
  rows,
  onNew,
  onEdit,
  onStop,
  phone: phoneProp,
}: {
  rows: PackRow[];
  onNew: () => void;
  onEdit: (row: PackRow) => void;
  onStop: (row: PackRow) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.packs');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<PackRow>[] = [
    { key: 'name', header: t('col.pack'), primary: true },
    {
      key: 'price',
      header: t('col.price'),
      secondary: true,
      render: (r) => <span className="v-num">{r.price}</span>,
    },
    { key: 'period', header: t('col.period'), secondary: true },
    { key: 'setup', header: t('col.setup'), optional: true },
    { key: 'plans', header: t('col.plans'), optional: true, muted: true },
    {
      key: 'how',
      header: t('col.purchase'),
      trailing: true,
      render: (r) =>
        r.stopped ? (
          <StatusPill tone="neutral" icon="lock">
            {t('stopped')}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" icon={r.direct ? 'credit-card' : 'users'}>
            {r.direct ? t('direct') : t('onRequest')}
          </StatusPill>
        ),
    },
  ];
  const actions = (r: PackRow): DataTableAction[] => [
    { label: t('editAction'), icon: 'pencil', onClick: () => onEdit(r) },
    ...(r.stopped ? [] : [{ label: t('stop'), icon: 'lock' as const, onClick: () => onStop(r) }]),
  ];
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
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowActions={actions}
        labels={labels}
        locale="ro"
      />
    </>
  );
}

export type PackFormValues = {
  name: string;
  quotaKey: string;
  quantity: string;
  priceLei: string;
  priceEur: string;
  setupLei: string;
  setupEur: string;
  validity: 'current_month' | 'monthly';
  purchaseMode: 'direct' | 'on_request';
};

export type PackFormErrors = Partial<Record<keyof PackFormValues, string>>;

/**
 * „Editează „{name}”” (S113) și „Pachet nou”: prețul în lei și în euro, implementarea, cum se
 * plătește; la un pachet nou și resursa, cantitatea; „Cumpărare” (direct / la cerere, D3-7) —
 * blocată pe „la cerere” când există cost de implementare (D3-23). Câmpurile pachetului nou și
 * comutatorul nu au design propriu: sunt compuse din textele aprobate (raportul 3.4).
 */
export function PackDialog({
  mode,
  title,
  values,
  errors = {},
  resources,
  pending,
  failed,
  mob,
  inline,
  onChange,
  onCancel,
  onSave,
}: {
  mode: 'edit' | 'new';
  title: string;
  values: PackFormValues;
  errors?: PackFormErrors;
  /** Resursele (cotele) pentru un pachet nou: valoare = cheia, eticheta = „SMS-uri”. */
  resources?: { value: string; label: string }[];
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onChange: (v: PackFormValues) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations('founder.packs.edit');
  const ed = useTranslations('founder.editor.price');
  const ui = useTranslations('ui');
  const set = (patch: Partial<PackFormValues>) => onChange({ ...values, ...patch });
  const hasSetup = [values.setupLei, values.setupEur].some((v) => v.trim() && v.trim() !== '0');
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
          <Button variant="primary" isPending={pending} onPress={onSave}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        {mode === 'new' && (
          <>
            <FormField label={t('name')} isRequired error={errors.name}>
              <Input
                value={values.name}
                isInvalid={!!errors.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </FormField>
            <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
              <FormField label={t('resource')} isRequired error={errors.quotaKey}>
                <Select
                  value={values.quotaKey}
                  onChange={(v) => set({ quotaKey: v })}
                  options={resources ?? []}
                  isInvalid={!!errors.quotaKey}
                />
              </FormField>
              <FormField label={t('quantity')} isRequired error={errors.quantity}>
                <Input
                  value={values.quantity}
                  inputMode="numeric"
                  isInvalid={!!errors.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                />
              </FormField>
            </div>
          </>
        )}
        <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
          <FormField label={t('priceLei')} isRequired error={errors.priceLei}>
            <Input
              value={values.priceLei}
              suffix="lei"
              inputMode="decimal"
              isInvalid={!!errors.priceLei}
              onChange={(e) => set({ priceLei: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('priceEur')}
            isRequired
            hint={errors.priceEur ? undefined : t('priceHelp')}
            error={errors.priceEur}
          >
            <Input
              value={values.priceEur}
              suffix="€"
              inputMode="decimal"
              isInvalid={!!errors.priceEur}
              onChange={(e) => set({ priceEur: e.target.value })}
            />
          </FormField>
          <FormField label={ed('setupLei')} error={errors.setupLei}>
            <Input
              value={values.setupLei}
              suffix="lei"
              inputMode="decimal"
              isInvalid={!!errors.setupLei}
              onChange={(e) => set({ setupLei: e.target.value })}
            />
          </FormField>
          <FormField label={ed('setupEur')} error={errors.setupEur}>
            <Input
              value={values.setupEur}
              suffix="€"
              inputMode="decimal"
              isInvalid={!!errors.setupEur}
              onChange={(e) => set({ setupEur: e.target.value })}
            />
          </FormField>
        </div>
        <RadioGroup
          label={t('period')}
          value={values.validity}
          onChange={(v) => set({ validity: v as PackFormValues['validity'] })}
        >
          <Radio value="current_month">{t('periodOnce')}</Radio>
          <Radio value="monthly">{t('periodMonthly')}</Radio>
        </RadioGroup>
        <RadioGroup
          label={t('purchase')}
          value={hasSetup ? 'on_request' : values.purchaseMode}
          onChange={(v) => set({ purchaseMode: v as PackFormValues['purchaseMode'] })}
          hint={hasSetup ? t('setupLocked') : undefined}
        >
          <Radio value="direct" isDisabled={hasSetup}>
            {t('purchaseDirect')}
          </Radio>
          <Radio value="on_request">{t('purchaseOnRequest')}</Radio>
        </RadioGroup>
        {mode === 'edit' && (
          <Notice tone="neutral" icon="info">
            {t('note')}
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
