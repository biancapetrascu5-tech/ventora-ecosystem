'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookingMessagesView,
  BookingSettingsHeader,
  EmailPreview,
  MessageEditorDrawer,
  SETTINGS_TABS_S127,
  SettingsToast,
  TEMPLATE_LIMITS,
  TEMPLATE_VARS,
  unknownVariables,
  type MessageId,
  type MessageRow,
  type TemplateKind,
} from '@ventora/booking/ui';
import type { ClientEmailParts, ClientLocale } from '@ventora/booking';
import {
  previewTemplate,
  readTemplate,
  resetTemplate,
  saveTemplate,
  setMessageOn,
  type MessagesActionError,
  type MessagesPageData,
} from '@/server/booking-messages-actions';
import { useMode } from './useMode';

/* Lot B.14b — EasyBook · Setări · „Mesaje” (BookingMessageTemplates, S127): the state and the
   actions of the page. The screen is in modules/booking/src/ui (the same components as the gallery).
   The application lists the client e-mails that exist (B.13 / B.14); the team notices (B.15), the
   review request (B.16) and the SMS (B.17) come with their lots. The text is edited in the language
   of the Hub (NECESITĂ DESIGN: choosing another language); when it leaves stays fixed until B.14c. */

const KIND: Partial<Record<MessageId, TemplateKind>> = {
  confirm: 'confirmation',
  reminder: 'reminder',
  changed: 'change',
  cancelled: 'cancellation',
  followup: 'thanks',
};
const LOCALES = new Set(['ro', 'en', 'fr', 'es', 'de', 'it']);

type Editing = {
  id: MessageId;
  kind: TemplateKind;
  subject: string;
  body: string;
  error: { field: 'subject' | 'body'; text: string } | null;
  preview: ClientEmailParts | null;
  busy: boolean;
};

