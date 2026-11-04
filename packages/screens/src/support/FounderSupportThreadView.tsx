'use client';

import { useTranslations } from 'next-intl';
import {
  Badge,
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
} from '@ventora/ui';
import { useUploadLabels } from './HubSupportView';
import type { ComposerHandlers, ComposerState } from './HubSupportThreadView';
import { FOUNDER_PILL, type FounderGroup } from './FounderSupportInboxView';
import { SUPPORT_ACCEPT, SUPPORT_MAX_BYTES, SupportMsg, type SupportMessageData } from './parts';
import s from './support.module.css';

/* FounderSupportInbox · solicitarea (S116, Lot 4.6, doar română): firul afacerii și al echipei,
   „Răspunsul echipei” cu atașamente, „Trimite răspunsul” / „Trimite și închide”; alături, afacerea
   (proprietar, abonament, cine a trimis, „Deschide afacerea”, „Deschide o sesiune de suport”) și
   starea („Marchează „În lucru””, „Închide solicitarea”). */

export type FounderThreadSide = {
  business: string;
  owner: string;
  plan: string;
  sentBy: string;
};

export function FounderSupportThreadView({
  mob,
  subject,
  status,
  blocking,
  meta,
  messages,
  side,
  requesterName,
  composer,
  handlers,
  closingPending,
  autoClosed,
  onSendClose,
  onMarkProgress,
  onCloseRequest,
  onOpenBusiness,
  onOpenSession,
  onBack,
}: {
  mob?: boolean;
  subject: string;
  status: FounderGroup;
  blocking: boolean;
  /** „Salon Aurora · EasyBook · deschisă pe 4 nov. · VS-2026-0187” */
  meta: string;
  messages: SupportMessageData[];
  side: FounderThreadSide;
  /** „Apare în Hub, în solicitare, și pleacă pe e-mail la {name}.” */
  requesterName: string;
  composer: ComposerState;
  handlers: ComposerHandlers;
  closingPending?: boolean;
  /** Closed by the job after 7 days without an answer (S116-D18). */
  autoClosed?: boolean;
  onSendClose: () => void;
  onMarkProgress: () => void;
  onCloseRequest: () => void;
  onOpenBusiness: () => void;
  onOpenSession: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('founder.inbox');
  const ui = useTranslations('ui');
  const upload = useUploadLabels();
  const closed = status === 'closed';
  const pill = (
    <StatusPill tone={FOUNDER_PILL[status][0]} icon={FOUNDER_PILL[status][1]}>
      {t(`status.${status}`)}
    </StatusPill>
  );
  const compose = closed ? (
    <div className={s.note}>
      <Icon icon="circle-check" size={16} />
      <p className="body">{autoClosed ? t('closedAuto') : t('closedNote')}</p>
    </div>
  ) : (
    <div className={s.compose}>
      {composer.sendError ? <Notice tone="danger">{t('error.send')}</Notice> : null}
      <FormField
        requiredLabel={ui('required')}
        optionalLabel={ui('optional')}
        label={t('reply')}
        hint={composer.emptyError ? undefined : t('replyHelp', { name: requesterName })}
        error={composer.emptyError ? t('error.empty') : undefined}
      >
        <Textarea
          rows={4}
          maxLength={5000}
          value={composer.text}
          isInvalid={composer.emptyError}
          onChange={(e) => handlers.onText(e.target.value)}
        />
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
          hint={t('attachHint')}
          files={composer.files}
          onSelect={handlers.onFiles}
          onRemove={handlers.onRemoveFile}
          onRetry={handlers.onRetryFile}
          labels={upload}
          locale="ro"
        />
      </FormField>
      <div className={s.row}>
        <Button
          variant="primary"
          icon="send"
          block={mob}
          isPending={composer.pending}
          isDisabled={closingPending}
          onPress={handlers.onSend}
        >
          {t('send')}
        </Button>
        <Button
          variant="secondary"
          icon="check"
          block={mob}
          isPending={closingPending}
          isDisabled={composer.pending}
          onPress={onSendClose}
        >
          {t('sendClose')}
        </Button>
      </div>
    </div>
  );
  return (
    <>
      <PageHeader
        title={subject}
        breadcrumbs={[
          {
            label: t('back'),
            href: '/support',
            onClick: (e) => {
              e.preventDefault();
              onBack();
            },
          },
        ]}
        meta={
          <span className={s.meta}>
            {pill}
            {blocking ? <Badge tone="attention">{t('blocking')}</Badge> : null}
            <span className="body-small muted">{meta}</span>
          </span>
        }
      />
      <div className={mob ? s.bodyMob : s.body}>
        <div className={cn(s.grid, mob ? s.gridMob : s.gridWide)}>
          <div className={s.thread}>
            {messages.map((m) => (
              <SupportMsg key={m.id} m={m} downloadLabel={(file) => t('download', { file })} />
            ))}
            <Sheet className={mob ? s.sheetMob : undefined}>
              <SheetSection>{compose}</SheetSection>
            </Sheet>
          </div>
          <Sheet className={mob ? s.sheetMob : undefined}>
            <SheetSection title={t('client')}>
              <dl className={s.kv}>
                <dt className="caption">{t('client')}</dt>
                <dd className="body">{side.business}</dd>
                <dt className="caption">{t('side.owner')}</dt>
                <dd className="body">{side.owner}</dd>
                <dt className="caption">{t('side.plan')}</dt>
                <dd className="body">{side.plan}</dd>
                <dt className="caption">{t('side.sent')}</dt>
                <dd className="body">{side.sentBy}</dd>
              </dl>
              <div className={s.sideActions}>
                <Button size="sm" variant="secondary" icon="building-2" onPress={onOpenBusiness}>
                  {t('side.openBiz')}
                </Button>
                <Button size="sm" variant="quiet" icon="life-buoy" onPress={onOpenSession}>
                  {t('side.session')}
                </Button>
              </div>
            </SheetSection>
            <SheetSection title={t('side.status')}>
              <div className={s.stack}>
                <div>{pill}</div>
                {closed ? null : (
                  <div className={s.row}>
                    {status === 'open' ? (
                      <Button size="sm" variant="secondary" icon="clock" onPress={onMarkProgress}>
                        {t('side.markProgress')}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" icon="check" onPress={onCloseRequest}>
                      {t('side.close')}
                    </Button>
                  </div>
                )}
                <p className="caption muted">{t('map')}</p>
              </div>
            </SheetSection>
          </Sheet>
        </div>
      </div>
    </>
  );
}
