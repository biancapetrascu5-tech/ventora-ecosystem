import { getRequestConfig } from 'next-intl/server';
import hub from '@ventora/i18n/messages/ro.json';
import founder from '@ventora/i18n/messages/founder/ro.json';

/* Founder e doar în română (S57). Textele comune ale ecranelor de autentificare (auth.*, ui.*)
   vin din catalogul RO al Hub-ului; cele proprii Founder, din messages/founder/ro.json. */
export default getRequestConfig(async () => ({
  locale: 'ro',
  messages: { ...hub, ...founder },
  timeZone: 'Europe/Bucharest',
}));
