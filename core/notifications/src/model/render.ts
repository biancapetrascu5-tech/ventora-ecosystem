import { CANONICAL_LOCALE, type Locale } from '@ventora/i18n';
import { fill } from '../templates/messages';
import type { NotificationTemplate } from './catalog';
import { notificationText } from './texts';
import { resolveParams, type NotificationParams } from './values';

export { notificationText, toLocale } from './texts';

/** Title and body of a notification, in the reader's language (values too, D4-28). */
export function renderNotification(
  template: NotificationTemplate,
  params: NotificationParams,
  locale: Locale,
): { title: string; body?: string; action?: string } {
  if (template.textsPending) {
    throw new Error(`[notifications] ${template.type}@${template.version}: its texts are pending`);
  }
  const values = resolveParams(params, locale);
  return {
    title: fill(notificationText(locale, template.titleKey), values),
    ...(template.bodyKey ? { body: fill(notificationText(locale, template.bodyKey), values) } : {}),
    // S115: „Vezi factura →” / „Plătește {amount}” under the text in the panel
    ...(template.actionKey
      ? { action: fill(notificationText(locale, template.actionKey), values) }
      : {}),
  };
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** The i18n keys a template renders (panel and, if designed, e-mail). */
export function templateKeys(template: NotificationTemplate): string[] {
  return [
    template.titleKey,
    template.bodyKey,
    template.actionKey,
    ...(template.email
      ? [
          template.email.subjectKey,
          template.email.eyebrowKey,
          template.email.leadKey,
          ...template.email.nextKeys,
          template.email.whyKey,
        ]
      : []),
  ].filter((k): k is string => !!k);
}

/**
 * Lot 4.5: the params a template needs, from its texts in the canonical language (`{title}` in
 * the e-mail subject is the rendered title, not a param). `send` refuses a notification without
 * them, so a missing value never breaks the panel or the e-mail later.
 */
export function requiredParams(template: NotificationTemplate): string[] {
  const names = new Set<string>();
  for (const key of templateKeys(template)) {
    for (const m of notificationText(CANONICAL_LOCALE, key).matchAll(PLACEHOLDER)) {
      if (m[1] !== 'title') names.add(m[1]!);
    }
  }
  return [...names].sort();
}

/** The placeholders of one text in one language (the render tests compare the 6 languages). */
export function placeholdersOf(locale: Locale, key: string): string[] {
  return [
    ...new Set([...notificationText(locale, key).matchAll(PLACEHOLDER)].map((m) => m[1]!)),
  ].sort();
}
