import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@ventora/i18n';
import { defaultCatalog, renderNotification, renderNotificationEmail } from '../index';

/*
 * Lot 4.6: „Răspuns nou la solicitarea ta” (in the app) and e-mail E-7 (S111: its own subject,
 * heading and preheader, the button to the request), and the automatic-closing notice
 * (S116-D18, texts proposed „de validat”), in the 6 languages.
 */

const REPLY = {
  subject: 'Reamintirile SMS nu pleacă',
  author: 'Mihai Ionescu',
  ref: 'VS-2026-0142',
  businessName: 'Salon Aurora',
};

describe('support.reply (E-7)', () => {
  const template = defaultCatalog.get('support.reply', 1)!;

  it('is operational, on the „Suport” row, with e-mail; the action opens the request', () => {
    expect(template.category).toBe('operational');
    expect(template.topic).toBe('support');
    expect(template.channels).toEqual(['email']);
    expect(template.actionPath!(REPLY)).toBe('/support/VS-2026-0142');
    expect(template.actionPath!({ ...REPLY, ref: '../admin' })).toBe('/support');
  });

  it('the e-mail in Romanian is the design: subject, heading, preheader, lead, button', () => {
    const mail = renderNotificationEmail(
      { type: 'support.reply', version: 1, params: REPLY, action_url: '/support/VS-2026-0142' },
      { email: 'ana@example.com', name: 'Ana', locale: 'ro' },
    );
    expect(mail.subject).toBe('Ai un răspuns nou la solicitarea ta');
    expect(mail.text).toContain('Mihai Ionescu din echipa Ventora Systems a răspuns la');
    expect(mail.text).toContain('VS-2026-0142');
    expect(mail.text).toContain('Vezi solicitarea');
    expect(mail.html).toContain('Mihai Ionescu din echipa Ventora Systems ți-a răspuns');
    expect(mail.html).toContain('Salon Aurora · Suport');
  });

  it('every language renders without a placeholder left', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { title, body, action } = renderNotification(template, REPLY, locale);
      expect(`${title} ${body} ${action}`).not.toMatch(/\{\w+\}/);
      const mail = renderNotificationEmail(
        { type: 'support.reply', version: 1, params: REPLY, action_url: '/support/VS-2026-0142' },
        { email: 'ana@example.com', name: 'Ana', locale },
      );
      expect(mail.text).not.toMatch(/\{\w+\}/);
      expect(mail.subject).not.toMatch(/\{\w+\}/);
    }
  });
});

describe('support.autoClose (S116-D18)', () => {
  it('says the day of the closing, in every language', () => {
    const params = {
      subject: 'Reamintirile SMS nu pleacă',
      ref: 'VS-2026-0142',
      businessName: 'Salon Aurora',
      closesAt: { type: 'date' as const, date: '2026-11-12' },
    };
    for (const locale of SUPPORTED_LOCALES) {
      const mail = renderNotificationEmail(
        { type: 'support.autoClose', version: 1, params, action_url: '/support/VS-2026-0142' },
        { email: 'ana@example.com', name: 'Ana', locale },
      );
      expect(mail.text).not.toMatch(/\{\w+\}/);
      expect(mail.text).toContain('12');
    }
    const ro = renderNotificationEmail(
      { type: 'support.autoClose', version: 1, params, action_url: '/support/VS-2026-0142' },
      { email: 'ana@example.com', name: 'Ana', locale: 'ro' },
    );
    expect(ro.subject).toBe('Solicitarea ta se închide mâine');
    expect(ro.text).toContain('pe 12 noiembrie');
  });
});
