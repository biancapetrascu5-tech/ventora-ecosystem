import type { DetailStatus, ListRow } from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';

/* The list of the EasyBook previews (BookingDetail, BookingList): preview.html BK_ROWS with the DE /
   IT names of LX_MAP and the prices of LX_EUR, and the catalogs of the three languages. */

export type Lang = 'ro' | 'de' | 'it';
export type Theme = 'light' | 'dark';
export const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html LX_MAP / LX_EUR
export const LX: Record<string, [string, string]> = {
  'Ana Popescu': ['Anna Schmidt', 'Anna Russo'],
  'Elena Georgescu': ['Elena Hoffmann', 'Elena Ricci'],
  'Andrei Ionescu': ['Andreas Wagner', 'Andrea Marino'],
  'Cristina Dobre': ['Christina Bauer', 'Cristina Greco'],
  'Dan Stoica': ['Daniel Koch', 'Daniele Gallo'],
  'Bianca Marin': ['Bianca Richter', 'Bianca Costa'],
  'Alina Murariu': ['Alina Meyer', 'Alina Barbieri'],
  'Oana Dinu': ['Olivia Braun', 'Olivia Lombardi'],
  'Vlad Cristea': ['Felix Krüger', 'Filippo Caruso'],
  'Ioana Pavel': ['Lena Wolf', 'Chiara Bruno'],
  'Mara Enache': ['Mara Klein', 'Sara Conti'],
  'Radu Matei': ['Jonas Weber', 'Luca Ferri'],
  Ioana: ['Lena', 'Chiara'],
  Mara: ['Mara', 'Sara'],
  Radu: ['Jonas', 'Luca'],
  Vopsit: ['Färben', 'Colore'],
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  Tuns: ['Haarschnitt', 'Taglio'],
  'Manichiură semipermanentă': ['Semipermanente Maniküre', 'Manicure semipermanente'],
  Manichiură: ['Maniküre', 'Manicure'],
  'Coafat eveniment': ['Event-Frisur', 'Acconciatura per eventi'],
  'Tuns bărbați': ['Herrenhaarschnitt', 'Taglio uomo'],
  'Vopsit rădăcini': ['Ansatzfärbung', 'Ritocco radici'],
};
export const lx = (s: string, lang: Lang) =>
  lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s;
const EUR: Record<number, number> = {
  350: 70,
  220: 45,
  120: 25,
  140: 30,
  110: 22,
  260: 55,
  70: 15,
  280: 58,
};
const TODAY: Record<Lang, string> = { ro: 'Azi', de: 'Heute', it: 'Oggi' };
const MIN: Record<Lang, string> = { ro: 'min', de: 'Min.', it: 'min' };
const phone = (p: string, lang: Lang) =>
  lang === 'de' ? `0151 ${p.slice(5)}` : lang === 'it' ? `347 ${p.slice(5)}` : p;

// preview.html BK_ROWS (the 5 earlier states become the 7 of BookingStatuses)
export type Row = [string, string, string, string, string, string, number, number, DetailStatus];
export const ROWS: Row[] = [
  ['1', 'Andrei Ionescu', '0741 123 451', 'Vopsit', 'Ioana', '11:00', 60, 350, 'in_progress'],
  [
    '2',
    'Cristina Dobre',
    '0742 220 118',
    'Tratament facial',
    'Ioana',
    '12:30',
    45,
    220,
    'unconfirmed',
  ],
  ['3', 'Dan Stoica', '0744 551 900', 'Tuns', 'Ioana', '14:30', 45, 120, 'confirmed'],
  [
    '4',
    'Alina Murariu',
    '0723 004 512',
    'Manichiură semipermanentă',
    'Mara',
    '14:00',
    50,
    140,
    'confirmed',
  ],
  ['5', 'Oana Dinu', '0755 300 721', 'Manichiură', 'Mara', '15:00', 50, 110, 'unconfirmed'],
  ['6', 'Bianca Marin', '0740 777 213', 'Coafat eveniment', 'Ioana', '16:00', 60, 260, 'confirmed'],
  ['7', 'Vlad Cristea', '0733 120 004', 'Tuns bărbați', 'Radu', '10:00', 30, 70, 'cancelled'],
  [
    '8',
    'Elena Georgescu',
    '0746 412 980',
    'Vopsit rădăcini',
    'Ioana',
    '10:00',
    60,
    280,
    'completed',
  ],
];
export const rowsOf = (lang: Lang): ListRow[] =>
  ROWS.map(([id, client, p, service, staff, time, dur, price, status]) => ({
    id,
    client: lx(client, lang),
    phone: phone(p, lang),
    service: lx(service, lang),
    staff: lx(staff, lang),
    when: `${TODAY[lang]}, ${time}`,
    duration: `${dur} ${MIN[lang]}`,
    price: lang === 'ro' ? `${price} lei` : `${EUR[price]} €`,
    status,
  }));
export const STAFF = [
  { id: 'ioana', name: 'Ioana Pavel' },
  { id: 'mara', name: 'Mara Enache' },
  { id: 'radu', name: 'Radu Matei' },
];
