import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, CANONICAL_LOCALE } from '@ventora/i18n';
import { emailMessages } from '../templates/messages.js';
import {
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderPasswordReset,
} from '../index.js';

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
      ];
      for (const r of all) {
        expect(r.html).toContain(`<html lang="${locale}">`);
        for (const part of [r.subject, r.text]) expect(part).not.toMatch(/\{\w+\}/);
      }
    });
  }
});
