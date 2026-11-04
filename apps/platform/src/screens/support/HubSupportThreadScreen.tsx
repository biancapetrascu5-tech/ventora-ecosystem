'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Toast, type IconName } from '@ventora/ui';
import {
  HubSupportThreadView,
  fileIcon,
  sizeLabel,
  supportStyles as s,
  useDates,
  useIsPhone,
  useSupportUploads,
  useWhen,
  type SupportHistoryData,
  type SupportMessageData,
} from '@ventora/screens';
import {
  finishSupportAttachment,
  sendSupportReply,
  startSupportAttachment,
  type SupportThreadData,
} from '@/server/support-request-actions';
import { useAppName } from './HubSupportScreen';

/* HubSupportThread (Lotul 4.6): o solicitare. „Tu” pentru mesajele persoanei, numele celorlalți
   (S-1: owner-ul și adminii văd și solicitările altora), „Echipa Ventora Systems” pe răspunsurile
   echipei. Trimis → Toast „Am primit mesajul.” și starea trece în „În lucru”; o solicitare
   rezolvată se redeschide cu „Ce s-a întâmplat din nou?”. */

const HISTORY_ICON: Record<string, IconName> = {
  opened: 'circle-dot',
  marked_in_progress: 'clock',
  business_reply: 'clock',
  team_reply: 'message-square',
  closed: 'check',
  auto_closed: 'check',
  reopened: 'rotate-ccw',
};

export function HubSupportThreadScreen({ data }: { data: SupportThreadData }) {
  const router = useRouter();
  const t = useTranslations('support');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const when = useWhen();
  const dates = useDates();
  const mob = useIsPhone();
  const appName = useAppName();
  const [text, setText] = useState('');
  const [emptyError, setEmptyError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [pending, setPending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [toast, setToast] = useState<null | 'sent' | 'reopened'>(null);
  const uploads = useSupportUploads({
    start: (file) => startSupportAttachment(data.requestId, file),
    finish: (fileId) => finishSupportAttachment(fileId),
    errors: {
      type: (file) => t('thread.error.type', { file }),
      size: (file) => t('thread.error.size', { file }),
      failed: (file) => t('error.upload', { file }),
    },
  });

  const me = (id: string | null) => id === data.userId;
  const messages: SupportMessageData[] = data.messages.map((m) => ({
    id: m.id,
    team: m.authorType === 'team',
    name: m.authorType === 'business' && me(m.authorId) ? t('thread.you') : m.authorName,
    avatarName: m.authorName,
    badge: m.authorType === 'team' ? t('thread.team') : undefined,
    time: when(new Date(m.createdAt)),
    body: m.body,
    files: m.attachments.map((a) => ({
      id: a.fileId,
      name: a.name,
      size: sizeLabel(a.sizeBytes, locale),
      icon: fileIcon(a.contentType),
      href: a.href,
    })),
  }));

  // the last team member who acted: the name on „În lucru · {name}” after the business answers
  const historyText = (h: SupportThreadData['history'][number], index: number): string => {
    const name = h.actorName ?? '';
    switch (h.kind) {
      case 'opened':
        return me(h.actorId) ? t('thread.h.opened') : t('thread.h.openedBy', { name });
      case 'reopened':
        return me(h.actorId) ? t('thread.h.reopened') : t('thread.h.reopenedBy', { name });
      case 'team_reply':
        return t('thread.h.newReply', { name });
      case 'closed':
        return t('thread.h.resolved', { name });
      case 'auto_closed':
        return t('thread.h.autoClosed');
      case 'business_reply': {
        const team = data.history.slice(index + 1).find((x) => x.actorType === 'team');
        return t('thread.h.inProgress', { name: team?.actorName ?? name });
      }
      default:
        return t('thread.h.inProgress', { name });
    }
  };
  const history: SupportHistoryData[] = data.history.map((h, i) => ({
    icon: HISTORY_ICON[h.kind] ?? 'circle-dot',
    text: historyText(h, i),
    time: when(new Date(h.createdAt)),
  }));

  const resolved = data.request.hubStatus === 'resolved';

  async function send() {
    if (!text.trim()) {
      setEmptyError(true);
      return;
    }
    if (uploads.busy) return;
    setPending(true);
    const res = await sendSupportReply(data.request.ref, {
      body: text,
      fileIds: uploads.fileIds,
      reopen: resolved,
    });
    setPending(false);
    if (!res.ok) {
      setSendError(true);
      return;
    }
    setText('');
    uploads.reset();
    setReopening(false);
    setToast(resolved ? 'reopened' : 'sent');
    router.refresh();
  }

  return (
    <>
      <HubSupportThreadView
        mob={mob}
        subject={data.request.subject}
        status={data.request.hubStatus}
        meta={t('thread.meta', {
          app: appName(data.request.applicationId),
          date: dates.day(new Date(data.request.createdAt)),
          ref: data.request.ref,
        })}
        messages={messages}
        history={history}
        composer={{ text, files: uploads.files, emptyError, sendError, pending }}
        handlers={{
          onText: (v) => {
            setText(v);
            if (v.trim()) setEmptyError(false);
            setSendError(false);
          },
          onFiles: uploads.onSelect,
          onRemoveFile: uploads.onRemove,
          onRetryFile: uploads.onRetry,
          onSend: () => void send(),
        }}
        reopening={reopening}
        onReopen={() => setReopening(true)}
        onCancelReopen={() => {
          setReopening(false);
          setText('');
          setEmptyError(false);
          uploads.reset();
        }}
        onBack={() => router.push('/support')}
        locale={locale}
      />
      {toast ? (
        <div className={mob ? `${s.toast} ${s.toastMob}` : s.toast}>
          <Toast
            tone="done"
            title={toast === 'reopened' ? t('thread.reopened') : t('sent.title')}
            description={toast === 'sent' ? t('sent.body') : undefined}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      ) : null}
    </>
  );
}
