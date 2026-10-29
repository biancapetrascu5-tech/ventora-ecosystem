/* Cookie-ul limbii alese din LanguageSwitcher (ecranele de autentificare și Contul tău). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Salvează limba aleasă pentru un an; pagina se reîncarcă din server cu noile texte. */
export function rememberLocale(code: string): void {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax`;
}
