'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Notice,
  PageHeader,
  SegmentedControl,
  StatusPill,
  Textarea,
  type DataTableAction,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../BusinessesView';
import styles from '../business.module.css';
import s from './commercial.module.css';

/* FounderRequests (Lotul 3.4, S111, doar română): „Cereri din Hub” — „Cere activare” (un pachet
   „la cerere”, orice pachet fără card salvat, o aplicație) și „Cere alt abonament”. „Noi · {n}” /
   „Toate”; „Marchează rezolvată” după schimbarea făcută în pagina afacerii; „Refuză…” cu motiv,
   pe care cel care a cerut îl vede în notificarea din Hub. */

export type RequestStatus = 'new' | 'resolved' | 'refused';

export type RequestRow = {
  id: string | number;
  business: string;
  type: 'activation' | 'plan';
  /** „Domeniu propriu pentru pagina de rezervări”, „Business Plus” */
  item: string;
  /** „Andrei Mureșan (proprietar)” */
  who: string;
  /** „azi, 10:12”, „27 oct.” */
  when: string;
  status: RequestStatus;
};

const PILL = {
  new: ['attention', 'circle-dot'],
  resolved: ['done', 'check'],
  refused: ['neutral', 'x'],
} as const;

export function RequestsView({
  rows,
  filter,
  onFilterChange,
  newCount,
  onOpen,
  onResolve,
  onRefuse,
}: {
  /** Rândurile deja filtrate. */
  rows: RequestRow[];
  filter: 'new' | 'all';
  onFilterChange: (f: 'new' | 'all') => void;
  newCount: number;
  onOpen: (row: RequestRow) => void;
  onResolve: (row: RequestRow) => void;
  onRefuse: (row: RequestRow) => void;
}) {
  const t = useTranslations('founder.requests');
  const labels = useTableLabels();
  const columns: DataTableColumn<RequestRow>[] = [
    { key: 'business', header: t('col.business'), primary: true },
    {
      key: 'what',
      header: t('col.what'),
      secondary: true,
      render: (r) => (
        <span>
          <span className="body-strong">{t(`type.${r.type}`)}</span> · {r.item}
        </span>
      ),
    },
    { key: 'who', header: t('col.who'), optional: true, muted: true },
    { key: 'when', header: t('col.when'), secondary: true },
    {
      key: 'status',
      header: t('col.status'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={PILL[r.status][0]} icon={PILL[r.status][1]}>
          {t(`status.${r.status}`)}
        </StatusPill>
      ),
    },
  ];
  const actions = (r: RequestRow): DataTableAction[] =>
    r.status === 'new'
      ? [
          { label: t('action.open'), icon: 'building-2', onClick: () => onOpen(r) },
          { label: t('action.resolve'), icon: 'check', onClick: () => onResolve(r) },
          { separator: true },
          { label: t('action.refuse'), icon: 'x', destructive: true, onClick: () => onRefuse(r) },
        ]
      : [{ label: t('action.open'), icon: 'building-2', onClick: () => onOpen(r) }];
  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <div className={styles.axb}>
        <div className={s.stack}>
          <div>
            <SegmentedControl
              aria-label={t('filter')}
              value={filter}
              onChange={(v) => onFilterChange(v as 'new' | 'all')}
              options={[
                {
                  value: 'new',
                  label: newCount ? `${t('filterNew')} · ${newCount}` : t('filterNew'),
                },
                { value: 'all', label: t('filterAll') },
              ]}
            />
          </div>
          {rows.length ? (
            <DataTable
              caption={t('title')}
              columns={columns}
              rows={rows}
              rowActions={actions}
              labels={labels}
              locale="ro"
            />
          ) : (
            <EmptyState icon="inbox" title={t('emptyTitle')} description={t('emptyBody')} />
          )}
        </div>
      </div>
    </>
  );
}

/** „Refuzi cererea de la {business}?” — cu ce s-a cerut și „Motiv” (obligatoriu, cel mult 1.000). */
export function RefuseRequestDialog({
  business,
  what,
  name,
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
  /** „Cere alt abonament · Business Plus · Ioana Pavel · ieri, 17:40” */
  what: string;
  name: string;
  reason: string;
  onReasonChange: (v: string) => void;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.requests.refuse');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('title', { business })}
      description={what}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            icon="x"
            isPending={pending}
            isDisabled={!reason.trim()}
            onPress={onConfirm}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed && <Notice tone="danger">{t('error')}</Notice>}
        <FormField
          label={t('reason')}
          isRequired
          hint={t('reasonHelp', { name })}
          counter={t('counter', { n: reason.length })}
        >
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
