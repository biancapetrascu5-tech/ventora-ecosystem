'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  DataTable,
  DatePicker,
  Dialog,
  FormField,
  Input,
  Notice,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  UsageMeter,
  type AppName,
  type DataTableColumn,
  type UsageMeterProps,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import businessStyles from '../business.module.css';
import s from './commercial.module.css';

/* FounderBusiness — partea comercială (Lotul 3.4, doar română): consumul față de limite pe
   perioada reală („Consum: 17 oct. – 16 nov.”, cu excepțiile active și data estimată a atingerii
   limitei), excepțiile (valoare, până când, motiv, cine a adăugat-o; „Adaugă o excepție”,
   prelungirea auditată, încheierea), fișa abonamentului (cum plătește, moneda, reînnoirea, ziua
   de la care pornește consumul). „Prezentare”: excepțiile care expiră în 7 zile (§8.5). */

/** Textele UsageMeter din cheile ui.usageMeter (Founder folosește catalogul RO al Hub-ului). */
export function useUsageLabels(): Partial<UsageMeterProps> {
  const t = useTranslations('usageMeter');
  return {
    locale: 'ro',
    usedOfLabel: (a: { used: string; limit: string }) => t('usedOf', a),
    leftLabel: (a: { n: string }) => t('left', a),
    nearLimitLabel: t('nearLimit'),
    unlimitedLabel: t('unlimited'),
    atLimitLabel: t('atLimit'),
    atLimitHint: t('atLimitHint'),
    upgradeLabel: t('upgrade'),
    buyMoreLabel: t('buyMore'),
    notifyOwnerLabel: t('notifyOwner'),
    onlyOwnerBuysLabel: (a: { who: string }) => t('onlyOwnerBuys', a),
  } as Partial<UsageMeterProps>;
}

export type UsageItem = {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit?: string;
  decimal?: boolean;
  /** „La ritmul de acum, ajunge la limită pe 26 octombrie.” */
  note?: string;
};

export function BusinessUsageSection({ title, items }: { title: string; items: UsageItem[] }) {
  const t = useTranslations('founder.business.usage');
  const labels = useUsageLabels();
  return (
    <Sheet>
      <SheetSection title={title} description={t('lead')}>
        {items.length ? (
          <div className={s.usageGrid}>
            {items.map((u) => {
              const meter = (
                <UsageMeter
                  key={u.key}
                  {...labels}
                  label={u.label}
                  used={u.used}
                  limit={u.limit}
                  unit={u.unit}
                  format={u.decimal ? (n) => n.toLocaleString('ro-RO') : undefined}
                />
              );
              return u.note ? (
                <div key={u.key} className={s.stack2}>
                  {meter}
                  <p className="body-small muted">{u.note}</p>
                </div>
              ) : (
                meter
              );
            })}
          </div>
        ) : (
          <p className="body muted">{t('none')}</p>
        )}
      </SheetSection>
    </Sheet>
  );
}

export type ExceptionRow = {
  id: string | number;
  /** „Limită de membri” */
  what: string;
  /** „12 în loc de 10” */
  value: string;
  /** „31 dec. 2026” */
  until: string;
  reason: string;
  /** „Bianca Petrașcu · 3 oct.” */
  by: string;
};

export function ExceptionsSection({
  rows,
  phone: phoneProp,
  onAdd,
  onExtend,
  onEnd,
}: {
  rows: ExceptionRow[];
  phone?: boolean;
  onAdd: () => void;
  onExtend: (row: ExceptionRow) => void;
  onEnd: (row: ExceptionRow) => void;
}) {
  const t = useTranslations('founder.business.exceptions');
  const labels = useTableLabels();
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const columns: DataTableColumn<ExceptionRow>[] = [
    { key: 'what', header: t('col.what'), primary: true },
    { key: 'value', header: t('col.value'), secondary: true },
    { key: 'until', header: t('col.until'), secondary: true },
    { key: 'reason', header: t('col.reason'), optional: true, muted: true },
    { key: 'by', header: t('col.by'), optional: true, muted: true },
  ];
  return (
    <div>
      <div className={s.sechead}>
        <h2 className="heading">{t('title')}</h2>
        {phone && (
          <Button size="sm" icon="plus" onPress={onAdd}>
            {t('addShort')}
          </Button>
        )}
      </div>
      {rows.length ? (
        <DataTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowActions={(r) => [
            { label: t('edit'), icon: 'pencil', onClick: () => onExtend(r) },
            { separator: true },
            { label: t('end'), icon: 'x', destructive: true, onClick: () => onEnd(r) },
          ]}
          labels={labels}
          locale="ro"
        />
      ) : (
        <p className="body muted">{t('empty')}</p>
      )}
    </div>
  );
}

