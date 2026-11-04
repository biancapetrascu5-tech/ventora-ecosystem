'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Toast } from '@ventora/ui';
import {
  FounderSupportThreadView,
  fileIcon,
  sizeLabel,
  supportStyles as s,
  useDates,
  useIsPhone,
  useSupportUploads,
  useWhen,
  type SupportMessageData,
} from '@ventora/screens';
import {
  closeRequest,
  finishTeamAttachment,
  markRequestInProgress,
  sendTeamReply,
  startTeamAttachment,
  type FounderThreadData,
} from '@/server/support-inbox-actions';
import { FounderShell } from '../shell/FounderShell';
import { founderGroupOf, useFounderAppName } from './SupportInboxScreen';

/* FounderSupportInbox · solicitarea (Lotul 4.6): firul, „Răspunsul echipei” (apare în Hub ca
   „Răspuns nou” și pleacă pe e-mail, E-7), „Trimite și închide”, starea și afacerea. */

export function SupportThreadScreen({
  user,
  data,
}: {
  user: { name: string };
  data: FounderThreadData;
}) {
  const router = useRouter();
  const t = useTranslations('founder.inbox');
  const ui = useTranslations('ui');
  const hub = useTranslations('support');
  const when = useWhen();
  const dates = useDates();
  const mob = useIsPhone();
  const appName = useFounderAppName();
  const r = data.request;
  const [text, setText] = useState('');
  const [emptyError, setEmptyError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [pending, setPending] = useState<null | 'send' | 'close'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const uploads = useSupportUploads({
    start: (file) => startTeamAttachment(r.organizationId, r.id, file),
    finish: (fileId) => finishTeamAttachment(r.organizationId, fileId),
    errors: {
      type: (file) => t('error.type', { file }),
      size: (file) => t('error.size', { file }),
      failed: (file) => t('error.upload', { file }),
    },
  });

  const role = (userId: string) => (userId === data.business.ownerUserId ? t('role.owner') : null);
  const messages: SupportMessageData[] = data.messages.map((m) => {
    const memberRole = m.authorType === 'business' ? role(m.authorId) : null;
    return {
      id: m.id,
      team: m.authorType === 'team',
      name: m.authorName,
      avatarName: m.authorName,
      badge:
        m.authorType === 'team'
          ? hub('thread.team')
          : memberRole
            ? t('fromRole', { business: data.business.name, role: memberRole })
            : data.business.name,
      time: when(new Date(m.createdAt)),
      body: m.body,
      files: m.attachments.map((a) => ({
        id: a.fileId,
        name: a.name,
        size: sizeLabel(a.sizeBytes, 'ro'),
        icon: fileIcon(a.contentType),
        href: a.href,
      })),
    };
  });
  const requesterRole = role(r.requesterUserId);

  async function reply(close: boolean) {
    if (!text.trim()) {
      setEmptyError(true);
      return;
    }
    if (uploads.busy) return;
    setPending(close ? 'close' : 'send');
    const res = await sendTeamReply({
      organizationId: r.organizationId,
      requestId: r.id,
      body: text,
      fileIds: uploads.fileIds,
      close,
    });
    setPending(null);
    if (!res.ok) {
      setSendError(true);
      return;
    }
    setText('');
    uploads.reset();
    setToast(close ? t('closed', { name: r.requesterName }) : t('sent', { name: r.requesterName }));
    router.refresh();
  }

  async function status(action: 'progress' | 'close') {
    const res =
      action === 'progress'
        ? await markRequestInProgress(r.organizationId, r.id)
        : await closeRequest(r.organizationId, r.id);
    setToast(
      !res.ok
        ? t('error.status')
        : action === 'progress'
          ? t('markedProgress')
          : t('closed', { name: r.requesterName }),
    );
    router.refresh();
  }

  return (
    <FounderShell active="suport" title={t('nav')} user={user}>
      <FounderSupportThreadView
        mob={mob}
        subject={r.subject}
        status={founderGroupOf(r.status)}
        blocking={r.urgency === 'blocking'}
        meta={t('meta', {
          business: data.business.name,
          app: appName(r.applicationId),
          date: dates.day(new Date(r.createdAt)),
          ref: r.ref,
        })}
        messages={messages}
        side={{
          business: data.business.name,
          owner: data.business.ownerName ?? '—',
          plan: data.business.planName
            ? t('planMembers', { plan: data.business.planName, n: data.business.memberCount })
            : t('noPlan'),
          sentBy: requesterRole
            ? t('sentBy', { name: r.requesterName, role: requesterRole })
            : r.requesterName,
        }}
        requesterName={r.requesterName}
        composer={{
          text,
          files: uploads.files,
          emptyError,
          sendError,
          pending: pending === 'send',
        }}
        handlers={{
          onText: (v) => {
            setText(v);
            if (v.trim()) setEmptyError(false);
            setSendError(false);
          },
          onFiles: uploads.onSelect,
          onRemoveFile: uploads.onRemove,
          onRetryFile: uploads.onRetry,
          onSend: () => void reply(false),
        }}
        closingPending={pending === 'close'}
        autoClosed={r.status === 'closed' && r.closedByType === 'system'}
        onSendClose={() => void reply(true)}
        onMarkProgress={() => void status('progress')}
        onCloseRequest={() => void status('close')}
        onOpenBusiness={() => router.push(`/businesses/${r.organizationId}`)}
        onOpenSession={() =>
          router.push(`/businesses/${r.organizationId}?session=${encodeURIComponent(r.ref)}`)
        }
        onBack={() => router.push('/support')}
      />
      {toast ? (
        <div className={mob ? `${s.toast} ${s.toastMob}` : s.toast}>
          <Toast
            tone="done"
            title={toast}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      ) : null}
    </FounderShell>
  );
}
