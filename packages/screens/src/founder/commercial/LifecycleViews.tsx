'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  DatePicker,
  Dialog,
  Drawer,
  FormField,
  Icon,
  IconButton,
  Input,
  Menu,
  Notice,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  Textarea,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../BusinessesView';
import s from './lifecycle.module.css';

/* Lotul 3.8 (S121, doar română): FounderBillingProfile (cardul „Factura se emite pe”, formularul
   comun cu FounderNewBusiness), FounderInvoiceNotIssued („Nu s-a emis”, „Reîncearcă”, „Am emis-o
   manual…”), FounderSetupRequests (rândul, detaliul pe fiecare stare). Vederile primesc textele
   gata formatate (sume, date) și apelurile; datele vin din aplicația Founder. */

// ── FounderBillingProfile ───────────────────────────────────────────────────────────────────

export type BillingProfileValues = {
  type: 'company' | 'person';
  name: string;
  /** CUI (RO) sau codul de TVA (în afara României). */
  taxId: string;
  regCom: string;
  street: string;
  city: string;
  /** Județul (RO) sau regiunea. */
  county: string;
  /** Codul țării: „RO”, „DE”… */
  country: string;
  email: string;
};

export type BillingProfileErrors = Partial<{
  name: boolean;
  /** „format” / „check” (cifra de control). */
  cui: 'format' | 'check';
  vatCode: boolean;
  regCom: boolean;
  street: boolean;
  city: boolean;
  county: boolean;
  email: boolean;
  reason: boolean;
}>;

export const RO_COUNTIES = [
  'Alba',
  'Arad',
  'Argeș',
  'Bacău',
  'Bihor',
  'Bistrița-Năsăud',
  'Botoșani',
  'Brașov',
  'Brăila',
  'București',
  'Buzău',
  'Caraș-Severin',
  'Călărași',
  'Cluj',
  'Constanța',
  'Covasna',
  'Dâmbovița',
  'Dolj',
  'Galați',
  'Giurgiu',
  'Gorj',
  'Harghita',
  'Hunedoara',
  'Ialomița',
  'Iași',
  'Ilfov',
  'Maramureș',
  'Mehedinți',
  'Mureș',
  'Neamț',
  'Olt',
  'Prahova',
  'Satu Mare',
  'Sălaj',
  'Sibiu',
  'Suceava',
  'Teleorman',
  'Timiș',
  'Tulcea',
  'Vaslui',
  'Vâlcea',
  'Vrancea',
];

/** Țările din formular (S121), cu numele în română. */
export const PROFILE_COUNTRIES: Array<{ value: string; label: string }> = [
  { value: 'RO', label: 'România' },
  { value: 'DE', label: 'Germania' },
  { value: 'IT', label: 'Italia' },
  { value: 'FR', label: 'Franța' },
  { value: 'ES', label: 'Spania' },
  { value: 'MD', label: 'Republica Moldova' },
];

export const countryName = (code: string) =>
  PROFILE_COUNTRIES.find((c) => c.value === code)?.label ?? code;

function profileRows(
  t: ReturnType<typeof useTranslations>,
  p: BillingProfileValues,
): Array<[string, string]> {
  const co = p.type === 'company';
  const ro = p.country === 'RO';
  const rows: Array<[string, string] | null> = [
    [t('type'), co ? t('company') : t('person')],
    [co ? t('companyName') : t('personName'), p.name],
    co ? [ro ? t('cui') : t('taxIdForeign'), p.taxId] : null,
    co && p.regCom ? [ro ? t('regCom') : t('regComForeign'), p.regCom] : null,
    [
      t('address'),
      [
        p.street,
        p.city,
        p.county ? (ro ? `jud. ${p.county}` : p.county) : null,
        countryName(p.country),
      ]
        .filter(Boolean)
        .join(', '),
    ],
    [t('email'), p.email],
  ];
  return rows.filter((r): r is [string, string] => !!r);
}

