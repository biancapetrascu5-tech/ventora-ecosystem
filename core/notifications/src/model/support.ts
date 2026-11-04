import type { NotificationTemplate } from './catalog';
import type { NotificationParams, NotificationValueType } from './values';

/*
 * Lot 4.6 — the support requests (D4-14 b, HubSupportThread, FounderSupportInbox).
 *
 *   support.reply      → the Ventora team answered from Founder · Suport: „Răspuns nou la
 *                        solicitarea ta” in the Hub and e-mail E-7 (S111, the design's keys
 *                        `email.supportReply.*`, 6 languages);
 *   support.autoClose  → S116-D18: a request without an answer from the business for 6 days
 *                        closes tomorrow. The design has no texts for it (S-7): proposed in the
 *                        6 languages, „de validat”.
 *
 * Both go to the person who opened the request, operational, e-mail on the „Suport” row of
 * „Contul tău · Notificări” (S114b). The action opens the request in the Hub, by its reference.
 */

const PARAM_TYPES: Readonly<Record<string, NotificationValueType>> = {
  subject: 'text',
  author: 'text',
  ref: 'text',
  businessName: 'text',
  closesAt: 'date',
};

const REF_RE = /^VS-\d{4}-\d{4,}$/;

/** HubSupportThread, by the request's reference (VS-2026-0142). */
function requestPath(params: NotificationParams): string {
  const ref = typeof params.ref === 'string' ? params.ref : '';
  return REF_RE.test(ref) ? `/support/${ref}` : '/support';
}

export const SUPPORT_TEMPLATES: readonly NotificationTemplate[] = [
  {
    type: 'support.reply',
    version: 1,
    category: 'operational',
    group: 'operational',
    titleKey: 'support.reply.title',
    bodyKey: 'support.reply.body',
    actionKey: 'support.reply.action',
    actionPath: requestPath,
    channels: ['email'],
    topic: 'support',
    paramTypes: PARAM_TYPES,
    email: {
      subjectKey: 'email.supportReply.subject',
      preheaderKey: 'email.supportReply.preheader',
      eyebrowKey: 'email.supportReply.eyebrow',
      titleKey: 'email.supportReply.title',
      leadKey: 'email.supportReply.lead',
      nextKeys: ['email.supportReply.body'],
      whyKey: 'email.supportReply.why',
    },
  },
  {
    type: 'support.autoClose',
    version: 1,
    category: 'operational',
    group: 'operational',
    titleKey: 'support.autoClose.title',
    bodyKey: 'support.autoClose.body',
    actionKey: 'support.autoClose.action',
    actionPath: requestPath,
    channels: ['email'],
    topic: 'support',
    paramTypes: PARAM_TYPES,
    email: {
      subjectKey: 'email.supportAutoClose.subject',
      preheaderKey: 'email.supportAutoClose.preheader',
      eyebrowKey: 'email.supportReply.eyebrow',
      titleKey: 'email.supportAutoClose.title',
      leadKey: 'email.supportAutoClose.lead',
      nextKeys: ['email.supportAutoClose.body'],
      whyKey: 'email.supportReply.why',
    },
  },
];