/** Fișa „Abonament” din dreapta: planul, cum plătește, moneda, reînnoirea, aplicațiile. */
export function PlanCardContent({
  title,
  rest,
  note,
  apps,
}: {
  /** „Business · v2” */
  title?: string;
  /** „plătește lunar: 349 lei” */
  rest?: string;
  note?: string;
  apps: AppName[];
}) {
  const t = useTranslations('founder.business');
  return (
    <>
      <p className="subheading">{t('planCard')}</p>
      <p className="body">
        {title && <span className="body-strong">{title}</span>}
        {title && rest ? ` · ${rest}` : rest}
      </p>
      {note && <p className="body-small muted">{note}</p>}
      {apps.length > 0 && (
        <div className={businessStyles.apps}>
          {apps.map((a) => (
            <AppIcon key={a} app={a} size={24} title={APPS[a]?.name} />
          ))}
        </div>
      )}
    </>
  );
}

export type ExceptionFormValues = {
  quotaKey: string;
  value: string;
  until: Date | null;
  reason: string;
};

export type ExceptionFormErrors = Partial<Record<keyof ExceptionFormValues, string>>;

/**
 * „Adaugă o excepție pentru {business}” (FounderStates): ce schimbi (o limită), valoarea nouă,
 * până la (cel mult 12 luni, D-COM-8), motivul (rămâne în jurnal). Prelungirea („Editează”) are
 * doar „Până la”: valoarea și motivul unei excepții nu se schimbă (trigger-ul override_guard).
 * O aplicație întreagă sau o reducere nu se dau prin excepție (D3-21).
 */
export function ExceptionDialog({
  title,
  values,
  errors = {},
  resources,
  suffix,
  extending,
  today,
  max,
  pending,
  failed,
  mob,
  inline,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  values: ExceptionFormValues;
  errors?: ExceptionFormErrors;
  resources: { value: string; label: string }[];
  /** „pe lună” la o cotă de flux */
  suffix?: string;
  extending?: boolean;
  today: Date;
  max: Date;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onChange: (v: ExceptionFormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('founder.business.exceptionDialog');
  const ui = useTranslations('ui');
  const set = (patch: Partial<ExceptionFormValues>) => onChange({ ...values, ...patch });
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={title}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button isDisabled={pending} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" isPending={pending} onPress={onSubmit}>
            {extending ? t('extendSubmit') : t('submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        <div className={mob ? `${s.prices} ${s.pricesMob}` : s.prices}>
          <FormField label={t('what')} isRequired error={errors.quotaKey}>
            <Select
              value={values.quotaKey}
              options={resources}
              isDisabled={extending}
              onChange={(v) => set({ quotaKey: v })}
            />
          </FormField>
          <FormField label={t('value')} isRequired error={errors.value}>
            <Input
              value={values.value}
              suffix={suffix}
              inputMode="numeric"
              disabled={extending}
              isInvalid={!!errors.value}
              onChange={(e) => set({ value: e.target.value })}
            />
          </FormField>
          <FormField label={t('until')} isRequired error={errors.until} hint={t('untilHelp')}>
            <DatePicker
              value={values.until}
              onChange={(d) => set({ until: d instanceof Date ? d : null })}
              today={today}
              min={today}
              max={max}
              invalid={!!errors.until}
            />
          </FormField>
          <FormField
            label={t('reason')}
            isRequired
            hint={errors.reason ? undefined : t('reasonHelp')}
            error={errors.reason}
          >
            <Input
              value={values.reason}
              disabled={extending}
              isInvalid={!!errors.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          </FormField>
        </div>
      </div>
    </Dialog>
  );
}

/** „Prezentare” (ARCHITECTURE §8.5): excepțiile care expiră în 7 zile, cu „Prelungește”. */
export function OverviewView({
  expiring,
  onExtend,
}: {
  expiring: { id: string; title: string; body: string }[];
  onExtend: (id: string) => void;
}) {
  const t = useTranslations('founder.overview');
  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <div className={businessStyles.axb}>
        {expiring.length ? (
          expiring.map((x) => (
            <Notice
              key={x.id}
              tone="attention"
              icon="clock"
              title={x.title}
              actions={
                <Button size="sm" onPress={() => onExtend(x.id)}>
                  {t('extend')}
                </Button>
              }
            >
              {x.body}
            </Notice>
          ))
        ) : (
          <p className="body muted">{t('empty')}</p>
        )}
      </div>
    </>
  );
}
