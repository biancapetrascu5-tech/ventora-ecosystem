/**
 * Configurația i18n a ecosistemului Ventora.
 * Librărie: next-intl (D-I18N-1, CONFIRMAT)
 * @see docs/ARCHITECTURE.md §10.6
 */

/** Limbile suportate, în ordinea priorității de afișare */
export const SUPPORTED_LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Fallback-ul runtime (dacă o cheie lipsește în limba utilizatorului).
 * @see docs/ARCHITECTURE.md §10.6 (D-I18N-1)
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Limba canonică pentru i18n:check.
 * Toate celelalte limbi trebuie să aibă EXACT aceleași chei ca RO.
 * @see packages/i18n/scripts/check.mjs
 */
export const CANONICAL_LOCALE: Locale = 'ro';

/** Etichetele afișabile ale limbilor (pentru LanguageSwitcher) */
export const LOCALE_LABELS: Record<Locale, string> = {
  ro: 'Romana',
  en: 'English',
  fr: 'Francais',
  es: 'Espanol',
  de: 'Deutsch',
  it: 'Italiano',
};
