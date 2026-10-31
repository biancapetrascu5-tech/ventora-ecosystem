'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  DataTable,
  Drawer,
  FormField,
  Input,
  Notice,
  Menu,
  PageHeader,
  Toggle,
  type AppName,
  type DataTableColumn,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import s from './commercial.module.css';

/* FounderApps (Lotul 3.4; S117 1.1.0, D3-24): fiecare aplicație se vinde și la bucată —
   implementarea o singură dată, mentenanța lunar sau anual, în lei și în euro — cu limitele ei
   incluse; comutatorul „Direct / La cerere”. Panoul „Editează {app}”: mentenanța, implementarea,
   limitele. `locked`: comutatorul blocat pe „La cerere” (D3-23 / D3-24: cu implementare →
   la cerere; S117 îl desenează liber — NECESITĂ DECIZIE, raportul 3.4). Doar română (S57). */

export type AppRow = {
  id: string;
  app: AppName;
  /** „149 lei · 1.490 lei” / „30 € · 300 €” */
  maintenance: { lei: string; eur: string };
  /** Pe telefon: „149 lei · 30 € pe lună” */
  maintenanceShort: string;
  setup: { lei: string; eur: string } | null;
  setupShort: string;
  /** „1.000 de programări pe lună” … */
  limits: string[];
  direct: boolean;
  locked?: boolean;
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
      key: 'maintenance',
      header: t('col.maintenance'),
      secondary: true,
      render: (r) =>
        phone ? (
          <span className="body-small v-num">{r.maintenanceShort}</span>
        ) : (
          <span className={s.fbCell}>
            <span className="body v-num">{r.maintenance.lei}</span>
            <span className="body-small muted v-num">{r.maintenance.eur}</span>
          </span>
        ),
    },
    {
      key: 'setup',
      header: t('col.setup'),
      secondary: true,
      render: (r) =>
        phone ? (
          <span className="body-small muted v-num">{r.setupShort}</span>
        ) : r.setup ? (
          <span className={s.fbCell}>
            <span className="body v-num">{r.setup.lei}</span>
            <span className="body-small muted v-num">{r.setup.eur}</span>
          </span>
        ) : (
          <span className="body-small muted">{t('none')}</span>
        ),
    },
    {
      key: 'limits',
      header: t('col.limits'),
      optional: true,
      render: (r) =>
        r.limits.length ? (
          <ul className={`${s.fbInc} body-small`}>
            {r.limits.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <span className="body-small muted">{t('noLimits')}</span>
        ),
    },
    {
      key: 'activation',
      header: t('col.activation'),
      trailing: true,
      render: (r) => (
        <span className={s.act}>
          <Toggle
            isSelected={r.direct}
            isDisabled={r.locked}
            labelPosition="end"
            onChange={(on) => onToggle(r, on)}
          >
            {r.direct ? t('direct') : t('onRequest')}
          </Toggle>
          {!phone && (
            <span className="caption muted">
              {r.locked ? t('setupLocked') : r.direct ? t('directHelp2') : t('onRequestHelp')}
            </span>
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : t('lead2')} />
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowActions={(r) => [{ label: t('editAction'), icon: 'pencil', onClick: () => onEdit(r) }]}
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
  /** D3-24: limitele incluse, pe cheie: „1.000”. */
  limits: Record<string, string>;
};

export type AppPriceErrors = Partial<Record<Exclude<keyof AppPriceValues, 'limits'>, string>> & {
  limits?: Record<string, string>;
};

/**
 * „Editează {app}” (S117, panou lateral; pe telefon pe tot ecranul): mentenanța lunară și anuală
 * (prețul anual se scrie direct), implementarea, în lei și în euro, și limitele incluse, cu
 * „Adaugă o limită”.
 */
export function AppPriceDrawer({
  app,
  values,
  errors = {},
  helpers = {},
  quotas,
  pending,
  failed,
  mob,
  contained,
  isOpen,
  onChange,
  onCancel,
  onSave,
}: {
  app: AppName;
  values: AppPriceValues;
  errors?: AppPriceErrors;
  /** Economia sub prețurile anuale. */
  helpers?: Partial<Record<'annualLei' | 'annualEur', string>>;
  /** Cotele registrului: cheia și eticheta („Programări pe lună”). */
  quotas: { key: string; label: string }[];
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  /** Galeria: panoul în cadrul paginii. */
  contained?: boolean;
  isOpen: boolean;
  onChange: (v: AppPriceValues) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations('founder.apps.edit');
  const ed = useTranslations('founder.editor.price');
  const ui = useTranslations('ui');
  const set = (patch: Partial<AppPriceValues>) => onChange({ ...values, ...patch });
  const shown = quotas.filter((q) => q.key in values.limits);
  const others = quotas.filter((q) => !(q.key in values.limits));
  const price = (
    field: Exclude<keyof AppPriceValues, 'limits'>,
    label: string,
    suffix: string,
    required = true,
  ) => (
    <FormField
      label={label}
      isRequired={required}
      hint={errors[field] ? undefined : helpers[field as 'annualLei']}
      error={errors[field]}
    >
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
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onCancel()}
      contained={contained}
      layout={mob ? 'full' : 'side'}
      width={520}
      title={t('title', { app: APPS[app]?.name ?? app })}
      subtitle={t('subtitle')}
      closeLabel={ui('close')}
      backLabel={ui('back')}
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
      <div className={s.stack5}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        <div>
          <p className={`subheading ${s.fpSub}`}>{t('maintenance')}</p>
          <p className={`body-small muted ${s.helpBelow}`}>{t('maintenanceHelp')}</p>
          <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
            {price('monthlyLei', ed('monthlyLei'), 'lei')}
            {price('annualLei', ed('annualLei'), 'lei')}
            {price('monthlyEur', ed('monthlyEur'), '€')}
            {price('annualEur', ed('annualEur'), '€')}
          </div>
        </div>
        <div>
          <p className={`subheading ${s.fpSub}`}>{t('setup')}</p>
          <p className={`body-small muted ${s.helpBelow}`}>{t('setupHelp')}</p>
          <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
            {price('setupLei', ed('setupLei'), 'lei', false)}
            {price('setupEur', ed('setupEur'), '€', false)}
          </div>
        </div>
        <div>
          <p className={`subheading ${s.fpSub}`}>{t('limits')}</p>
          <p className={`body-small muted ${s.helpBelow}`}>{t('limitsHelp')}</p>
          <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
            {shown.map((q) => (
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
          {others.length > 0 && (
            <div className={s.topSpace3}>
              <Menu
                label={t('addLimit')}
                items={others.map((q) => ({ id: q.key, label: q.label }))}
                onAction={(k) => set({ limits: { ...values.limits, [String(k)]: '' } })}
              >
                <Button size="sm" variant="quiet" icon="plus">
                  {t('addLimit')}
                </Button>
              </Menu>
            </div>
          )}
        </div>
        <Notice tone="neutral" icon="info">
          {t('note')}
        </Notice>
      </div>
    </Drawer>
  );
}