export function MessagesScreen({ initial }: { initial: MessagesPageData }) {
  const t = useTranslations('booking.msg');
  const router = useRouter();
  const mode = useMode();
  const hubLocale = useLocale();
  const locale = (LOCALES.has(hubLocale) ? hubLocale : 'ro') as ClientLocale;
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<MessageId | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, setToast] = useState<{ title: string; tone: 'done' | 'danger' } | null>(null);
  const previewSeq = useRef(0);

  const rows: MessageRow[] = [
    { id: 'confirm', channels: ['email'], when: t('when.now'), on: true, locked: true },
    {
      id: 'reminder',
      channels: ['email'],
      when: t('when.before', { n: 24 }),
      on: data.reminderEmail,
    },
    { id: 'changed', channels: ['email'], when: t('when.now'), on: true, locked: true },
    { id: 'cancelled', channels: ['email'], when: t('when.now'), on: true, locked: true },
    { id: 'followup', channels: ['email'], when: t('when.after', { n: 2 }), on: data.thanksEmail },
  ];

  const errorText = (e: MessagesActionError): Editing['error'] => {
    const m = /^invalid:(subject|body):(.*)$/.exec(e);
    if (!m) return { field: 'body', text: t('err.failed') };
    const field = m[1] as 'subject' | 'body';
    const reason = m[2]!;
    if (reason.startsWith('unknown_variable:'))
      return {
        field,
        text: t('err.var', { var: `{${reason.slice('unknown_variable:'.length)}}` }),
      };
    if (reason === 'required')
      return { field, text: field === 'subject' ? t('err.subject') : t('err.body') };
    if (reason === 'too_long')
      return { field, text: t('err.long', { max: TEMPLATE_LIMITS[field] }) };
    return { field, text: t('err.failed') };
  };

  /** The same rules as the server, while typing (the first unknown variable, the empty fields). */
  const check = (subject: string, body: string): Editing['error'] => {
    for (const [field, text] of [
      ['subject', subject],
      ['body', body],
    ] as const) {
      const bad = unknownVariables(text)[0];
      if (bad !== undefined) return { field, text: t('err.var', { var: `{${bad}}` }) };
    }
    return null;
  };

  // the preview follows the text (a moment after typing stops); the server renders the real e-mail
  useEffect(() => {
    if (
      !editing ||
      check(editing.subject, editing.body) ||
      !editing.subject.trim() ||
      !editing.body.trim()
    )
      return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      const r = await previewTemplate(editing.kind, locale, editing.subject, editing.body);
      if (seq !== previewSeq.current || !r.ok) return;
      setEditing((e) => (e ? { ...e, preview: r.value } : e));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.kind, editing?.subject, editing?.body, locale]);

  const open = async (id: MessageId) => {
    const kind = KIND[id];
    if (!kind) return;
    const r = await readTemplate(kind, locale);
    if (!r.ok) return setToast({ title: t('err.failed'), tone: 'danger' });
    setEditing({
      id,
      kind,
      subject: r.value.subject,
      body: r.value.body,
      error: null,
      preview: null,
      busy: false,
    });
  };

  const save = async () => {
    if (!editing) return;
    const local = check(editing.subject, editing.body);
    if (local) return setEditing({ ...editing, error: local });
    setEditing({ ...editing, busy: true });
    const r = await saveTemplate(editing.kind, locale, editing.subject, editing.body);
    if (!r.ok) return setEditing({ ...editing, busy: false, error: errorText(r.error) });
    setData((d) => ({
      ...d,
      custom: {
        ...d.custom,
        [editing.kind]: [...new Set([...(d.custom[editing.kind] ?? []), locale])],
      },
    }));
    setEditing(null);
    setToast({ title: t('saved'), tone: 'done' });
  };

  const reset = async () => {
    if (!editing) return;
    const r = await resetTemplate(editing.kind, locale);
    if (!r.ok) return setEditing({ ...editing, error: errorText(r.error) });
    setEditing({ ...editing, subject: r.value.subject, body: r.value.body, error: null });
    setData((d) => ({
      ...d,
      custom: {
        ...d.custom,
        [editing.kind]: (d.custom[editing.kind] ?? []).filter((l) => l !== locale),
      },
    }));
    setToast({ title: t('resetDone'), tone: 'done' });
  };

  const toggle = async (id: MessageId, on: boolean) => {
    const which = id === 'reminder' ? 'reminder' : id === 'followup' ? 'thanks' : null;
    if (!which) return;
    setBusy(id);
    const r = await setMessageOn(which, on);
    setBusy(null);
    if (!r.ok) return setToast({ title: t('err.failed'), tone: 'danger' });
    setData((d) => ({ ...d, ...r.value }));
  };

  const p = editing?.preview;
  const when =
    editing?.id === 'reminder'
      ? {
          options: [{ value: 'before', label: t('when.before', { n: 24 }) }],
          value: 'before',
          hours: 24,
        }
      : editing?.id === 'followup'
        ? {
            options: [{ value: 'after', label: t('when.after', { n: 2 }) }],
            value: 'after',
            hours: 2,
          }
        : { options: [{ value: 'now', label: t('when.now') }], value: 'now', hours: null };

  return (
    <>
      <BookingSettingsHeader
        mode={mode}
        tab="messages"
        tabs={SETTINGS_TABS_S127}
        description={t('lead')}
        onTabChange={(tab) => {
          if (tab !== 'messages') router.push(`/booking/settings/${tab}`);
        }}
      />
      <BookingMessagesView
        mode={mode}
        clients={rows}
        busy={busy}
        onToggle={toggle}
        onEdit={(id) => void open(id)}
      />
      {editing ? (
        <MessageEditorDrawer
          isOpen
          mode={mode}
          kind={editing.id}
          channels={['email']}
          channel="email"
          subject={editing.subject}
          onSubjectChange={(subject) =>
            setEditing((e) => (e ? { ...e, subject, error: check(subject, e.body) } : e))
          }
          body={editing.body}
          onBodyChange={(body) =>
            setEditing((e) => (e ? { ...e, body, error: check(e.subject, body) } : e))
          }
          variables={TEMPLATE_VARS}
          error={editing.error}
          when={when}
          whenDisabled
          busy={editing.busy}
          onReset={() => void reset()}
          onSave={() => void save()}
          onCancel={() => setEditing(null)}
          preview={
            p ? (
              <EmailPreview
                m={{
                  fromLabel: t('prevFrom'),
                  toLabel: t('prevTo'),
                  from: p.senderName,
                  to: p.to,
                  subject: p.subject,
                  preheader: p.preheader,
                  business: p.eyebrow,
                  title: p.title,
                  paragraphs: p.opening,
                  rows: p.rows,
                  button: p.button.label,
                  after: p.after,
                  why: p.why,
                  foot: p.company,
                }}
              />
            ) : null
          }
        />
      ) : null}
      {toast ? (
        <SettingsToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
