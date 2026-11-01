import ro from '@ventora/i18n/messages/ro.json';
import en from '@ventora/i18n/messages/en.json';
import fr from '@ventora/i18n/messages/fr.json';
import es from '@ventora/i18n/messages/es.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import { CANONICAL_LOCALE, SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';

// The notification texts live in the shared catalogs, namespace `notifications` (synced from the
// design's i18n/notifications.json); i18n:check keeps the 6 languages in sync.
type Tree = { [key: string]: string | Tree };
const CATALOGS = { ro, en, fr, es, de, it } as unknown as Record<Locale, Tree>;

export function toLocale(value: string | null | undefined): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : CANONICAL_LOCALE;
}

function lookup(tree: Tree | undefined, dottedKey: string): string | undefined {
  let cur: string | Tree | undefined = tree;
  for (const part of dottedKey.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** A text of the shared catalogs (full key, any namespace), or undefined when there is none. */
export function catalogText(locale: Locale, fullKey: string): string | undefined {
  return lookup(CATALOGS[locale], fullKey) ?? lookup(CATALOGS[CANONICAL_LOCALE], fullKey);
}

/** A text of the `notifications` namespace in a language (falls back to the RO catalog). */
export function notificationText(locale: Locale, dottedKey: string): string {
  const text = catalogText(locale, `notifications.${dottedKey}`);
  if (text === undefined)
    throw new Error(`[notifications] missing text: notifications.${dottedKey}`);
  return text;
}
