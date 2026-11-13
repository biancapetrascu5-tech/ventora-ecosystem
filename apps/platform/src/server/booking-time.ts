/* EasyBook screens (BookingCalendar, BookingToday): instants as the business's local days and
   „HH:MM” (C.0 time zone), computed on the server so the screens never depend on the browser's
   zone. Pure helpers, no session: the server actions call them after authorize(). */

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes from midnight → „HH:MM”. */
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** An instant as the business's local day and „HH:MM”. */
export function localOf(at: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const noonOf = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

export const addDays = (iso: string, n: number) =>
  new Date(noonOf(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** 1 = Monday … 7 = Sunday */
export const weekdayOf = (iso: string) => ((new Date(noonOf(iso)).getUTCDay() + 6) % 7) + 1;

/** The instants that can fall on the local days [first, last] in any zone (±14 h around UTC). */
export function instantsAround(first: string, last: string): { from: string; to: string } {
  return {
    from: new Date(Date.parse(`${first}T00:00:00Z`) - 14 * 3_600_000).toISOString(),
    to: new Date(Date.parse(`${addDays(last, 1)}T00:00:00Z`) + 14 * 3_600_000).toISOString(),
  };
}

/** „HH:MM” → minutes from midnight. */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const OCCUPYING = new Set(['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress']);

/**
 * „După 15:00 mai ai 3 ore libere”: from the end of the day's last appointment that still holds
 * time (or now) until the business closes, in whole hours, at least one. Nothing on an empty day.
 */
export function freeAfter(
  appointments: { start: string; end: string; status: string }[],
  now: string,
  closesAt: string,
): { time: string; hours: number } | null {
  const holding = appointments.filter((a) => OCCUPYING.has(a.status) || a.status === 'completed');
  if (holding.length === 0) return null;
  const lastEnd = holding.reduce((m, a) => Math.max(m, minutesOf(a.end)), 0);
  const from = Math.max(minutesOf(now), lastEnd);
  const hours = Math.floor((minutesOf(closesAt) - from) / 60);
  if (hours < 1) return null;
  return { time: hhmm(from), hours };
}
