/* The public pages (BookingPublic, BookingClientManage): the dates of the business as the client
   reads them, in the client's language. Pure: the screens and the tests use it. Dates are local
   „YYYY-MM-DD” of the business; the time zone of Intl is UTC so the day never shifts. */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const cap = (s: string) => (s ? s[0]!.toLocaleUpperCase() + s.slice(1) : s);

export function addDays(iso: string, n: number): string {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** „Vin 6”: a day of the phone's strip. */
export function stripLabel(iso: string, locale: string): string {
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    .format(at(iso))
    .replace('.', '');
  return `${cap(wd)} ${at(iso).getUTCDate()}`;
}

/** „Vin, 6 nov. · 12:30”: the summary's „Când”. */
export function whenShort(iso: string, time: string, locale: string): string {
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    .format(at(iso))
    .replace('.', '');
  const dm = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(at(iso));
  return `${cap(wd)}, ${dm} · ${time}`;
}

/** „vineri, 6 noiembrie”: a day in a sentence. */
export function dayLong(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(at(iso));
}

/** „luni, 9 nov.”: the first free day on a button. */
export function dayShort(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(at(iso));
}

/** The time left of a hold, „9:42”; „0:00” once passed. */
export function leftOf(expiresAt: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The days of the phone's strip: from today, `n` days. */
export function stripDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

/**
 * B.11c: the salon's phone as the client reads it — a Romanian number (+40…) as „0722 123 456”,
 * any other as stored (E.164). The link `tel:` keeps the E.164 form.
 */
export function phoneText(e164: string): string {
  const m = /^\+40(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** B.11c: „09:00–19:00” for the location's hours today; null when closed. */
export function todayText(t: { open: false } | { open: true; opensAt: string; closesAt: string }) {
  return t.open ? `${t.opensAt}–${t.closesAt}` : null;
}

/** The client-side checks before „Trimite codul” (the contract checks again). */
export function checkDetails(f: { name: string; phone: string; email: string }) {
  const errors: Partial<Record<'name' | 'phone' | 'email', true>> = {};
  if (!f.name.trim()) errors.name = true;
  if (f.phone.replace(/\D/g, '').length < 9) errors.phone = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = true;
  return errors;
}

/** „20261106T103000Z” */
const icsTime = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
/** RFC 5545 text: backslash, semicolon, comma and line breaks escaped. */
const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * „Adaugă în calendar”: one event as an .ics file (RFC 5545), generated in the page. The times are
 * UTC instants, so every calendar shows them in its own zone.
 */
export function icsOf(e: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  description?: string | null;
  now: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ventora Systems//EasyBook//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsTime(e.now)}`,
    `DTSTART:${icsTime(e.startsAt)}`,
    `DTEND:${icsTime(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** Downloads the .ics in the browser. */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
