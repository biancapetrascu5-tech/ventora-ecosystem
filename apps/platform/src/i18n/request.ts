import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import { LOCALE_COOKIE } from './locale';

const isLocale = (v: string | undefined): v is Locale =>
  !!v && (SUPPORTED_LOCALES as readonly string[]).includes(v);

/* Limba Hub-ului (PROPUS): cookie-ul ales din selectorul de limbă, apoi prima limbă suportată din
   Accept-Language, apoi româna. Fără segment de limbă în URL (linkurile din e-mailuri sunt neutre, B-4). */
async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return 'ro';
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`@ventora/i18n/messages/${locale}.json`)).default;
  return { locale, messages, timeZone: 'Europe/Bucharest' };
});
