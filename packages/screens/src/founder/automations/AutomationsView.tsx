'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Icon,
  IconButton,
  Input,
  Menu,
  Notice,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  Textarea,
  UsageMeter,
  type DataTableAction,
  type DataTableColumn,
  type IconName,
} from '@ventora/ui';
import { useTableLabels } from '../BusinessesView';
import styles from '../business.module.css';
import s from './automations.module.css';

/* FounderAutomations (Lotul 4.10, D4-23, D4-24, S116, doar română): lista automatizărilor, constructorul
   din lista albă (declanșator → condiții → pași), pornirea și oprirea per afacere cu „Motiv”
   obligatoriu (Dialog), jurnalul execuțiilor cu „Rulează din nou”. Vederile primesc valori gata de
   afișat; ecranul din aplicația Founder le citește din core/workflows. */

type Mode = 'desktop' | 'mobile';

// ── Lista ──────────────────────────────────────────────────────────────────────────────────

export type AutomationListRow = {
  id: string | number;
  /** Numele, în română: „Mulțumire după programare”. */
  name: string;
  /** Aplicația declanșatorului: „EasyBook” / „Hub”. */
  app: string;
  /** „Programarea trece în «Încheiată» · după 2 ore” */
  trigger: string;
  activeCount: number;
  /** „4.210” */
  runs: string;
  /** „1,2%” */
  failed: string;
};

export function AutomationsListView({
  rows,
  onNew,
  onEdit,
  onBusinesses,
  onLog,
}: {
  rows: AutomationListRow[];
  onNew: () => void;
  onEdit: (row: AutomationListRow) => void;
  onBusinesses: (row: AutomationListRow) => void;
  onLog: (row: AutomationListRow) => void;
}) {
  const t = useTranslations('founder.automations');
  const labels = useTableLabels();
  const columns: DataTableColumn<AutomationListRow>[] = [
    {
      key: 'name',
      header: t('col.name'),
      primary: true,
      render: (r) => (
        <span className={s.nameCell}>
          {r.name}
          <span className={`caption ${s.muted}`}>{r.app}</span>
        </span>
      ),
    },
    { key: 'trigger', header: t('col.trigger'), secondary: true },
    {
      key: 'active',
      header: t('col.active'),
      optional: true,
      render: (r) => t('activeN', { n: r.activeCount }),
    },
    { key: 'runs', header: t('col.runs'), optional: true, align: 'end' },
    { key: 'failed', header: t('col.failed'), trailing: true, align: 'end' },
  ];
  const actions = (r: AutomationListRow): DataTableAction[] => [
    { label: t('edit'), icon: 'pencil', onClick: () => onEdit(r) },
    { label: t('perBusiness'), icon: 'building-2', onClick: () => onBusinesses(r) },
    { label: t('log'), icon: 'history', onClick: () => onLog(r) },
  ];
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('lead')}
        actions={
          <Button variant="primary" icon="plus" onPress={onNew}>
            {t('new')}
          </Button>
        }
      />
      <div className={styles.axb}>
        <DataTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowActions={actions}
          onRowClick={onEdit}
          labels={labels}
          locale="ro"
        />
      </div>
    </>
  );
}

// ── Constructorul ──────────────────────────────────────────────────────────────────────────

export type BuilderLine = { id: string; title: string; sub?: string; icon: IconName };
export type BuilderOption = { value: string; label: string };

