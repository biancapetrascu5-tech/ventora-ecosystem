'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Badge,
  Button,
  Checkbox,
  DatePicker,
  FormField,
  Icon,
  Input,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  StatusPill,
  type AppName,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import styles from '../business.module.css';
import s from './commercial.module.css';

/* FounderBundleEditor (Lotul 3.4, S117; FounderPlanEditor 2.0.0 în design): „Ofertă nouă” pentru un
   bundle — aplicațiile (cu prețul la bucată și totalul separat), cele patru prețuri, implementarea,
   limitele, locurile în echipă din bundle și perioada de vânzare. Oferta de acum și afacerile de pe
   ea nu se schimbă. Erorile: prețul nu e mai mic decât aplicațiile separat, perioada se suprapune
   cu oferta de acum; „Programează oferta” rămâne oprit până se corectează. Doar română (S57). */

export type EditorPrices = {
  monthlyLei: string;
  annualLei: string;
  monthlyEur: string;
  annualEur: string;
  setupLei: string;
  setupEur: string;
};

export type EditorField = keyof EditorPrices | 'from' | 'until' | 'seats';

export type BundleEditorState = {
  apps: { id: AppName; checked: boolean; price: string; isNew?: boolean }[];
  /** „5 aplicații luate separat” · „366 lei pe lună” / „3.660 lei · 74 € · 740 €”. */
  separate: { label: string; month: string; rest: string };
  prices: EditorPrices;
  /** Textele de sub câmpuri (economia, „Separat: … €”). */
  helpers: Partial<Record<keyof EditorPrices, string>>;
  /** „Separat, aplicațiile au implementare de … lei · … €.” */
  setupDesc: string;
  limits: {
    key: string;
    label: string;
    base: string;
    value: string;
    dir: 'up' | 'down' | 'same';
  }[];
  baseLabel: string;
  newLabel: string;
  seats: string;
  seatsHelp: string;
  from: Date | null;
  until: Date | null;
  /** „Din catalog dispare pe 31 decembrie.” */
  catalogNote?: string;
  errors: Partial<Record<EditorField, string>>;
};