/** „Factura se emite pe” cu „Editează datele de facturare”; cererea din Hub, dacă există. */
export function BillingProfileCard({
  profile,
  asked,
  onEdit,
  onOpenRequest,
  phone,
}: {
  /** null: datele nu sunt introduse încă. */
  profile: BillingProfileValues | null;
  /** „Cere o schimbare” din Hub (N10: legătura cu solicitarea vine în PR-ul de suport). */
  asked?: { name: string; text: string; ref: string } | null;
  onEdit: () => void;
  onOpenRequest?: () => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.billingProfile');
  const btn = (
    <Button size="sm" icon="pencil" onPress={onEdit}>
      {t('edit')}
    </Button>
  );
  return (
    <Sheet>
      <SheetSection title={t('card')} description={t('lead')} actions={phone ? undefined : btn}>
        <div className={s.stack}>
          {asked ? (
            <Notice
              tone="attention"
              icon="message-square"
              title={t('changeAsked', { name: asked.name })}
            >
              <div className={s.stack}>
                <p>{t('changeAskedBody', { text: asked.text, ref: asked.ref })}</p>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="external-link"
                    onPress={onOpenRequest}
                  >
                    {t('openRequest')}
                  </Button>
                </div>
              </div>
            </Notice>
          ) : null}
          {profile ? (
            <dl className={s.kv}>
              {profileRows(t, profile).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className="caption">{k}</dt>
                  <dd className="body">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="body muted">{t('empty')}</p>
          )}
          {phone ? <div>{btn}</div> : null}
        </div>
      </SheetSection>
    </Sheet>
  );
}

/** Formularul comun (FounderBillingProfile și FounderNewBusiness). */
export function BillingProfileForm({
  values,
  errors = {},
  onChange,
  cuiOk,
  reason,
  onReasonChange,
  phone,
}: {
  values: BillingProfileValues;
  errors?: BillingProfileErrors;
  onChange: (v: BillingProfileValues) => void;
  /** „CUI valid” în câmp (verificat la format și la cifra de control). */
  cuiOk?: boolean;
  /** „Motivul schimbării” (doar la editare). */
  reason?: string;
  onReasonChange?: (v: string) => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.billingProfile');
  const co = values.type === 'company';
  const ro = values.country === 'RO';
  const set = (patch: Partial<BillingProfileValues>) => onChange({ ...values, ...patch });
  const e = errors;
  return (
    <div className={s.stack}>
      <div className={s.start}>
        <SegmentedControl
          aria-label={t('type')}
          value={values.type}
          onChange={(v) => set({ type: v as 'company' | 'person' })}
          options={[
            { value: 'company', label: t('company') },
            { value: 'person', label: t('person') },
          ]}
        />
      </div>
      <div className={`${s.g2f} ${phone ? s.g2fm : ''}`}>
        {co ? (
          <FormField
            label={t('companyName')}
            isRequired
            hint={e.name ? undefined : t('companyNameHelp')}
            error={e.name ? t('required', { field: t('fieldCompanyName') }) : undefined}
          >
            <Input
              value={values.name}
              isInvalid={!!e.name}
              onChange={(ev) => set({ name: ev.target.value })}
            />
          </FormField>
        ) : (
          <FormField
            label={t('personName')}
            isRequired
            error={e.name ? t('required', { field: t('fieldPersonName') }) : undefined}
          >
            <Input
              value={values.name}
              isInvalid={!!e.name}
              onChange={(ev) => set({ name: ev.target.value })}
            />
          </FormField>
        )}
        {co && !ro ? (
          <FormField
            label={t('taxIdForeign')}
            isRequired
            hint={t('taxIdForeignHelp')}
            error={e.vatCode ? t('vatCodeErr') : undefined}
          >
            <Input
              value={values.taxId}
              isInvalid={!!e.vatCode}
              onChange={(ev) => set({ taxId: ev.target.value })}
            />
          </FormField>
        ) : null}
        {co && ro ? (
          <FormField
            label={t('cui')}
            isRequired
            hint={e.cui ? undefined : t('cuiHelp')}
            error={
              e.cui === 'check'
                ? t('cuiErrCheck')
                : e.cui === 'format'
                  ? t('cuiErrFormat')
                  : undefined
            }
          >
            <Input
              value={values.taxId}
              isInvalid={!!e.cui}
              onChange={(ev) => set({ taxId: ev.target.value })}
              suffix={
                !e.cui && cuiOk ? (
                  <span className={`caption ${s.ok}`}>
                    <Icon icon="circle-check" size={14} />
                    {t('cuiOk')}
                  </span>
                ) : undefined
              }
            />
          </FormField>
        ) : null}
        {co && !ro ? (
          <FormField label={t('regComForeign')} isOptional>
            <Input value={values.regCom} onChange={(ev) => set({ regCom: ev.target.value })} />
          </FormField>
        ) : null}
        {co && ro ? (
          <FormField
            label={t('regCom')}
            isRequired
            hint={e.regCom ? undefined : t('regComHelp')}
            error={e.regCom ? t('regComErr') : undefined}
          >
            <Input
              value={values.regCom}
              isInvalid={!!e.regCom}
              onChange={(ev) => set({ regCom: ev.target.value })}
            />
          </FormField>
        ) : null}
        <FormField
          label={t('street')}
          isRequired
          error={e.street ? t('required', { field: t('fieldStreet') }) : undefined}
        >
          <Input
            value={values.street}
            isInvalid={!!e.street}
            onChange={(ev) => set({ street: ev.target.value })}
          />
        </FormField>
        <FormField
          label={t('city')}
          isRequired
          error={e.city ? t('required', { field: t('fieldCity') }) : undefined}
        >
          <Input
            value={values.city}
            isInvalid={!!e.city}
            onChange={(ev) => set({ city: ev.target.value })}
          />
        </FormField>
        {ro ? (
          <FormField
            label={t('county')}
            isRequired
            error={e.county ? t('required', { field: t('fieldCounty') }) : undefined}
          >
            <Select
              value={values.county}
              isInvalid={!!e.county}
              onChange={(v) => set({ county: v })}
              options={RO_COUNTIES.map((c) => ({ value: c, label: c }))}
            />
          </FormField>
        ) : (
          <FormField label={t('region')} isOptional>
            <Input value={values.county} onChange={(ev) => set({ county: ev.target.value })} />
          </FormField>
        )}
        <FormField label={t('country')} isRequired>
          <Select
            value={values.country}
            onChange={(v) => set({ country: v, county: v === 'RO' ? values.county : '' })}
            options={PROFILE_COUNTRIES}
          />
        </FormField>
        <FormField
          label={t('email')}
          isRequired
          hint={e.email ? undefined : t('emailHelp')}
          error={e.email ? t('required', { field: t('fieldEmail') }) : undefined}
        >
          <Input
            type="email"
            icon="mail"
            value={values.email}
            isInvalid={!!e.email}
            onChange={(ev) => set({ email: ev.target.value })}
          />
        </FormField>
      </div>
      {co ? null : (
        <p className={`${s.line} body-small`}>
          <Icon icon="info" size={16} />
          {t('personNote')}
        </p>
      )}
      {onReasonChange ? (
        <FormField
          label={t('reason')}
          isRequired
          hint={e.reason ? undefined : t('reasonHelp')}
          error={e.reason ? t('required', { field: t('fieldReason') }) : undefined}
        >
          <Textarea
            rows={2}
            maxLength={1000}
            value={reason ?? ''}
            onChange={(ev) => onReasonChange(ev.target.value)}
          />
        </FormField>
      ) : null}
    </div>
  );
}

/** „Editează datele de facturare”: Drawer (ecran întreg pe telefon) cu formularul și motivul. */
export function BillingProfileDrawer({
  business,
  isOpen,
  onOpenChange,
  pending,
  failed,
  onSave,
  children,
  phone,
}: {
  business: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  failed?: boolean;
  onSave: () => void;
  children: React.ReactNode;
  phone?: boolean;
}) {
  const t = useTranslations('founder.billingProfile');
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      layout={phone ? 'full' : 'auto'}
      width={560}
      title={t('edit')}
      subtitle={business}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" icon="check" isPending={pending} onPress={onSave}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed ? <Notice tone="danger">{t('saveFailed')}</Notice> : null}
        {children}
      </div>
    </Drawer>
  );
}

// ── FounderInvoiceNotIssued (în istoricul din „Plăți și facturi”) ───────────────────────────

export type InvoiceHistoryStatus =
  | 'paid'
  | 'pending'
  | 'invoicePending'
  | 'notIssued'
  | 'retrying'
  | 'manual'
  | 'storno'
  | 'refunded';

export type InvoiceHistoryRow = {
  id: string | number;
  /** „Abonament Business · noiembrie” */
  what: string;
  /** „4 nov.” */
  date: string;
  /** „600 lei” */
  amount: string;
  /** „VS 2026-0431” sau „—” */
  inv: string;
  st: InvoiceHistoryStatus;
};

const INVOICE_PILL = {
  paid: ['done', 'check', 'status.paid'],
  pending: ['attention', 'clock', 'status.pending'],
  invoicePending: ['neutral', 'clock', 'status.invoicePending'],
  notIssued: ['attention', 'circle-alert', 'status.notIssued'],
  retrying: ['attention', 'loader-circle', 'status.notIssued'],
  manual: ['neutral', 'file-check', 'status.manual'],
  storno: ['neutral', 'rotate-ccw', 'status.storno'],
  refunded: ['neutral', 'rotate-ccw', 'status.refunded'],
} as const;

/** „Nu s-a emis”: motivul de la e-Factura și ce poți face. */
export function InvoiceNotIssuedNotice({
  what,
  amount,
  date,
  reason,
  retryFailed,
  retrying,
  onRetry,
  onManual,
  onEditProfile,
}: {
  what: string;
  amount: string;
  date: string;
  reason: string;
  retryFailed?: boolean;
  retrying?: boolean;
  onRetry: () => void;
  onManual: () => void;
  onEditProfile: () => void;
}) {
  const t = useTranslations('founder.billing');
  const p = useTranslations('founder.billingProfile');
  return (
    <Notice tone="attention" icon="circle-alert" title={t('notIssued.title', { what })}>
      <div className={s.stack}>
        <p>
          {retryFailed
            ? t('notIssued.retryFailed', { reason })
            : t('notIssued.body', { amount, date, reason })}
        </p>
        <p className="muted">{t('notIssued.fixFirst')}</p>
        <div className={s.row}>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh-cw"
            isPending={retrying}
            aria-label={retrying ? t('notIssued.retrying') : undefined}
            onPress={onRetry}
          >
            {t('notIssued.retry')}
          </Button>
          <Button size="sm" variant="quiet" icon="file-check" onPress={onManual}>
            {t('notIssued.manual')}
          </Button>
          <Button size="sm" variant="quiet" icon="pencil" onPress={onEditProfile}>
            {p('edit')}
          </Button>
        </div>
      </div>
    </Notice>
  );
}

/** „Istoricul cumpărărilor”, cu stările facturii (S121: „Nu s-a emis”, „Emisă manual”). */
export function InvoiceHistorySection({
  rows,
  activeRow,
  onRetry,
  onManual,
  onConfirmTransfer,
}: {
  rows: InvoiceHistoryRow[];
  activeRow?: string | number;
  onRetry: (row: InvoiceHistoryRow) => void;
  onManual: (row: InvoiceHistoryRow) => void;
  onConfirmTransfer?: (row: InvoiceHistoryRow) => void;
}) {
  const t = useTranslations('founder.billing');
  const labels = useTableLabels();
  const columns: DataTableColumn<InvoiceHistoryRow>[] = [
    { key: 'what', header: t('col.what'), primary: true },
    { key: 'date', header: t('col.date'), secondary: true },
    { key: 'amount', header: t('col.amount'), align: 'end', optional: true },
    { key: 'inv', header: t('col.invoice'), optional: true },
    {
      key: 'st',
      header: t('col.status'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={INVOICE_PILL[r.st][0]} icon={INVOICE_PILL[r.st][1]}>
          {t(INVOICE_PILL[r.st][2])}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: InvoiceHistoryRow): DataTableAction[] =>
    r.st === 'notIssued'
      ? [
          { label: t('notIssued.retry'), icon: 'refresh-cw', onClick: () => onRetry(r) },
          { label: t('notIssued.manual'), icon: 'file-check', onClick: () => onManual(r) },
        ]
      : r.st === 'pending' && onConfirmTransfer
        ? [{ label: t('action.confirm'), icon: 'check', onClick: () => onConfirmTransfer(r) }]
        : [];
  return (
    <Sheet>
      <SheetSection title={t('history.title')} description={t('history.lead')}>
        {rows.length ? (
          <DataTable
            caption={t('history.title')}
            rows={rows}
            columns={columns}
            activeRow={activeRow}
            rowActions={rows.some((r) => actions(r).length > 0) ? actions : undefined}
            labels={labels}
            locale="ro"
          />
        ) : (
          <p className="body muted">{t('empty')}</p>
        )}
      </SheetSection>
    </Sheet>
  );
}

export type ManualIssueValues = { series: string; number: string; date: Date; reason: string };

/** „Ai emis manual factura pentru {business}?” */
export function ManualIssueDialog({
  business,
  lead,
  values,
  onChange,
  errors = {},
  duplicate,
  pending,
  failed,
  mob,
  inline,
  today,
  onCancel,
  onSubmit,
}: {
  business: string;
  /** „Implementare CampaignKit · 600 lei · plătită pe 4 noiembrie” */
  lead: string;
  values: ManualIssueValues;
  onChange: (v: ManualIssueValues) => void;
  errors?: Partial<Record<'series' | 'number' | 'reason', boolean>>;
  /** „VSM 2026-0006” când seria și numărul există deja. */
  duplicate?: string | null;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  today?: Date;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('founder.billing');
  const ui = useTranslations('ui');
  const set = (patch: Partial<ManualIssueValues>) => onChange({ ...values, ...patch });
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('manualIssue.title', { business })}
      description={lead}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('refund.cancel')}
          </Button>
          <Button variant="primary" icon="file-check" isPending={pending} onPress={onSubmit}>
            {t('manualIssue.submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed ? <Notice tone="danger">{t('manualIssue.failed')}</Notice> : null}
        <div className={`${s.g2f} ${mob ? s.g2fm : ''}`}>
          <FormField label={t('manualIssue.series')} isRequired>
            <Input
              value={values.series}
              isInvalid={!!errors.series}
              onChange={(e) => set({ series: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('manualIssue.number')}
            isRequired
            error={duplicate ? t('manualIssue.duplicate', { invoice: duplicate }) : undefined}
          >
            <Input
              value={values.number}
              isInvalid={!!duplicate || !!errors.number}
              onChange={(e) => set({ number: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label={t('manualIssue.date')} isRequired>
          <DatePicker
            value={values.date}
            today={today}
            max={today}
            locale="ro"
            onChange={(d) => d instanceof Date && set({ date: d })}
          />
        </FormField>
        <FormField
          label={t('manualIssue.reason')}
          isRequired
          hint={errors.reason ? undefined : t('manualIssue.reasonHelp')}
          error={errors.reason ? t('manualIssue.reasonError') : undefined}
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={values.reason}
            onChange={(e) => set({ reason: e.target.value })}
          />
        </FormField>
        <p className={`${s.line} body-small`}>
          <Icon icon="info" size={16} />
          {t('manualIssue.effect')}
        </p>
      </div>
    </Dialog>
  );
}

// ── FounderSetupRequests ────────────────────────────────────────────────────────────────────

export type SetupState =
  | 'requested'
  | 'accepted'
  | 'confirmed'
  | 'paid'
  | 'inProgress'
  | 'live'
  | 'cancelled'
  | 'refunded';

const SETUP_PILL = {
  requested: ['attention', 'circle-dot'],
  accepted: ['attention', 'check'],
  confirmed: ['neutral', 'wallet'],
  paid: ['attention', 'wallet'],
  inProgress: ['neutral', 'wrench'],
  live: ['done', 'check-check'],
  cancelled: ['neutral', 'x'],
  refunded: ['neutral', 'rotate-ccw'],
} as const;

const FLOW: SetupState[] = ['requested', 'accepted', 'confirmed', 'paid', 'inProgress', 'live'];

export function SetupPill({ state }: { state: SetupState }) {
  const t = useTranslations('founder.setup');
  return (
    <StatusPill tone={SETUP_PILL[state][0]} icon={SETUP_PILL[state][1]}>
      {t(`st.${state}`)}
    </StatusPill>
  );
}

export type SetupRow = {
  id: string | number;
  business: string;
  /** „CampaignKit” */
  item: string;
  who: string;
  when: string;
  st: SetupState;
};

/** Lista cererilor cu implementare (FounderRequests, secțiunea lor). */
export function SetupRequestsList({
  rows,
  activeRow,
  onOpen,
  onOpenBusiness,
}: {
  rows: SetupRow[];
  activeRow?: string | number;
  onOpen: (row: SetupRow) => void;
  onOpenBusiness: (row: SetupRow) => void;
}) {
  const t = useTranslations('founder.setup');
  const r = useTranslations('founder.requests');
  const labels = useTableLabels();
  const columns: DataTableColumn<SetupRow>[] = [
    { key: 'business', header: r('col.business'), primary: true },
    {
      key: 'what',
      header: r('col.what'),
      secondary: true,
      render: (x) => (
        <span>
          <span className="body-strong">{t('type')}</span> · {x.item}
        </span>
      ),
    },
    { key: 'who', header: r('col.who'), optional: true, muted: true },
    { key: 'when', header: r('col.when'), optional: true },
    {
      key: 'st',
      header: r('col.status'),
      trailing: true,
      render: (x) => <SetupPill state={x.st} />,
    },
  ];
  return (
    <DataTable
      caption={t('title')}
      rows={rows}
      columns={columns}
      activeRow={activeRow}
      onRowClick={onOpen}
      rowActions={(x) => [
        { label: t('action.open'), icon: 'external-link', onClick: () => onOpen(x) },
        { label: r('action.open'), icon: 'building-2', onClick: () => onOpenBusiness(x) },
      ]}
      labels={labels}
      locale="ro"
    />
  );
}

function Steps({ state }: { state: SetupState }) {
  const t = useTranslations('founder.setup');
  const stop = state === 'cancelled' || state === 'refunded';
  const at = stop ? (state === 'refunded' ? 3 : 1) : FLOW.indexOf(state);
  return (
    <ol className={s.suSteps}>
      {FLOW.map((f, i) => {
        const done = i < at || (!stop && i === at && state === 'live');
        const cur = !stop && i === at && state !== 'live';
        return (
          <li key={f} className={done ? s.done : cur ? s.cur : undefined}>
            <Icon icon={done ? 'circle-check' : cur ? 'circle-dot' : 'circle'} size={16} />
            <span className="body-small">{t(`st.${f}`)}</span>
          </li>
        );
      })}
      {stop ? (
        <li className={s.cur}>
          <Icon icon={SETUP_PILL[state][1]} size={16} />
          <span className="body-small">{t(`st.${state}`)}</span>
        </li>
      ) : null}
    </ol>
  );
}

export type SetupOfferValues = {
  setup: string;
  maintenance: string;
  start: Date | null;
  note: string;
};

/** Detaliul unei cereri (Drawer): pașii, ce plătește, pasul următor și butonul lui. */
export function SetupRequestDrawer({
  isOpen,
  onOpenChange,
  business,
  item,
  state,
  meta,
  amounts,
  subStart,
  next,
  offer,
  onOfferChange,
  currencySuffix,
  maintenanceSuffix,
  today,
  pending,
  failed,
  onPrimary,
  onCancelMenu,
  phone,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  item: string;
  state: SetupState;
  /** „Bianca Petrașcu · azi, 10:12” */
  meta: string;
  /** Sumele, formatate: null înainte de ofertă. */
  amounts: { setup: string; maintenance: string; interval: 'month' | 'year' } | null;
  /** „1 noiembrie” după pornire; null înainte. */
  subStart: string | null;
  /** Textul pasului (acceptarea, plata, lucrul, pornirea, anularea). */
  next?: string;
  /** Doar în „Cerută”: formularul ofertei. */
  offer?: SetupOfferValues;
  onOfferChange?: (v: SetupOfferValues) => void;
  currencySuffix: string;
  maintenanceSuffix: string;
  today?: Date;
  pending?: boolean;
  failed?: boolean;
  onPrimary?: () => void;
  onCancelMenu?: () => void;
  phone?: boolean;
}) {
  const t = useTranslations('founder.setup');
  const closed = state === 'live' || state === 'cancelled' || state === 'refunded';
  const paidOrLater = state === 'paid' || state === 'inProgress';
  const FOOT: Partial<Record<SetupState, [string, string, 'primary' | 'secondary']>> = {
    requested: ['send', 'action.sendOffer', 'primary'],
    accepted: ['check', 'action.confirm', 'primary'],
    confirmed: ['send', 'action.resendPay', 'secondary'],
    paid: ['wrench', 'action.start', 'primary'],
    inProgress: ['circle-check', 'action.goLive', 'primary'],
  };
  const foot = FOOT[state];
  const setOffer = (patch: Partial<SetupOfferValues>) =>
    offer && onOfferChange?.({ ...offer, ...patch });
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      layout={phone ? 'full' : 'auto'}
      width={520}
      title={business}
      subtitle={`${t('type')} · ${item}`}
      actions={
        closed || !onCancelMenu ? undefined : (
          <Menu
            label={t('more')}
            items={[
              {
                id: 'cancel',
                label: t(paidOrLater ? 'action.cancelRefund' : 'action.cancel'),
                icon: 'x',
                isDanger: true,
              },
            ]}
            onAction={onCancelMenu}
          >
            <IconButton icon="ellipsis-vertical" label={t('more')} />
          </Menu>
        )
      }
      footer={
        foot ? (
          <Button icon={foot[0] as never} variant={foot[2]} isPending={pending} onPress={onPrimary}>
            {t(foot[1])}
          </Button>
        ) : undefined
      }
    >
      <div className={s.stack}>
        {failed ? <Notice tone="danger">{t('failed')}</Notice> : null}
        <div className={s.row}>
          <SetupPill state={state} />
          <span className="caption muted">{meta}</span>
        </div>
        <p className="subheading">{t('detail.steps')}</p>
        <Steps state={state} />
        <p className="subheading">{t('detail.amounts')}</p>
        <ul className={`${s.hist} body-small`}>
          {amounts ? (
            <>
              <li>{t('detail.setupLine', { amount: amounts.setup })}</li>
              <li>
                {amounts.interval === 'year'
                  ? t('detail.maintLineYear', { amount: amounts.maintenance })
                  : t('detail.maintLine', { amount: amounts.maintenance })}
              </li>
            </>
          ) : null}
          <li className="body-strong">
            {subStart ? t('detail.subStart', { date: subStart }) : t('detail.subStartTbd')}
          </li>
        </ul>
        {state === 'requested' && offer ? (
          <>
            <div className={s.g2f}>
              <FormField label={t('offer.setup')} isRequired>
                <Input
                  value={offer.setup}
                  inputMode="decimal"
                  suffix={currencySuffix}
                  onChange={(e) => setOffer({ setup: e.target.value })}
                />
              </FormField>
              <FormField label={t('offer.maintenance')} isRequired>
                <Input
                  value={offer.maintenance}
                  inputMode="decimal"
                  suffix={maintenanceSuffix}
                  onChange={(e) => setOffer({ maintenance: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label={t('offer.start')}>
              <DatePicker
                value={offer.start ?? undefined}
                today={today}
                min={today}
                locale="ro"
                onChange={(d) => setOffer({ start: d instanceof Date ? d : null })}
              />
            </FormField>
            <FormField label={t('offer.note')} isOptional>
              <Textarea
                rows={2}
                maxLength={1000}
                value={offer.note}
                onChange={(e) => setOffer({ note: e.target.value })}
              />
            </FormField>
          </>
        ) : next ? (
          <p className="body-small">{next}</p>
        ) : null}
      </div>
    </Drawer>
  );
}

/** „Pornești {app} pentru {business}?” */
export function SetupGoLiveDialog({
  app,
  business,
  date,
  amount,
  pending,
  mob,
  inline,
  onCancel,
  onConfirm,
}: {
  app: string;
  business: string;
  date: string;
  amount: string;
  pending?: boolean;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.setup');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('goLive.title', { app, business })}
      description={t('goLive.body', { date, amount })}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel.back')}
          </Button>
          <Button variant="primary" icon="circle-check" isPending={pending} onPress={onConfirm}>
            {t('goLive.submit')}
          </Button>
        </>
      }
    />
  );
}

/** „Anulezi cererea de implementare pentru {business}?” — cu rambursare după plată. */
export function SetupCancelDialog({
  business,
  refund,
  reason,
  onReasonChange,
  pending,
  failed,
  mob,
  inline,
  onCancel,
  onConfirm,
}: {
  business: string;
  /** După plată: suma și cardul (null pentru transfer) — „Anulează și rambursează {amount}”. */
  refund: { amount: string; last4: string | null } | null;
  reason: string;
  onReasonChange: (v: string) => void;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.setup');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      tone="danger"
      title={t('cancel.title', { business })}
      description={
        refund
          ? refund.last4
            ? t('cancel.refundLine', { amount: refund.amount, last4: refund.last4 })
            : t('cancel.refundTransfer', { amount: refund.amount })
          : t('cancel.noPay')
      }
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel.back')}
          </Button>
          <Button
            variant="danger"
            icon={refund ? 'rotate-ccw' : 'x'}
            isPending={pending}
            isDisabled={!reason.trim()}
            onPress={onConfirm}
          >
            {refund ? t('cancel.submitRefund', { amount: refund.amount }) : t('cancel.submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed ? <Notice tone="danger">{t('failed')}</Notice> : null}
        <FormField label={t('cancel.reason')} isRequired hint={t('cancel.reasonHelp')}>
          <Textarea
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
