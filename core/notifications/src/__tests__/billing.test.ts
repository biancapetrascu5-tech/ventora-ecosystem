import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@ventora/i18n';
import designTexts from '../../../../docs/design/system/i18n/notifications.json';
import {
  BILLING_KINDS,
  BILLING_TEMPLATES,
  defaultCatalog,
  placeholdersOf,
  renderNotification,
  renderNotificationEmail,
  requiredParams,
  templateKeys,
} from '../index';

/*
 * Lot 4.5, „Gata când”: every Phase 3 notification (S115) is rendered in the 6 languages, in the
 * panel and — for the owner's variants — by e-mail, with the texts Design wrote.
 */

const design = designTexts as Record<string, Record<string, string>>;

/** A value for every placeholder, marked so it can be found in the output. */
const paramsFor = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, `«${k}»`])) as Record<string, string>;

/** The design's flat key for a key of the `notifications` namespace. */
const designKey = (key: string) => (key.startsWith('email.') ? key : `notifications.${key}`);

describe('Lot 4.5 — the Phase 3 notifications (S115)', () => {
  it('20 templates, all operational, in the Facturi și plăți / Limitele abonamentului rows', () => {
    expect(BILLING_TEMPLATES).toHaveLength(20);
    for (const t of BILLING_TEMPLATES) {
      expect(defaultCatalog.get(t.type, 1)).toBe(t);
      expect(t.category).toBe('operational');
      expect(t.topic).toBe(t.type.startsWith('billing.limit.') ? 'limits' : 'billing');
    }
    // the owner's variants have the e-mail; the ones for everyone else are in the app only
    const inApp = BILLING_TEMPLATES.filter((t) => t.channels.length === 0).map((t) => t.type);
    expect(inApp.sort()).toEqual([
      'billing.limit.other100',
      'billing.limit.other80',
      'billing.readonly.member',
    ]);
  });

  it('every kind F3 sends names templates that exist', () => {
    for (const route of Object.values(BILLING_KINDS)) {
      expect(defaultCatalog.get(`billing.${route.owner}`, 1)?.email).toBeDefined();
      if ('others' in route) {
        expect(defaultCatalog.get(`billing.${route.others}`, 1)?.channels).toEqual([]);
      }
    }
  });

  for (const template of BILLING_TEMPLATES) {
    it(`${template.type}: the panel in the 6 languages, as the design wrote it`, () => {
      const params = paramsFor(requiredParams(template));
      const titles = new Set<string>();
      for (const locale of SUPPORTED_LOCALES) {
        // the same placeholders in every language as in Romanian
        for (const key of templateKeys(template)) {
          expect(placeholdersOf(locale, key), `${locale} ${key}`).toEqual(
            placeholdersOf('ro', key),
          );
          expect(design[locale]![designKey(key)], `${locale} ${key}`).toBeDefined();
        }
        const { title, body, action } = renderNotification(template, params, locale);
        for (const text of [title, body, action]) {
          expect(text).toBeTruthy();
          expect(text).not.toMatch(/\{\w+\}/);
        }
        expect(title).toBe(
          design[locale]![designKey(template.titleKey)]!.replace(
            /\{(\w+)\}/g,
            (_, k: string) => params[k]!,
          ),
        );
        titles.add(title);
      }
      expect(titles.size).toBeGreaterThan(1);
    });
  }

  for (const template of BILLING_TEMPLATES.filter((t) => t.email)) {
    it(`${template.type}: the e-mail in the 6 languages (subject, preheader, button, footer)`, () => {
      const params = paramsFor(requiredParams(template));
      for (const locale of SUPPORTED_LOCALES) {
        const { title, body, action } = renderNotification(template, params, locale);
        const mail = renderNotificationEmail(
          {
            type: template.type,
            version: 1,
            params,
            action_url: template.actionPath?.(params) ?? null,
          },
          { email: 'owner@example.com', name: 'Ana', locale },
        );
        expect(mail.subject).toBe(`${title} · «business»`);
        expect(mail.text).not.toMatch(/\{\w+\}/);
        expect(mail.text).toContain(title);
        // the preheader is the in-app text; the footer says why the owner gets it
        expect(mail.html).toContain(body!.replace(/&/g, '&amp;').slice(0, 20));
        expect(mail.text).toContain('«business»');
        if (template.actionPath) expect(mail.text).toContain(`${action}: `);
      }
    });
  }

  it('at 100% the owner e-mail also says another plan can be asked for (S115)', () => {
    const t = defaultCatalog.get('billing.limit.owner100', 1)!;
    const params = paramsFor(requiredParams(t));
    const mail = renderNotificationEmail(
      { type: t.type, version: 1, params, action_url: '/admin/plan' },
      { email: 'owner@example.com', name: 'Ana', locale: 'ro' },
    );
    expect(mail.text).toContain('cere alt abonament din Abonament și consum');
    expect(mail.text).toContain('Cumpără «buyItem» în plus: ');
    // no greeting and no signature in these e-mails
    expect(mail.text).not.toContain('Bună');
  });
});
