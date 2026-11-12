import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@ventora/i18n';
import {
  EMAIL_TOPICS,
  defaultCatalog,
  renderNotification,
  renderNotificationEmail,
} from '../index';
import { isChangeable } from '../model/topics';
import type { NotificationParams } from '../model/values';

/*
 * Lot C.9: the ClientDesk notifications (mention, reminder, assignment) — in the app and by e-mail
 * on the new topic `clientdesk`, texts proposed „de validat” in the 6 languages; no personal data
 * of the business's clients (the record is named by its kind).
 */

const ID = '0192f0a1-7c3e-7b1a-9d2e-3f4a5b6c7d8e';
const lead = (key: string) => ({ type: 'key' as const, key: `notifications.crm.record.${key}` });

const CASES: {
  type: string;
  params: NotificationParams;
  ro: { title: string; body: string };
  path: string;
}[] = [
  {
    type: 'crm.mention',
    params: {
      author: 'Ana Pop',
      businessName: 'Salon Aurora',
      record: lead('lead'),
      recordType: 'lead',
      recordId: ID,
    },
    ro: { title: 'Ana Pop te-a menționat', body: 'într-un comentariu pe un lead' },
    path: `/crm/leads/${ID}`,
  },
  {
    type: 'crm.reminder',
    params: {
      title: 'Sună pentru ofertă',
      dueOn: { type: 'date' as const, date: '2026-11-20' },
      businessName: 'Salon Aurora',
      recordType: 'activity',
      recordId: ID,
    },
    ro: { title: 'Reminder: Sună pentru ofertă', body: 'Termen:' },
    path: `/crm/activities/${ID}`,
  },
  {
    type: 'crm.assigned',
    params: {
      author: 'Ana Pop',
      businessName: 'Salon Aurora',
      record: lead('deal'),
      recordType: 'deal',
      recordId: ID,
    },
    ro: { title: 'Ți s-a atribuit un deal', body: 'Ana Pop ți-a atribuit un deal în ClientDesk.' },
    path: `/crm/deals/${ID}`,
  },
];

describe('C.9: the ClientDesk notifications', () => {
  it('the topic clientdesk: e-mail switch, in the app always', () => {
    expect(EMAIL_TOPICS).toContain('clientdesk');
    expect(isChangeable('clientdesk', 'email')).toBe(true);
    expect(isChangeable('clientdesk', 'in_app')).toBe(false);
  });

  for (const c of CASES) {
    describe(c.type, () => {
      const template = defaultCatalog.get(c.type, 1)!;

      it('is operational, in Activity, on the ClientDesk row, with e-mail; opens the record', () => {
        expect(template).toMatchObject({
          category: 'operational',
          group: 'activity',
          topic: 'clientdesk',
          channels: ['email'],
        });
        expect(template.actionPath!(c.params)).toBe(c.path);
        // an id that is not one, or an unknown kind: ClientDesk itself
        expect(template.actionPath!({ ...c.params, recordId: '../admin' })).toBe('/crm');
        expect(template.actionPath!({ ...c.params, recordType: 'invoice' })).toBe('/crm');
      });

      it('in Romanian, the proposed texts', () => {
        const { title, body } = renderNotification(template, c.params, 'ro');
        expect(title).toBe(c.ro.title);
        expect(body).toContain(c.ro.body);
      });

      it('every language renders the app and the e-mail without a placeholder left', () => {
        for (const locale of SUPPORTED_LOCALES) {
          const { title, body, action } = renderNotification(template, c.params, locale);
          expect(`${title} ${body} ${action}`).not.toMatch(/\{\w+\}/);
          const mail = renderNotificationEmail(
            { type: c.type, version: 1, params: c.params, action_url: c.path },
            { email: 'ana@example.com', name: 'Ana', locale },
          );
          expect(`${mail.subject} ${mail.text}`).not.toMatch(/\{\w+\}/);
          expect(mail.html).toContain('Salon Aurora · ClientDesk');
        }
      });
    });
  }

  it('the reminder date is formatted per language, never passed as text', () => {
    const t = defaultCatalog.get('crm.reminder', 1)!;
    const params = CASES[1]!.params;
    expect(renderNotification(t, params, 'ro').body).toContain('20');
    expect(renderNotification(t, params, 'en').body).toMatch(/20/);
  });
});
