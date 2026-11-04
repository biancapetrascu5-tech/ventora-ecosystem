'use client';

import { useTranslations } from 'next-intl';
import {
  AppIcon,
  Button,
  DataTable,
  EmptyState,
  FileUpload,
  FormField,
  Input,
  Notice,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  Textarea,
  cn,
  type DataTableColumn,
  type FileUploadLabels,
  type UploadFile,
} from '@ventora/ui';
import { useTableLabels } from '../founder/BusinessesView';
import { SUPPORT_ACCEPT, SUPPORT_MAX_BYTES } from './parts';
import s from './support.module.css';

/* HubSupport (S111, Lot 4.6): „Solicitările mele” and „Solicitare nouă”. Two panes on desktop,
   stacked on tablet; on phones the list and the form are separate screens. S-1: the owner and
   the admins see every request of the business („Solicitările afacerii”, with „Trimisă de”). */

export type HubStatusKey = 'newReply' | 'inProgress' | 'resolved';

export const HUB_PILL: Record<
  HubStatusKey,
  ['attention' | 'neutral' | 'done', 'message-square' | 'clock' | 'check']
> = {
  newReply: ['attention', 'message-square'],
  inProgress: ['neutral', 'clock'],
  resolved: ['done', 'check'],
};

export type HubSupportRow = {
  id: string;
  ref: string;
  subject: string;
  /** The application id (`platform` = Hub) and its name. */
  app: string;
  appName: string;
  /** „acum 20 min”, „ieri”, „12 oct.” */
  updated: string;
  status: HubStatusKey;
  /** S-1: who sent it (only in the owner's and the admins' list). */
  from?: string;
};

export type NewRequestValues = {
  applicationId: string;
  subject: string;
  description: string;
  urgency: 'normal' | 'blocking';
};

export type NewRequestErrors = Partial<Record<'subject' | 'description' | 'send', boolean>>;

export function useUploadLabels(): FileUploadLabels {
  const t = useTranslations('ui.upload');
  return {
    dropFiles: t('dropFiles'),
    dropNow: t('dropNow'),
    browse: t('browse'),
    maxSize: (size) => t('maxSize', { size }),
    uploaded: t('uploaded'),
    retry: t('retry'),
    remove: t('remove'),
  };
}

export function NewRequestForm({
  apps,
  values,
  errors = {},
  onChange,
  files,
  onFiles,
  onRemoveFile,
  onRetryFile,
  pending,
  onSubmit,
  locale,
}: {
  /** `platform` first („Hub (cont, abonament, echipă)”), then the 15 applications. */
  apps: { value: string; label: string }[];
  values: NewRequestValues;
  errors?: NewRequestErrors;
  onChange: (v: NewRequestValues) => void;
  files: UploadFile[];
  onFiles: (files: File[]) => void;
  onRemoveFile: (f: UploadFile) => void;
  onRetryFile: (f: UploadFile) => void;
  pending?: boolean;
  onSubmit: () => void;
  locale?: string;
}) {
  const t = useTranslations('support');
  const ui = useTranslations('ui');
  const upload = useUploadLabels();
  const set = (patch: Partial<NewRequestValues>) => onChange({ ...values, ...patch });
  return (
    <form
      className={s.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {errors.send ? <Notice tone="danger">{t('error.send')}</Notice> : null}
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('new.app')}
        isRequired
        hint={t('new.appHelp')}
      >
        <Select
          options={apps}
          value={values.applicationId}
          onChange={(v) => set({ applicationId: v })}
        />
      </FormField>
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('new.subject')}
        isRequired
        error={errors.subject ? t('new.error.required') : undefined}
      >
        <Input
          placeholder={t('new.subjectPlaceholder')}
          maxLength={200}
          value={values.subject}
          isInvalid={errors.subject}
          onChange={(e) => set({ subject: e.target.value })}
        />
      </FormField>
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('new.what')}
        isRequired
        hint={errors.description ? undefined : t('new.whatHelp')}
        error={errors.description ? t('new.error.required') : undefined}
      >
        <Textarea
          rows={4}
          maxLength={5000}
          value={values.description}
          isInvalid={errors.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </FormField>
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('new.urgency')}
        hint={t('new.urgencyHelp')}
      >
        <div>
          <SegmentedControl
            aria-label={t('new.urgencyLabel')}
            block
            value={values.urgency}
            onChange={(v) => set({ urgency: v as 'normal' | 'blocking' })}
            options={[
              { value: 'normal', label: t('new.normal') },
              { value: 'blocking', label: t('new.blocking') },
            ]}
          />
        </div>
      </FormField>
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('attachments')}
        isOptional
      >
        <FileUpload
          multiple
          accept={SUPPORT_ACCEPT}
          maxSize={SUPPORT_MAX_BYTES}
          hint={t('attachmentsHint')}
          files={files}
          onSelect={onFiles}
          onRemove={onRemoveFile}
          onRetry={onRetryFile}
          labels={upload}
          locale={locale}
        />
      </FormField>
      <Button variant="primary" icon="send" type="submit" size="lg" block isPending={pending}>
        {t('new.send')}
      </Button>
    </form>
  );
}

