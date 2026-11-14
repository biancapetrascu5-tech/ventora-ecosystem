'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookingMessagesView,
  BookingSettingsHeader,
  EmailPreview,
  MessageEditorDrawer,
  SEND_TIMING_LIMITS,
  SETTINGS_TABS_S127,
  SettingsToast,
  TEMPLATE_LIMITS,
  TEMPLATE_VARS,
  unknownVariables,
  type MessageId,
  type MessageRow,
  type TemplateKind,
  type ThanksWhen,
} from '@ventora/booking/ui';
import type { ClientEmailParts, ClientLocale } from '@ventora/booking';
import {
  previewTemplate,
  readTemplate,
  resetTemplate,
  saveTemplate,
  setMessageOn,
  setMessageTiming,
  type MessageTiming,
  type MessagesActionError,
  type MessagesPageData,
} from '@/server/booking-messages-actions';
import { useMode } from './useMode';

/* Lot B.14b — EasyBook · Setări · „Mesaje” (BookingMessageTemplates, S127): the state and the
   actions of the page. The screen is in modules/booking/src/ui (the same components as the gallery).
   The application lists the client e-mails that exist (B.13 / B.14); the team notices (B.15), the
   review request (B.16) and the SMS (B.17) come with their lots. The text is edited in the language
   of the Hub (NECESITĂ DESIGN: choosing another language). When it leaves (B.14c): the reminder N
   hours before (2–72), the thanks at the end, N hours after (1–48) or the next day at 10:00; saved
   with the text. */

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
  /** B.14c: the moment (reminder: 'before'; thanks: now / after / next_day) and the hours as typed. */
  when: string;
  hours: string;
  hoursError: string | null;
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

  const thanksLabel = (when: ThanksWhen, n: number) =>
    when === 'now'
      ? t('when.now')
      : when === 'next_day'
        ? t('when.nextDay', { time: SEND_TIMING_LIMITS.nextDayAt })
        : t('when.after', { n });
  const { timing } = data;
  const rows: MessageRow[] = [
    { id: 'confirm', channels: ['email'], when: t('when.now'), on: true, locked: true },
    {
      id: 'reminder',
      channels: ['email'],
      when: t('when.before', { n: timing.reminderHours }),
      on: data.reminderEmail,
    },
    { id: 'changed', channels: ['email'], when: t('when.now'), on: true, locked: true },
    { id: 'cancelled', channels: ['email'], when: t('when.now'), on: true, locked: true },
    {
      id: 'followup',
      channels: ['email'],
      when: thanksLabel(timing.thanksWhen, timing.thanksHours),
      on: data.thanksEmail,
    },
  ];

  /** The hours as typed → a number in the limits, or the error under the field. */
  const hoursOf = (e: Editing): { n: number | null; error: string | null } => {
    const limits =
      e.id === 'reminder'
        ? SEND_TIMING_LIMITS.reminderHours
        : e.id === 'followup' && e.when === 'after'
          ? SEND_TIMING_LIMITS.thanksHours
          : null;
    if (!limits) return { n: null, error: null };
    const n = Number(e.hours);
    return e.hours.trim() !== '' && Number.isInteger(n) && n >= limits.min && n <= limits.max
      ? { n, error: null }
      : { n: null, error: t('err.hours', { min: limits.min, max: limits.max }) };
  };

  /** What changes in the settings when the editor saves (nothing for the fixed e-mails). */
  const timingChange = (e: Editing, n: number | null): Partial<MessageTiming> | null => {
    if (e.id === 'reminder')
      return n !== null && n !== timing.reminderHours ? { reminderHours: n } : null;
    if (e.id !== 'followup') return null;
    const when = e.when as ThanksWhen;
    const change: Partial<MessageTiming> = {};
    if (when !== timing.thanksWhen) change.thanksWhen = when;
    if (when === 'after' && n !== null && n !== timing.thanksHours) change.thanksHours = n;
    return Object.keys(change).length ? change : null;
  };

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
      when: id === 'reminder' ? 'before' : id === 'followup' ? timing.thanksWhen : 'now',
      hours: String(
        id === 'reminder' ? timing.reminderHours : id === 'followup' ? timing.thanksHours : '',
      ),
      hoursError: null,
    });
  };

  const save = async () => {
    if (!editing) return;
    const local = check(editing.subject, editing.body);
    if (local) return setEditing({ ...editing, error: local });
    const hours = hoursOf(editing);
    if (hours.error) return setEditing({ ...editing, hoursError: hours.error });
    setEditing({ ...editing, busy: true });
    const change = timingChange(editing, hours.n);
    if (change) {
      const tr = await setMessageTiming(change);
      if (!tr.ok) {
        const onHours = /^invalid:(reminderHours|thanksHours):/.test(tr.error);
        return setEditing({
          ...editing,
          busy: false,
          ...(onHours
            ? { hoursError: hoursOf({ ...editing, hours: '' }).error }
            : { error: errorText(tr.error) }),
        });
      }
      setData((d) => ({ ...d, timing: tr.value }));
    }
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
  const typed = Number(editing?.hours) || 0;
  const when =
    editing?.id === 'reminder'
      ? {
          options: [{ value: 'before', label: t('when.before', { n: typed }) }],
          value: 'before',
          hours: editing.hours,
        }
      : editing?.id === 'followup'
        ? {
            options: (['now', 'after', 'next_day'] as const).map((w) => ({
              value: w,
              label: thanksLabel(w, typed),
            })),
            value: editing.when,
            hours: editing.when === 'after' ? editing.hours : null,
          }
        : { options: [{ value: 'now', label: t('when.now') }], value: 'now', hours: null };
  const timed = editing?.id === 'reminder' || editing?.id === 'followup';

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
          whenDisabled={!timed}
          onWhenChange={(w) => setEditing((e) => (e ? { ...e, when: w, hoursError: null } : e))}
          onHoursChange={(h) => setEditing((e) => (e ? { ...e, hours: h, hoursError: null } : e))}
          hoursError={editing.hoursError}
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
