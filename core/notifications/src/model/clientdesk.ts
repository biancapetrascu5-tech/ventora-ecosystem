import type { NotificationTemplate } from './catalog';
import type { NotificationParams, NotificationValueType } from './values';

/*
 * Lot C.9 (approved 11.11.2026; the topic decided on 12.11.2026): the ClientDesk notifications,
 * for the members of the team (plans/CRM.md CR.6–CR.9, modules/crm/CLAUDE.md):
 *
 *   crm.mention   → „@coleg” in a comment (CR.6, at most 20 per comment);
 *   crm.reminder  → a reminder of an activity is due (CR.7, „în aplicație și pe e-mail”);
 *   crm.assigned  → a contact, company, lead, deal or activity was given to the person (CR.2,
 *                   CR.7–CR.9).
 *
 * In the app always; by e-mail on the new row „ClientDesk” of „Contul tău · Notificări” (topic
 * `clientdesk`, on by default). The screen row comes with its design (S114b has none yet); until
 * then the e-mail stays on. The design has no texts for them: proposed in the 6 languages, „de
 * validat”, as support.autoClose.
 *
 * No personal data of the business's clients: the record is named by its kind (a translated key,
 * „un lead”), never by its name. A reminder carries the activity's title, which the team wrote for
 * itself. The action opens the record in ClientDesk.
 */

const PARAM_TYPES: Readonly<Record<string, NotificationValueType>> = {
  author: 'text',
  businessName: 'text',
  /** `notifications.crm.record.<kind>`: the kind of record, in the reader's language. */
  record: 'key',
  recordType: 'text',
  recordId: 'text',
  title: 'text',
  dueOn: 'date',
};

/** The record kinds and their path in ClientDesk. */
const PATHS: Readonly<Record<string, string>> = {
  contact: 'contacts',
  company: 'companies',
  lead: 'leads',
  deal: 'deals',
  activity: 'activities',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record in ClientDesk (`/crm/leads/<id>`), or ClientDesk itself when it is not one. */
export function recordPath(params: NotificationParams): string {
  const type = typeof params.recordType === 'string' ? params.recordType : '';
  const id = typeof params.recordId === 'string' ? params.recordId : '';
  const base = PATHS[type];
  return base && UUID.test(id) ? `/crm/${base}/${id}` : '/crm';
}

const email = (name: string) => ({
  subjectKey: `email.${name}.subject`,
  preheaderKey: `email.${name}.preheader`,
  eyebrowKey: 'email.crm.eyebrow',
  titleKey: `email.${name}.title`,
  leadKey: `email.${name}.lead`,
  nextKeys: [`email.${name}.body`],
  whyKey: 'email.crm.why',
});

export const CLIENTDESK_TEMPLATES: readonly NotificationTemplate[] = [
  {
    type: 'crm.mention',
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'crm.mention.title',
    bodyKey: 'crm.mention.body',
    actionKey: 'crm.mention.action',
    actionPath: recordPath,
    channels: ['email'],
    topic: 'clientdesk',
    paramTypes: PARAM_TYPES,
    email: email('crmMention'),
  },
  {
    type: 'crm.reminder',
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'crm.reminder.title',
    bodyKey: 'crm.reminder.body',
    actionKey: 'crm.reminder.action',
    actionPath: recordPath,
    channels: ['email'],
    topic: 'clientdesk',
    paramTypes: PARAM_TYPES,
    email: email('crmReminder'),
  },
  {
    type: 'crm.assigned',
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'crm.assigned.title',
    bodyKey: 'crm.assigned.body',
    actionKey: 'crm.assigned.action',
    actionPath: recordPath,
    channels: ['email'],
    topic: 'clientdesk',
    paramTypes: PARAM_TYPES,
    email: email('crmAssigned'),
  },
];
