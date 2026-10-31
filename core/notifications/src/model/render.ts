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
): { title: string; body?: string } {
  if (template.textsPending) {
    throw new Error(`[notifications] ${template.type}@${template.version}: texts come in Lot 4.5`);
  }
  return {
    title: fill(notificationText(locale, template.titleKey), { ...params }),
    ...(template.bodyKey
      ? { body: fill(notificationText(locale, template.bodyKey), { ...params }) }
      : {}),
  };
}