export function HubSupportView({
  layout,
  rows,
  manager,
  form,
  onOpen,
  onNew,
}: {
  /** desktop: two panes; tablet: stacked; phone-list / phone-form: separate screens. */
  layout: 'desktop' | 'tablet' | 'phone-list' | 'phone-form';
  rows: HubSupportRow[];
  manager?: boolean;
  /** The NewRequestForm (desktop, tablet, phone-form). */
  form: React.ReactNode;
  onOpen: (row: HubSupportRow) => void;
  /** Phone: „Solicitare nouă” opens the form screen. */
  onNew?: () => void;
}) {
  const t = useTranslations('support');
  const labels = useTableLabels();
  const phone = layout === 'phone-list' || layout === 'phone-form';
  const listTitle = manager ? t('list.titleBusiness') : t('list.title');
  const columns: DataTableColumn<HubSupportRow>[] = [
    { key: 'subject', header: t('list.col.subject'), primary: true },
    {
      key: 'app',
      header: t('list.col.app'),
      secondary: true,
      render: (r) => (
        <span className={s.app}>
          <AppIcon app={r.app === 'platform' ? undefined : r.app} icon="house" size={16} />
          {r.appName}
        </span>
      ),
    },
    ...(manager
      ? [
          {
            key: 'from',
            header: t('list.col.from'),
            optional: true,
            muted: true,
          } as DataTableColumn<HubSupportRow>,
        ]
      : []),
    { key: 'updated', header: t('list.col.updated'), secondary: true },
    {
      key: 'status',
      header: t('list.col.status'),
      trailing: true,
      render: (r) => (
        <StatusPill tone={HUB_PILL[r.status][0]}>{t(`status.${r.status}`)}</StatusPill>
      ),
    },
  ];
  const list = rows.length ? (
    <DataTable
      caption={listTitle}
      columns={columns}
      rows={rows}
      onRowClick={onOpen}
      labels={labels}
    />
  ) : (
    <EmptyState icon="life-buoy" title={t('empty.title')} description={t('empty.body')} />
  );
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('lead')}
        actions={
          layout === 'phone-list' && onNew ? (
            <Button variant="primary" icon="plus" onPress={onNew}>
              {t('new.title')}
            </Button>
          ) : null
        }
      />
      {phone ? (
        <div className={s.bodyMob}>
          {layout === 'phone-list' ? (
            list
          ) : (
            <Sheet>
              <SheetSection title={t('new.title')}>{form}</SheetSection>
            </Sheet>
          )}
        </div>
      ) : (
        <div className={s.listBody}>
          <div className={cn(s.sup, layout === 'tablet' && s.supStacked)}>
            <div>
              <h2 className={cn('heading', s.listTitle)}>{listTitle}</h2>
              {list}
            </div>
            <Sheet>
              <SheetSection title={t('new.title')}>{form}</SheetSection>
            </Sheet>
          </div>
        </div>
      )}
    </>
  );
}
