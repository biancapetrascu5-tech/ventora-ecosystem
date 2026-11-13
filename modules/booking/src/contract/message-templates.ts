import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { ClientEmailParts } from '../server/client-emails';
import { previewMessageTemplateInOrg } from '../server/message-preview';
import {
  getMessageTemplateInOrg,
  listMessageTemplatesInOrg,
  resetMessageTemplateInOrg,
  saveMessageTemplateInOrg,
  type MessageTemplate,
  type MessageTemplateSummary,
  type TemplateKind,
} from '../server/message-templates';
import type { ClientLocale } from '../server/appointments';

/*
 * Lot B.14b — the texts of the client e-mails (Setări · Mesaje, S127). booking:settings (owner,
 * admin, application_manager), like the other rules of the business. The organization comes only
 * from the session.
 *
 * Errors: InvalidInput('kind' | 'locale', 'invalid'); InvalidInput('subject' | 'body', 'required' |
 * 'too_long' | 'invalid' | 'unknown_variable:<name>'); Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };
export type MessageTemplateRef = Session & { kind: TemplateKind; locale: ClientLocale };
export type MessageTemplateInput = MessageTemplateRef & { subject: string; body: string };

function settings(params: Session): Promise<TenantContext> {
  return authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });
}

/** For each message, the languages with a text of the business. */
export async function listMessageTemplates(params: Session): Promise<MessageTemplateSummary[]> {
  return listMessageTemplatesInOrg(await settings(params));
}

/** The text in use (the business's, or Ventora's written with the variables). */
export async function getMessageTemplate(params: MessageTemplateRef): Promise<MessageTemplate> {
  return getMessageTemplateInOrg(await settings(params), params);
}

/** „Salvează mesajul”: from the next e-mail on. */
export async function saveMessageTemplate(params: MessageTemplateInput): Promise<MessageTemplate> {
  return saveMessageTemplateInOrg(await settings(params), params);
}

/** „Revino la textul inițial”. */
export async function resetMessageTemplate(params: MessageTemplateRef): Promise<MessageTemplate> {
  return resetMessageTemplateInOrg(await settings(params), params);
}

/** „Previzualizare”: the e-mail with the text being edited and an example booking; nothing sent. */
export async function previewMessageTemplate(
  params: MessageTemplateInput,
): Promise<ClientEmailParts> {
  return previewMessageTemplateInOrg(await settings(params), params);
}

export type { ClientEmailParts, MessageTemplate, MessageTemplateSummary, TemplateKind };