export function AutomationBuilderView({
  mode,
  title,
  name,
  onNameChange,
  nameError,
  trigger,
  triggerOptions,
  onTriggerChange,
  when,
  conditions,
  conditionChoices,
  onAddCondition,
  onRemoveCondition,
  steps,
  stepChoices,
  onAddStep,
  onRemoveStep,
  stepMenuOpen,
  whitelist,
  saving,
  saveFailed,
  onSave,
  onTest,
  onBack,
}: {
  mode: Mode;
  /** „Editează automatizarea” / „Automatizare nouă” */
  title: string;
  name: string;
  onNameChange: (v: string) => void;
  nameError?: boolean;
  trigger: string;
  triggerOptions: BuilderOption[];
  onTriggerChange: (v: string) => void;
  /** „Când”: întârzierea (evenimente), ora (programe) sau pragul (cote). */
  when: {
    label: string;
    value: string;
    options: BuilderOption[];
    onChange: (v: string) => void;
  } | null;
  conditions: BuilderLine[];
  conditionChoices: BuilderOption[];
  onAddCondition: (id: string) => void;
  onRemoveCondition: (id: string) => void;
  steps: BuilderLine[];
  stepChoices: (BuilderOption & { icon: IconName })[];
  onAddStep: (id: string) => void;
  onRemoveStep: (id: string) => void;
  stepMenuOpen?: boolean;
  /** Coloana din dreapta: declanșatoarele și pașii din lista albă. */
  whitelist: { triggers: string[]; steps: string[] };
  saving?: boolean;
  saveFailed?: boolean;
  onSave: () => void;
  onTest: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('founder.automations');
  const ui = useTranslations('ui');
  const mob = mode === 'mobile';
  const more = (onRemove: () => void) => (
    <Menu
      items={[{ id: 'remove', label: t('remove'), icon: 'trash-2', isDanger: true }]}
      onAction={onRemove}
    >
      <IconButton icon="ellipsis-vertical" label={t('more')} />
    </Menu>
  );
  const line = (l: BuilderLine, onRemove: () => void) => (
    <div className={s.field} key={l.id}>
      <Icon icon={l.icon} size={16} />
      <div>
        <p className="body-strong">{l.title}</p>
        {l.sub ? <p className={`caption ${s.muted}`}>{l.sub}</p> : null}
      </div>
      {more(onRemove)}
    </div>
  );
  const main = (
    <div className={s.col}>
      <Sheet>
        <SheetSection>
          <FormField
            label={t('builder.name')}
            isRequired
            error={nameError ? ui('required') : undefined}
          >
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={200} />
          </FormField>
        </SheetSection>
        <SheetSection title={t('builder.trigger')} description={t('builder.triggerHelp')}>
          <div className={mob ? s.rowStack : s.row}>
            <div className={s.triggerMain}>
              <FormField label={t('builder.event')}>
                <Select value={trigger} options={triggerOptions} onChange={onTriggerChange} />
              </FormField>
            </div>
            {when ? (
              <div className={s.triggerWhen}>
                <FormField label={when.label}>
                  <Select value={when.value} options={when.options} onChange={when.onChange} />
                </FormField>
              </div>
            ) : null}
          </div>
        </SheetSection>
        <SheetSection title={t('builder.conditions')} description={t('builder.conditionsHelp')}>
          <div className={s.stack}>
            {conditions.map((c) => line(c, () => onRemoveCondition(c.id)))}
            {conditionChoices.length ? (
              <div>
                <Menu
                  items={conditionChoices.map((c) => ({ id: c.value, label: c.label }))}
                  onAction={onAddCondition}
                >
                  <Button size="sm" variant="secondary" icon="plus">
                    {t('builder.addCondition')}
                  </Button>
                </Menu>
              </div>
            ) : null}
          </div>
        </SheetSection>
        <SheetSection title={t('builder.steps')} description={t('builder.stepsHelp')}>
          <div className={s.stack}>
            {steps.map((st) => line(st, () => onRemoveStep(st.id)))}
            <div>
              <Menu
                defaultOpen={stepMenuOpen}
                header={
                  <p className={`caption ${s.muted} ${s.menuHeader}`}>{t('builder.whitelist')}</p>
                }
                items={stepChoices.map((c) => ({ id: c.value, label: c.label, icon: c.icon }))}
                onAction={onAddStep}
              >
                <Button size="sm" variant="secondary" icon="plus">
                  {t('builder.addStep')}
                </Button>
              </Menu>
            </div>
          </div>
        </SheetSection>
      </Sheet>
      {saveFailed ? <Notice tone="danger">{t('error')}</Notice> : null}
      <div className={s.row}>
        <Button variant="primary" icon="check" block={mob} isPending={saving} onPress={onSave}>
          {t('builder.save')}
        </Button>
        <Button variant="quiet" icon="send" block={mob} onPress={onTest}>
          {t('builder.test')}
        </Button>
      </div>
      <p className={`caption ${s.muted}`}>{t('builder.version')}</p>
    </div>
  );
  const side = (
    <Sheet>
      <SheetSection title={t('builder.whitelist')} description={t('builder.whitelistBody')}>
        <div className={s.stack}>
          <p className="subheading">{t('builder.triggers')}</p>
          <ul className={`${s.hist} body-small`}>
            {whitelist.triggers.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="subheading">{t('builder.stepList')}</p>
          <ul className={`${s.hist} body-small`}>
            {whitelist.steps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </SheetSection>
    </Sheet>
  );
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          {
            label: t('title'),
            href: '#',
            onClick: (e) => {
              e.preventDefault();
              onBack();
            },
          },
        ]}
      />
      <div className={`${s.body} ${mob ? s.bodyM : ''}`}>
        <div className={`${s.grid} ${mob ? s.gridM : ''}`}>
          {main}
          {mob ? <div className={s.pad}>{side}</div> : side}
        </div>
      </div>
    </>
  );
}

