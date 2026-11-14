'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize } from '@ventora/access';
import {
  getBookingSettings,
  getMessageTemplate,
  listMessageTemplates,
  previewMessageTemplate,
  resetMessageTemplate,
  saveMessageTemplate,
  setBookingSettings,
  type ClientEmailParts,
  type ClientLocale,
  type MessageTemplate,
  type TemplateKind,
  type ThanksWhen,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { reportActionError } from './report-error';

/* Lot B.14b — EasyBook · Setări · „Mesaje” (BookingMessageTemplates, S127). The business and the
   person come only from the session; every call goes through the booking contracts, which start
   with authorize() (booking:settings). The data reaches the screen without Date objects. */

export type MessagesPageData = {
  /** B.13 / B.14: the reminder and the thanks can be turned off; the rest always go. */
  reminderEmail: boolean;
  thanksEmail: boolean;
  /** B.14c: when the reminder (hours before) and the thanks leave. */
  timing: MessageTiming;
  /** The languages in which the business wrote its own text, per message. */
  custom: Record<TemplateKind, ClientLocale[]>;
};

export type MessageTiming = { reminderHours: number; thanksWhen: ThanksWhen; thanksHours: number };

const timingOf = (s: MessageTiming): MessageTiming => ({
  reminderHours: s.reminderHours,
  thanksWhen: s.thanksWhen,
  thanksHours: s.thanksHours,
});

export type MessagesPage =
  | { kind: 'ok'; data: MessagesPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

export type TemplateData = Omit<MessageTemplate, 'updatedAt'> & { updatedAt: string | null };

export type MessagesActionError = 'forbidden' | 'failed' | `invalid:${string}:${string}`;
export type MessagesActionResult<T> =
  { ok: true; value: T } | { ok: false; error: MessagesActionError };

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const toData = (t: MessageTemplate): TemplateData => ({
  ...t,
  updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
});

export async function readMessagesPage(): Promise<MessagesPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  try {
    await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:settings',
    });
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.messages.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const [settings, list] = await Promise.all([
    getBookingSettings({ sessionToken: token }),
    listMessageTemplates({ sessionToken: token }),
  ]);
  return {
    kind: 'ok',
    data: {
      reminderEmail: settings.reminderEmail,
      thanksEmail: settings.thanksEmail,
      timing: timingOf(settings),
      custom: Object.fromEntries(list.map((x) => [x.kind, x.customLocales])) as Record<
        TemplateKind,
        ClientLocale[]
      >,
    },
  };
}

async function run<T>(
  action: string,
  fn: (token: string) => Promise<T>,
): Promise<MessagesActionResult<T>> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    return { ok: true, value: await fn(token) };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    const code = codeOf(err);
    if (code === 'INVALID_INPUT') {
      const field = (err as { field?: string }).field ?? '';
      return { ok: false, error: `invalid:${field}:${(err as Error).message}` };
    }
    if (code === 'FORBIDDEN' || code === 'NOT_AUTHENTICATED')
      return { ok: false, error: 'forbidden' };
    return { ok: false, error: 'failed' };
  }
}

export async function readTemplate(
  kind: TemplateKind,
  locale: ClientLocale,
): Promise<MessagesActionResult<TemplateData>> {
  return run('booking.messages.get', async (sessionToken) =>
    toData(await getMessageTemplate({ sessionToken, kind, locale })),
  );
}

export async function saveTemplate(
  kind: TemplateKind,
  locale: ClientLocale,
  subject: string,
  body: string,
): Promise<MessagesActionResult<TemplateData>> {
  return run('booking.messages.save', async (sessionToken) =>
    toData(await saveMessageTemplate({ sessionToken, kind, locale, subject, body })),
  );
}

export async function resetTemplate(
  kind: TemplateKind,
  locale: ClientLocale,
): Promise<MessagesActionResult<TemplateData>> {
  return run('booking.messages.reset', async (sessionToken) =>
    toData(await resetMessageTemplate({ sessionToken, kind, locale })),
  );
}

export async function previewTemplate(
  kind: TemplateKind,
  locale: ClientLocale,
  subject: string,
  body: string,
): Promise<MessagesActionResult<ClientEmailParts>> {
  return run('booking.messages.preview', (sessionToken) =>
    previewMessageTemplate({ sessionToken, kind, locale, subject, body }),
  );
}

/** On / off: the reminder and the thanks (the confirmation, the change and the cancellation always go). */
export async function setMessageOn(
  which: 'reminder' | 'thanks',
  on: boolean,
): Promise<MessagesActionResult<{ reminderEmail: boolean; thanksEmail: boolean }>> {
  return run('booking.messages.toggle', async (sessionToken) => {
    const s = await setBookingSettings({
      sessionToken,
      ...(which === 'reminder' ? { reminderEmail: on } : { thanksEmail: on }),
    });
    return { reminderEmail: s.reminderEmail, thanksEmail: s.thanksEmail };
  });
}

/** B.14c: when the reminder and the thanks leave (the hours are checked by the contract). */
export async function setMessageTiming(
  timing: Partial<MessageTiming>,
): Promise<MessagesActionResult<MessageTiming>> {
  return run('booking.messages.timing', async (sessionToken) =>
    timingOf(await setBookingSettings({ sessionToken, ...timing })),
  );
}
