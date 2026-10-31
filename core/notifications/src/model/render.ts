import ro from '@ventora/i18n/messages/ro.json';
import en from '@ventora/i18n/messages/en.json';
import fr from '@ventora/i18n/messages/fr.json';
import es from '@ventora/i18n/messages/es.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import { CANONICAL_LOCALE, SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import { fill } from '../templates/messages';
import type { NotificationTemplate } from './catalog';

// The notification texts live in the shared catalogs, namespace `notifications` (synced from the
// design's i18n/notifications.json); i18n:check keeps the 6 languages in sync.
type Tree = { [key: string]: string | Tree };
const CATALOGS = { ro, en, fr, es, de, it } as unknown as Record<Locale, { notifications?: Tree }>;

export function toLocale(value: string | null | undefined): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : CANONICAL_LOCALE;
}

/** A text of the `notifications` namespace in a language (falls back to the RO catalog). */
export function notificationText(locale: Locale, dottedKey: string): string {
  const lookup = (tree: Tree | undefined): string | undefined => {
    let cur: string | Tree | undefined = tree;
    for (const part of dottedKey.split('.')) {
      if (typeof cur !== 'object' || cur === null) return undefined;
      cur = cur[part];
    }
    return typeof cur === 'string' ? cur : undefined;
  };
  const text =
    lookup(CATALOGS[locale]?.notifications) ?? lookup(CATALOGS[CANONICAL_LOCALE].notifications);
  if (text === undefined)
    throw new Error(`[notifications] missing text: notifications.${dottedKey}`);
  return text;
}

/** Title and body of a notification, in the reader's language. */
export function renderNotification(
  template: NotificationTemplate,
  params: Readonly<Record<string, string>>,
  locale: Locale,
): { title: string; body?: string; action?: string } {
  if (template.textsPending) {
    throw new Error(`[notifications] ${template.type}@${template.version}: its texts are pending`);
  }
  return {
    title: fill(notificationText(locale, template.titleKey), { ...params }),
    ...(template.bodyKey
      ? { body: fill(notificationText(locale, template.bodyKey), { ...params }) }
      : {}),
    // S115: „Vezi factura →” / „Plătește {amount}” under the text in the panel
    ...(template.actionKey
      ? { action: fill(notificationText(locale, template.actionKey), { ...params }) }
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