export function BundleEditorView({
  title,
  crumbs,
  notice,
  state,
  readOnly,
  today,
  onApps,
  onPrices,
  onLimit,
  onSeats,
  onPeriod,
  phone: phoneProp,
}: {
  title: string;
  /** Firimiturile: „Bundle-uri” › „Business” › „v3 (ciornă)”. */
  crumbs: { bundles: string; bundle: string; current: string; onBundles?: () => void };
  notice: { kind: 'keep'; title: string; body: string } | { kind: 'error'; body: string };
  state: BundleEditorState;
  /** O ofertă publicată: doar de citit, fără bara de jos. */
  readOnly?: boolean;
  today?: Date;
  onApps: (id: AppName, checked: boolean) => void;
  onPrices: (p: EditorPrices) => void;
  onLimit: (key: string, value: string) => void;
  onSeats: (value: string) => void;
  onPeriod: (from: Date | null, until: Date | null) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.bundleEditor');
  const ed = useTranslations('founder.editor.price');
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  const err = state.errors;
  const price = (field: keyof EditorPrices, label: string, suffix: string, required = true) => (
    <FormField
      label={label}
      isRequired={required}
      hint={err[field] ? undefined : state.helpers[field]}
      error={err[field]}
    >
      <Input
        value={state.prices[field]}
        suffix={suffix}
        inputMode="decimal"
        disabled={readOnly}
        isInvalid={!!err[field]}
        onChange={(e) => onPrices({ ...state.prices, [field]: e.target.value })}
      />
    </FormField>
  );
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={
          phone
            ? undefined
            : [
                { label: crumbs.bundles, href: '/bundles' },
                { label: crumbs.bundle, href: '/bundles' },
                { label: crumbs.current },
              ]
        }
        meta={
          <StatusPill tone="neutral" icon={readOnly ? 'lock' : 'pencil'}>
            {readOnly ? t('published') : t('draft')}
          </StatusPill>
        }
      />
      <div className={styles.axb}>
        {notice.kind === 'error' ? (
          <Notice tone="attention" icon="circle-alert">
            {notice.body}
          </Notice>
        ) : (
          <Notice tone="neutral" icon="info" title={notice.title}>
            {notice.body}
          </Notice>
        )}
        <Sheet>
          <SheetSection title={t('apps.title')} description={t('apps.desc')}>
            <div className={phone ? `${s.fbAppList} ${s.fbAppListMob}` : s.fbAppList}>
              {state.apps.map((a) => (
                <Checkbox
                  key={a.id}
                  isSelected={a.checked}
                  isDisabled={readOnly}
                  onChange={(on) => onApps(a.id, on)}
                  description={a.price}
                >
                  <span className={s.fbAppLab}>
                    <AppIcon app={a.id} size={20} />
                    {APPS[a.id]?.name}
                    {a.isNew && <Badge>{t('newInVersion')}</Badge>}
                  </span>
                </Checkbox>
              ))}
            </div>
            <div className={`${s.fbSum} ${s.topSpace}`}>
              <div className={s.fbLine}>
                <span className="body">{state.separate.label}</span>
                <span className="body-strong v-num">{state.separate.month}</span>
              </div>
              <div className={s.fbLine}>
                <span className="body-small muted">{t('apps.separateRest')}</span>
                <span className="body-small muted v-num">{state.separate.rest}</span>
              </div>
            </div>
          </SheetSection>
          <SheetSection title={t('price.title')} description={t('price.desc')}>
            <div className={phone ? `${s.prices} ${s.pricesMob}` : s.prices}>
              {price('monthlyLei', ed('monthlyLei'), 'lei')}
              {price('annualLei', ed('annualLei'), 'lei')}
              {price('monthlyEur', ed('monthlyEur'), '€')}
              {price('annualEur', ed('annualEur'), '€')}
            </div>
          </SheetSection>
          <SheetSection title={t('setup.title')} description={state.setupDesc}>
            <div className={phone ? `${s.prices} ${s.pricesMob}` : s.prices}>
              {price('setupLei', ed('setupLei'), 'lei', false)}
              {price('setupEur', ed('setupEur'), '€', false)}
            </div>
          </SheetSection>
          <SheetSection title={t('limits.title')} description={t('limits.desc')}>
            <div className={s.limitRows}>
              <div className={`${s.limitHead} caption muted`}>
                <span>{t('limits.resource')}</span>
                <span>{state.baseLabel}</span>
                <span>{state.newLabel}</span>
              </div>
              {state.limits.map((l) => (
                <div key={l.key} className={s.limitRow}>
                  <span className="body">{l.label}</span>
                  <span className="body muted v-num">{l.base}</span>
                  <span className={s.limitNew}>
                    <Input
                      size="sm"
                      value={l.value}
                      disabled={readOnly}
                      aria-label={`${l.label} · ${state.newLabel}`}
                      onChange={(e) => onLimit(l.key, e.target.value)}
                    />
                    {l.dir !== 'same' && (
                      <span className={`${s.delta} caption ${l.dir === 'down' ? s.deltaDown : ''}`}>
                        <Icon
                          icon={l.dir === 'up' ? 'arrow-up-right' : 'arrow-down-right'}
                          size={14}
                        />
                        {l.dir === 'up' ? t('limits.up') : t('limits.down')}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </SheetSection>
          <SheetSection title={t('seats.title')}>
            <div className={phone ? `${s.prices} ${s.pricesMob}` : s.prices}>
              <FormField
                label={t('seats.label')}
                hint={err.seats ? undefined : state.seatsHelp}
                error={err.seats}
              >
                <Input
                  value={state.seats}
                  inputMode="numeric"
                  disabled={readOnly}
                  isInvalid={!!err.seats}
                  onChange={(e) => onSeats(e.target.value)}
                />
              </FormField>
            </div>
          </SheetSection>
          <SheetSection title={t('sale.title')} description={t('sale.desc')}>
            <div className={phone ? `${s.fbPeriod} ${s.fbPeriodMob}` : s.fbPeriod}>
              <FormField label={t('sale.from')} isRequired error={err.from}>
                <DatePicker
                  value={state.from}
                  today={today}
                  disabled={readOnly}
                  invalid={!!err.from}
                  onChange={(d) => onPeriod(d instanceof Date ? d : null, state.until)}
                />
              </FormField>
              <FormField
                label={t('sale.to')}
                isRequired
                hint={err.until ? undefined : t('sale.toHelp')}
                error={err.until}
              >
                <DatePicker
                  value={state.until}
                  today={today}
                  disabled={readOnly}
                  invalid={!!err.until}
                  onChange={(d) => onPeriod(state.from, d instanceof Date ? d : null)}
                />
              </FormField>
            </div>
            {state.catalogNote && (
              <p className={`body-small muted ${s.topSpace3}`}>{state.catalogNote}</p>
            )}
          </SheetSection>
        </Sheet>
      </div>
    </>
  );
}

/**
 * Bara de jos a editorului (.unsaved): „Ciornă salvată…”, „Salvează ciorna”, „Programează oferta”.
 * Stă peste cadrul paginii, în afara AppShell, ca în preview (părintele are `position: relative`).
 */
export function BundleEditorBar({
  savedLabel,
  scheduleLabel,
  canSchedule,
  saving,
  scheduling,
  onSave,
  onSchedule,
  phone: phoneProp,
}: {
  savedLabel?: string;
  scheduleLabel: string;
  canSchedule: boolean;
  saving?: boolean;
  scheduling?: boolean;
  onSave: () => void;
  onSchedule: () => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.bundleEditor');
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;
  return (
    <div className={phone ? `${s.unsaved} ${s.unsavedMob}` : s.unsaved}>
      <span className="body-small muted">{savedLabel}</span>
      <span className={s.nowrap2}>
        <Button variant="quiet" isPending={saving} onPress={onSave}>
          {t('saveDraft')}
        </Button>
        <Button
          variant="primary"
          icon="calendar-clock"
          isDisabled={!canSchedule}
          isPending={scheduling}
          onPress={onSchedule}
        >
          {scheduleLabel}
        </Button>
      </span>
    </div>
  );
}