// ── Pornită la afaceri ─────────────────────────────────────────────────────────────────────

export type BusinessActivationRow = {
  id: string | number;
  business: string;
  on: boolean;
  /** „Reducere 10%”, „Fără reducere”, „—” */
  setting: string;
  /** „1 nov.”, „—” */
  since: string;
  /** „Bianca Petrașcu a pornit-o pe 1 nov. · motiv: …” (doar pornită) */
  audit?: string;
};

export function AutomationBusinessesView({
  name,
  description,
  rows,
  usage,
  onTurnOn,
  onTurnOff,
  onLog,
  onBack,
}: {
  name: string;
  description?: string;
  rows: BusinessActivationRow[];
  /** UsageMeter-ul mesajelor automate ale unei afaceri (S116-D20, fără plafon în v1). */
  usage?: { label: string; used: number; limit?: number; sentLabel?: string };
  onTurnOn: (row: BusinessActivationRow) => void;
  onTurnOff: (row: BusinessActivationRow) => void;
  onLog: (row: BusinessActivationRow) => void;
  onBack: () => void;
}) {
  const t = useTranslations('founder.automations');
  const hub = useTranslations('automations');
  const labels = useTableLabels();
  const columns: DataTableColumn<BusinessActivationRow>[] = [
    {
      key: 'business',
      header: t('biz.col.business'),
      primary: true,
      render: (r) => (
        <span className={s.nameCell}>
          {r.business}
          {r.on && r.audit ? <span className={`caption ${s.muted}`}>{r.audit}</span> : null}
        </span>
      ),
    },
    { key: 'setting', header: t('biz.col.setting'), optional: true },
    { key: 'since', header: t('biz.col.since'), secondary: true },
    {
      key: 'on',
      header: t('biz.col.state'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={r.on ? 'done' : 'neutral'} icon={r.on ? 'check' : 'circle'}>
          {hub(r.on ? 'on' : 'off')}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: BusinessActivationRow): DataTableAction[] => [
    r.on
      ? { label: t('biz.turnOff'), icon: 'x', onClick: () => onTurnOff(r) }
      : { label: t('biz.turnOn'), icon: 'check', onClick: () => onTurnOn(r) },
    { label: t('log'), icon: 'history', onClick: () => onLog(r) },
  ];
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[
          {
            label: t('title'),
            href: '#',
            onClick: (e) => {
              e.preventDefault();
              onBack();
            },
          },
        ]}
        description={description}
      />
      <div className={styles.axb}>
        <div className={s.stack}>
          <h2 className={`heading ${s.heading}`}>{t('biz.title')}</h2>
          <DataTable
            caption={t('biz.title')}
            columns={columns}
            rows={rows}
            rowActions={actions}
            labels={labels}
            locale="ro"
          />
          {usage ? (
            <UsageMeter
              label={usage.label}
              used={usage.used}
              limit={usage.limit}
              unlimitedLabel={usage.sentLabel}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** „Pornești / Oprești «{name}» pentru {business}?” — „Motiv” obligatoriu, referința opțională. */
export function TurnOnOffDialog({
  on,
  name,
  business,
  reason,
  onReasonChange,
  ticket,
  onTicketChange,
  pending,
  error,
  mob,
  inline,
  onCancel,
  onConfirm,
}: {
  /** true: pornirea; false: oprirea. */
  on: boolean;
  name: string;
  business: string;
  reason: string;
  onReasonChange: (v: string) => void;
  ticket: string;
  onTicketChange: (v: string) => void;
  pending?: boolean;
  /** Mesajul unei încercări refuzate (de ex. peste limita de automatizări active). */
  error?: string | null;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.automations');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t(on ? 'biz.onTitle' : 'biz.offTitle', { name, business })}
      description={t(on ? 'biz.onBody' : 'biz.offBody')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant={on ? 'primary' : 'danger'}
            icon={on ? 'check' : 'x'}
            isPending={pending}
            isDisabled={!reason.trim()}
            onPress={onConfirm}
          >
            {t(on ? 'turnOnShort' : 'turnOffShort')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <FormField label={t('biz.reason')} isRequired hint={t('biz.reasonHelp')}>
          <Textarea
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </FormField>
        <FormField label={t('biz.ticket')} isOptional hint={t('biz.ticketHelp')}>
          <Input value={ticket} maxLength={64} onChange={(e) => onTicketChange(e.target.value)} />
        </FormField>
      </div>
    </Dialog>
  );
}

// ── Jurnalul execuțiilor ───────────────────────────────────────────────────────────────────

export type RunStatus = 'ok' | 'failed' | 'skipped';
export type RunFilter = 'all' | RunStatus;

export type RunRow = {
  id: string | number;
  /** „azi, 13:02” */
  when: string;
  automation: string;
  business: string;
  /** „Elena Georgescu”, „34 de clienți” */
  for: string;
  st: RunStatus;
  /** „E-mail trimis”, „Clientul nu are adresă de e-mail” */
  why: string;
};

const RPILL = {
  ok: ['done', 'check'],
  failed: ['danger', 'circle-x'],
  skipped: ['neutral', 'arrow-right'],
} as const;

export function RunsView({
  mode,
  rows,
  filter,
  onFilterChange,
  onRetry,
  onOpenBusiness,
  onBack,
}: {
  mode: Mode;
  /** Rândurile deja filtrate. */
  rows: RunRow[];
  filter: RunFilter;
  onFilterChange: (f: RunFilter) => void;
  onRetry: (row: RunRow) => void;
  onOpenBusiness: (row: RunRow) => void;
  onBack: () => void;
}) {
  const t = useTranslations('founder.automations');
  const labels = useTableLabels();
  const columns: DataTableColumn<RunRow>[] = [
    { key: 'automation', header: t('runs.col.automation'), primary: true },
    { key: 'business', header: t('runs.col.business'), secondary: true },
    { key: 'for', header: t('runs.col.for'), optional: true },
    { key: 'why', header: t('runs.col.reason'), optional: true, muted: true },
    { key: 'when', header: t('runs.col.when'), secondary: true },
    {
      key: 'st',
      header: t('runs.col.result'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={RPILL[r.st][0]} icon={RPILL[r.st][1]}>
          {t(`runs.st.${r.st}`)}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: RunRow): DataTableAction[] =>
    r.st === 'failed'
      ? [
          { label: t('runs.retry'), icon: 'refresh-cw', onClick: () => onRetry(r) },
          { label: t('openBusiness'), icon: 'building-2', onClick: () => onOpenBusiness(r) },
        ]
      : [{ label: t('openBusiness'), icon: 'building-2', onClick: () => onOpenBusiness(r) }];
  return (
    <>
      <PageHeader
        title={t('runs.title')}
        breadcrumbs={[
          {
            label: t('title'),
            href: '#',
            onClick: (e) => {
              e.preventDefault();
              onBack();
            },
          },
        ]}
      />
      <div className={styles.axb}>
        <div className={s.stack}>
          <div className={`${s.row} ${mode === 'mobile' ? s.pad : ''}`}>
            <SegmentedControl
              aria-label={t('result')}
              value={filter}
              onChange={(v) => onFilterChange(v as RunFilter)}
              options={(['all', 'ok', 'failed', 'skipped'] as const).map((v) => ({
                value: v,
                label: t(`runs.${v}`),
              }))}
            />
          </div>
          {rows.length ? (
            <DataTable
              caption={t('runs.title')}
              columns={columns}
              rows={rows}
              rowActions={actions}
              labels={labels}
              locale="ro"
            />
          ) : (
            <EmptyState icon="history" title={t('runs.empty')} />
          )}
        </div>
      </div>
    </>
  );
}
