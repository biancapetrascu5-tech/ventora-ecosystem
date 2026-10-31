'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  DataTable,
  Dialog,
  FormField,
  Input,
  Notice,
  PageHeader,
  Toggle,
  type AppName,
  type DataTableColumn,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import s from './commercial.module.css';

/* FounderApps (Lotul 3.4, S113, doar română): aplicațiile la bucată (D3-24) — cât costă fiecare
   pe lună, în lei și în euro, costul de implementare și comutatorul „Direct / La cerere”, blocat
   pe „La cerere” când există un cost de implementare (D3-23). D3-24: fiecare aplicație își are
   limitele incluse, scrise în dialogul de preț (fără design propriu, raportul 3.4). */

export type AppRow = {
  id: string;
  app: AppName;
  /** „49 lei · 10 €” */
  price: string;
  /** „300 lei · 60 €” sau „Fără” */
  setup: string;
  hasSetup: boolean;
  direct: boolean;
};

export function AppsView({
  rows,
  onToggle,
  onEdit,
  phone: phoneProp,
}: {
  rows: AppRow[];
  onToggle: (row: AppRow, direct: boolean) => void;
  onEdit: (row: AppRow) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.apps');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<AppRow>[] = [
    {
      key: 'app',
      header: t('col.app'),
      primary: true,
      render: (r) => (
        <span className={s.nowrap2}>
          <AppIcon app={r.app} size={24} />
          {APPS[r.app]?.name}
        </span>
      ),
    },
    {
      key: 'price',
      header: t('col.price'),
      secondary: true,
      render: (r) => <span className="v-num">{r.price}</span>,
    },
    {
      key: 'setup',
      header: t('col.setup'),
      secondary: true,
      render: (r) => (r.hasSetup ? <span className="v-num">{r.setup}</span> : r.setup),
    },
    {
      key: 'activation',
      header: t('col.activation'),
      trailing: true,
      render: (r) => (
        <span className={s.act}>
          <Toggle
            isSelected={r.direct}
            isDisabled={r.hasSetup}
            labelPosition="end"
            onChange={(on) => onToggle(r, on)}
          >
            {r.direct ? t('direct') : t('onRequest')}
          </Toggle>
          {!phone && (
            <span className="caption muted">
              {r.hasSetup ? t('setupLocked') : r.direct ? t('directHelp') : t('onRequestHelp')}
            </span>
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : t('lead')} />
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowActions={(r) => [{ label: t('editPrice'), icon: 'pencil', onClick: () => onEdit(r) }]}
        labels={labels}
        locale="ro"
      />
    </>
  );
}

export type AppPriceValues = {
  monthlyLei: string;
  annualLei: string;
  monthlyEur: string;
  annualEur: string;
  setupLei: string;
  setupEur: string;
  /** D3-24: limitele incluse, pe cheie: „1.000”, gol = nu e inclusă. */
  limits: Record<string, string>;
};

export type AppPriceErrors = Partial<Record<Exclude<keyof AppPriceValues, 'limits'>, string>> & {
  limits?: Record<string, string>;
};

/**
 * „Editează prețul” (FounderApps): mentenanța lunară și anuală (prețul anual se scrie direct),
 * implementarea, în lei și în euro, și limitele incluse (D3-24).
 */
export function AppPriceDialog({
  app,
  values,
  errors = {},
  quotas,
  pending,
  failed,
  mob,
  inline,
  onChange,
  onCancel,
  onSave,
}: {
  app: AppName;
  values: AppPriceValues;
  errors?: AppPriceErrors;
  /** Cotele registrului: cheia și eticheta („Programări pe lună”). */
  quotas: { key: string; label: string }[];
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onChange: (v: AppPriceValues) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations('founder.apps.dialog');
  const ed = useTranslations('founder.editor.price');
  const ui = useTranslations('ui');
  const set = (patch: Partial<AppPriceValues>) => onChange({ ...values, ...patch });
  const price = (
    field: Exclude<keyof AppPriceValues, 'limits'>,
    label: string,
    suffix: string,
    required?: boolean,
  ) => (
    <FormField label={label} isRequired={required} error={errors[field]}>
      <Input
        value={values[field]}
        suffix={suffix}
        inputMode="decimal"
        isInvalid={!!errors[field]}
        onChange={(e) => set({ [field]: e.target.value })}
      />
    </FormField>
  );
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('title', { app: APPS[app]?.name ?? app })}
      description={t('lead')}
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
        <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
          {price('monthlyLei', ed('monthlyLei'), 'lei', true)}
          {price('annualLei', ed('annualLei'), 'lei')}
          {price('monthlyEur', ed('monthlyEur'), '€', true)}
          {price('annualEur', ed('annualEur'), '€')}
          {price('setupLei', ed('setupLei'), 'lei')}
          {price('setupEur', ed('setupEur'), '€')}
        </div>
        <div className={s.stack2}>
          <p className="subheading">{t('limits')}</p>
          <p className="body-small muted">{t('limitsHelp')}</p>
        </div>
        <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
          {quotas.map((q) => (
            <FormField key={q.key} label={q.label} error={errors.limits?.[q.key]}>
              <Input
                value={values.limits[q.key] ?? ''}
                inputMode="numeric"
                isInvalid={!!errors.limits?.[q.key]}
                onChange={(e) => set({ limits: { ...values.limits, [q.key]: e.target.value } })}
              />
            </FormField>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
