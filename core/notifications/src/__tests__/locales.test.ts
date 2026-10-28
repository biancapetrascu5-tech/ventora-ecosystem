import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, CANONICAL_LOCALE } from '@ventora/i18n';
import { emailMessages } from '../templates/messages';
import {
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderPasswordChanged,
  renderPasswordReset,
  renderSupportSessionOpened,
} from '../index';

// i18n:check guarantees the same keys; this guarantees the same placeholders, so a
// translation can never drop {link data} or ask for a value the code does not pass.
function placeholders(obj: unknown, prefix = ''): Record<string, string[]> {
  if (typeof obj === 'string') {
    return { [prefix]: [...obj.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort() };
  }
  return Object.entries(obj as Record<string, unknown>).reduce(
    (acc, [k, v]) => ({ ...acc, ...placeholders(v, prefix ? `${prefix}.${k}` : k) }),
    {} as Record<string, string[]>,
  );
}

describe('email catalogs in all 6 languages', () => {
  const canonical = placeholders(emailMessages(CANONICAL_LOCALE));

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale}: same placeholders as RO in every key`, () => {
      expect(placeholders(emailMessages(locale))).toEqual(canonical);
    });

    it(`${locale}: every template renders completely`, () => {
      const expiresAt = new Date('2026-11-04T10:00:00Z');
      const all = [
        renderPasswordReset({ app: 'hub', email: 'a@x.io', name: 'A', link: 'https://l', locale }),
        renderPasswordReset({ app: 'founder', email: 'a@x.io', link: 'https://l', locale }),
        renderPasswordChanged({ email: 'a@x.io', trigger: 'reset', changedAt: expiresAt, locale }),
        renderPasswordChanged({ email: 'a@x.io', trigger: 'change', changedAt: expiresAt, locale }),
        renderMemberInvitation({
          email: 'a@x.io',
          inviterName: 'B',
          businessName: 'C',
          role: 'external_collaborator',
          expiresAt,
          link: 'https://l',
          resent: true,
          locale,
        }),
        renderOwnerInvitation({
          email: 'a@x.io',
          businessName: 'C',
          expiresAt,
          link: 'https://l',
          locale,
        }),
        renderOwnerRecovery({
          email: 'a@x.io',
          businessName: 'C',
          ticketRef: 'T-1',
          passwordResetLink: 'https://l',
          locale,
        }),
        renderSupportSessionOpened({
          email: 'a@x.io',
          name: 'A',
          businessName: 'C',
          founderName: 'D',
          reason: 'Programările de ieri lipsesc',
          ticketRef: 'T-2',
          expiresAt,
          locale,
        }),
      ];
      for (const r of all) {
        expect(r.html).toContain(`<html lang="${locale}">`);
        for (const part of [r.subject, r.text]) expect(part).not.toMatch(/\{\w+\}/);
      }
    });

    it(`${locale}: password changed — two leads, time with the zone abbreviation (R-PR7)`, () => {
      const m = emailMessages(locale).passwordChanged;
      expect(m.leadReset).not.toBe(m.leadAccount);
      const at = new Date('2026-10-28T08:32:00Z');
      const reset = renderPasswordChanged({
        email: 'a@x.io',
        trigger: 'reset',
        changedAt: at,
        locale,
      });
      const change = renderPasswordChanged({
        email: 'a@x.io',
        trigger: 'change',
        changedAt: at,
        locale,
      });
      expect(reset.subject).toBe(m.subject);
      expect(reset.text).toContain('10:32 EET');
      expect(reset.text).toContain('a@x.io');
      expect(reset.text).toContain(m.ifYou);
      expect(reset.text).toContain(m.why);
      expect(reset.text).toContain(`${m.cta}: mailto:support@ventorasystems.com`);
      expect(reset.text).not.toBe(change.text);
      expect(reset.text).not.toContain('TODO-COPY');
    });

    it(`${locale}: E-6 — expiry with the zone abbreviation, the reason, the owner footer (S99)`, () => {
      const m = emailMessages(locale).supportSession;
      const r = renderSupportSessionOpened({
        email: 'a@x.io',
        businessName: 'Salon C',
        founderName: 'D',
        reason: 'Programările de ieri lipsesc',
        ticketRef: 'T-2',
        expiresAt: new Date('2026-10-28T16:30:00Z'),
        locale,
      });
      expect(r.text).toContain('18:30 EET');
      expect(r.text).toContain(m.reason.replace('{reason}', 'Programările de ieri lipsesc'));
      expect(r.text).toContain(m.footer.replace('{businessName}', 'Salon C'));
      expect(r.text).not.toContain('a@x.io'); // the account footer is replaced
    });
  }
});
