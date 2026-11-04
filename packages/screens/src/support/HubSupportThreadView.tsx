'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  FileUpload,
  FormField,
  Icon,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  StatusPill,
  Textarea,
  cn,
  type UploadFile,
} from '@ventora/ui';
import { HUB_PILL, useUploadLabels, type HubStatusKey } from './HubSupportView';
import {
  SUPPORT_ACCEPT,
  SUPPORT_MAX_BYTES,
  SupportHistory,
  SupportMsg,
  type SupportHistoryData,
  type SupportMessageData,
} from './parts';
import s from './support.module.css';

/* HubSupportThread (S111, S116, Lot 4.6): one request — the thread oldest first, „Răspunsul tău”
   with attachments and „Îți răspundem aici și pe e-mail.”, or, when solved, the reopening with
   „Ce s-a întâmplat din nou?”. „Istoricul stării” beside the thread, under it on phones. */

export type ComposerState = {
  text: string;
  files: UploadFile[];
  /** „Scrie un mesaj înainte să trimiți.” */
  emptyError?: boolean;
  sendError?: boolean;
  pending?: boolean;
};

export type ComposerHandlers = {
  onText: (v: string) => void;
  onFiles: (files: File[]) => void;
  onRemoveFile: (f: UploadFile) => void;
  onRetryFile: (f: UploadFile) => void;
  onSend: () => void;
};

export function HubSupportThreadView({
  mob,
  subject,
  status,
  meta,
  messages,
  history,
  composer,
  handlers,
  reopening,
  onReopen,
  onCancelReopen,
  onBack,
  locale,
}: {
  mob?: boolean;
  subject: string;
  status: HubStatusKey;
  /** „EasyBook · deschisă pe 27 oct. · VS-2026-0142” */
  meta: string;
  messages: SupportMessageData[];
  history: SupportHistoryData[];
  composer: ComposerState;
  handlers: ComposerHandlers;
  /** A solved request: false → the note and „Redeschide solicitarea”; true → the reopen form. */
  reopening?: boolean;
  onReopen: () => void;
  onCancelReopen: () => void;
  onBack: () => void;
  locale?: string;
}) {
  const t = useTranslations('support');
  const ui = useTranslations('ui');
  const upload = useUploadLabels();
  const resolved = status === 'resolved';
  const field = (label: string, required: boolean, hint?: string) => (
    <FormField
      requiredLabel={ui('required')}
      optionalLabel={ui('optional')}
      label={label}
      isRequired={required}
      hint={composer.emptyError ? undefined : hint}
      error={composer.emptyError ? t('thread.error.empty') : undefined}
    >
      <Textarea
        rows={mob ? 4 : 3}
        maxLength={5000}
        value={composer.text}
        isInvalid={composer.emptyError}
        onChange={(e) => handlers.onText(e.target.value)}
      />
    </FormField>
  );
  const attachments = (
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
        files={composer.files}
        onSelect={handlers.onFiles}
        onRemove={handlers.onRemoveFile}
        onRetry={handlers.onRetryFile}
        labels={upload}
        locale={locale}
      />
    </FormField>
  );

  let bottom: React.ReactNode;
  if (resolved && !reopening) {
    bottom = (
      <div className={s.compose}>
        <div className={s.note}>
          <Icon icon="circle-check" size={16} />
          <p className="body">{t('thread.resolvedNote')}</p>
        </div>
        <div>
          <Button icon="rotate-ccw" block={mob} onPress={onReopen}>
            {t('thread.reopen')}
          </Button>
        </div>
      </div>
    );
  } else if (resolved) {
    bottom = (
      <div className={s.compose}>
        {composer.sendError ? <Notice tone="danger">{t('error.send')}</Notice> : null}
        {field(t('thread.reopenLabel'), true, t('thread.reopenHelp'))}
        {attachments}
        <div className={s.row}>
          <Button
            variant="primary"
            icon="rotate-ccw"
            block={mob}
            isPending={composer.pending}
            onPress={handlers.onSend}
          >
            {t('thread.reopenSubmit')}
          </Button>
          <Button variant="quiet" block={mob} onPress={onCancelReopen}>
            {t('thread.cancel')}
          </Button>
        </div>
      </div>
    );
  } else {
    bottom = (
      <div className={s.compose}>
        {composer.sendError ? <Notice tone="danger">{t('error.send')}</Notice> : null}
        {field(t('thread.reply'), false)}
        {attachments}
        <div>
          <Button
            variant="primary"
            icon="send"
            block={mob}
            isPending={composer.pending}
            aria-label={composer.pending ? t('thread.sending') : undefined}
            onPress={handlers.onSend}
          >
            {t('thread.send')}
          </Button>
        </div>
        <p className={cn(s.note, 'body-small')}>
          <Icon icon="mail" size={16} />
          {t('thread.replyNote')}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={subject}
        breadcrumbs={[
          {
            label: t('list.title'),
            href: '/support',
            onClick: (e) => {
              e.preventDefault();
              onBack();
            },
          },
        ]}
        meta={
          <span className={s.meta}>
            <StatusPill tone={HUB_PILL[status][0]} icon={HUB_PILL[status][1]}>
              {t(`status.${status}`)}
            </StatusPill>
            <span className="body-small muted">{meta}</span>
          </span>
        }
      />
      <div className={mob ? s.bodyMob : s.body}>
        <div className={cn(s.grid, mob && s.gridMob)}>
          <div className={s.thread}>
            {messages.map((m) => (
              <SupportMsg
                key={m.id}
                m={m}
                mob={mob}
                downloadLabel={(file) => t('thread.download', { file })}
              />
            ))}
            <Sheet className={mob ? s.sheetMob : undefined}>
              <SheetSection>{bottom}</SheetSection>
            </Sheet>
          </div>
          <SupportHistory title={t('thread.history')} items={history} mob={mob} />
        </div>
      </div>
    </>
  );
}
