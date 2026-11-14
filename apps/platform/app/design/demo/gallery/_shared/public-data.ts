import ro from '@ventora/i18n/messages/ro.json';
import en from '@ventora/i18n/messages/en.json';
import fr from '@ventora/i18n/messages/fr.json';
import es from '@ventora/i18n/messages/es.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingEn from '@ventora/booking/messages/en.json';
import bookingFr from '@ventora/booking/messages/fr.json';
import bookingEs from '@ventora/booking/messages/es.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';
import type { PublicBrand } from '@ventora/booking/ui';

/* The public pages (BookingPublic, BookingClientManage) in the gallery: preview.html PUB / SVC /
   MEMBERS / DAYS / SLOTS and the S148 brand (B148_FULL), in the six languages. */

export type PL = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
export const PUBLIC_MESSAGES: Record<PL, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  en: { ...en, booking: bookingEn },
  fr: { ...fr, booking: bookingFr },
  es: { ...es, booking: bookingEs },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

export const PUB: Record<
  PL,
  {
    addr: string;
    phone: string;
    when: string;
    whenShort: string;
    next: string;
    nextShort: string;
    left: string;
    email: string;
    name: string;
    tel: string;
  }
> = {
  ro: {
    addr: 'Str. Nicolae Bălcescu 12, Sibiu',
    phone: '0722 123 456',
    when: 'vineri, 6 noiembrie, la 12:30',
    whenShort: 'Vin, 6 nov. · 12:30',
    next: 'luni, 9 noiembrie',
    nextShort: 'luni, 9 nov.',
    left: '9:42',
    email: 'cristina.dobre@gmail.com',
    name: 'Cristina Dobre',
    tel: '0742 220 118',
  },
  en: {
    addr: '12 Nicolae Bălcescu St, Sibiu',
    phone: '+40 722 123 456',
    when: 'on Friday 6 November at 12:30',
    whenShort: 'Fri 6 Nov · 12:30',
    next: 'Monday 9 November',
    nextShort: 'Mon 9 Nov',
    left: '9:42',
    email: 'cristina.dobre@gmail.com',
    name: 'Cristina Dobre',
    tel: '+40 742 220 118',
  },
  fr: {
    addr: '12 rue Nicolae Bălcescu, Sibiu',
    phone: '+40 722 123 456',
    when: 'vendredi 6 novembre à 12h30',
    whenShort: 'ven. 6 nov. · 12:30',
    next: 'lundi 9 novembre',
    nextShort: 'lun. 9 nov.',
    left: '9:42',
    email: 'cristina.dobre@gmail.com',
    name: 'Cristina Dobre',
    tel: '+40 742 220 118',
  },
  es: {
    addr: 'C/ Nicolae Bălcescu 12, Sibiu',
    phone: '+40 722 123 456',
    when: 'el viernes 6 de noviembre a las 12:30',
    whenShort: 'vie 6 nov · 12:30',
    next: 'lunes 9 de noviembre',
    nextShort: 'lun 9 nov',
    left: '9:42',
    email: 'cristina.dobre@gmail.com',
    name: 'Cristina Dobre',
    tel: '+40 742 220 118',
  },
  de: {
    addr: 'Str. Nicolae Bălcescu 12, Sibiu',
    phone: '+40 722 123 456',
    when: 'am Freitag, 6. November, um 12:30 Uhr',
    whenShort: 'Fr., 6. Nov. · 12:30',
    next: 'Montag, 9. November',
    nextShort: 'Mo., 9. Nov.',
    left: '9:42',
    email: 'christina.bauer@web.de',
    name: 'Christina Bauer',
    tel: '+49 151 2345 6789',
  },
  it: {
    addr: 'Via Nicolae Bălcescu 12, Sibiu',
    phone: '+40 722 123 456',
    when: 'venerdì 6 novembre alle 12:30',
    whenShort: 'ven 6 nov · 12:30',
    next: 'lunedì 9 novembre',
    nextShort: 'lun 9 nov',
    left: '9:42',
    email: 'cristina.greco@libero.it',
    name: 'Cristina Greco',
    tel: '+39 347 123 4567',
  },
};

// [id, name, minutes, price, deposit?]
export const SVC: Record<PL, [string, string, number, number, number?][]> = {
  ro: [
    ['tuns', 'Tuns', 45, 120],
    ['vopsit', 'Vopsit', 90, 350, 50],
    ['facial', 'Tratament facial', 60, 220],
    ['mani', 'Manichiură semipermanentă', 60, 140],
  ],
  en: [
    ['tuns', 'Haircut', 45, 120],
    ['vopsit', 'Colour', 90, 350, 50],
    ['facial', 'Facial', 60, 220],
    ['mani', 'Gel manicure', 60, 140],
  ],
  fr: [
    ['tuns', 'Coupe', 45, 120],
    ['vopsit', 'Coloration', 90, 350, 50],
    ['facial', 'Soin du visage', 60, 220],
    ['mani', 'Manucure semi-permanente', 60, 140],
  ],
  es: [
    ['tuns', 'Corte', 45, 120],
    ['vopsit', 'Color', 90, 350, 50],
    ['facial', 'Tratamiento facial', 60, 220],
    ['mani', 'Manicura semipermanente', 60, 140],
  ],
  de: [
    ['tuns', 'Haarschnitt', 45, 120],
    ['vopsit', 'Färben', 90, 350, 50],
    ['facial', 'Gesichtsbehandlung', 60, 220],
    ['mani', 'Semipermanente Maniküre', 60, 140],
  ],
  it: [
    ['tuns', 'Taglio', 45, 120],
    ['vopsit', 'Colore', 90, 350, 50],
    ['facial', 'Trattamento viso', 60, 220],
    ['mani', 'Manicure semipermanente', 60, 140],
  ],
};

const MEMBERS_RO: [string, string, string][] = [
  ['ioana', 'Ioana Pavel', 'Coafor'],
  ['mara', 'Mara Enache', 'Coafor și manichiură'],
  ['radu', 'Radu Matei', 'Frizerie'],
];
export const MEMBERS: Partial<Record<PL, [string, string, string][]>> = {
  ro: MEMBERS_RO,
  de: [
    ['ioana', 'Lena Wolf', 'Friseurin'],
    ['mara', 'Mara Klein', 'Friseurin und Maniküre'],
    ['radu', 'Jonas Weber', 'Barbier'],
  ],
  it: [
    ['ioana', 'Chiara Bruno', 'Parrucchiera'],
    ['mara', 'Sara Conti', 'Parrucchiera e manicure'],
    ['radu', 'Luca Ferri', 'Barbiere'],
  ],
};
export const mem = (l: PL) => MEMBERS[l] ?? MEMBERS_RO;

export const DAYS: Partial<Record<PL, string[]>> = {
  ro: ['Mie 4', 'Joi 5', 'Vin 6', 'Sâm 7', 'Lun 9'],
  de: ['Mi 4', 'Do 5', 'Fr 6', 'Sa 7', 'Mo 9'],
  it: ['Mer 4', 'Gio 5', 'Ven 6', 'Sab 7', 'Lun 9'],
};
export const DAY_ISO = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09'];

export const SLOTS: { time: string; available: boolean }[] = (
  [
    ['09:00', false],
    ['09:45', false],
    ['10:30', true],
    ['11:15', false],
    ['12:30', true],
    ['13:15', true],
    ['14:00', false],
    ['15:30', true],
    ['16:15', true],
    ['17:00', true],
  ] as const
).map(([time, available]) => ({ time, available }));

const svg = (stroke: string, text: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64"><circle cx="32" cy="32" r="22" fill="none" stroke="${stroke}" stroke-width="5"/><path d="M14 34h36" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="14" r="5" fill="#E9B872"/><text x="66" y="42" font-family="Georgia, serif" font-size="28" fill="${text}">Salon Aurora</text></svg>`,
  )}`;

// preview.html B148_FULL
export const BRAND_FULL: PublicBrand = {
  logo: svg('#7A2E4D', '#3B1626'),
  logoDark: svg('#F3C9D9', '#FFF6F0'),
  primary: '#7A2E4D',
  accent: '#E9B872',
  font: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
};

export const lei = (n: number) => `${n} lei`;
