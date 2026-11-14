import type { PoolClient } from 'pg';
import { readBusinessWeek } from './staff';

/* Lot B.11c — what the public pages show beyond the booking itself (decisions of the founder,
   14.11): the salon's phone („Sună la salon”, „Sunați la salon și vă găsim o oră: {phone}”, the
   manage page when it is too late or online changes are closed), today's hours at the choice of
   the salon (B.10, „Azi: 09:00–19:00” / „Închis azi”) and the client's e-mail, masked, on the
   confirmation. Nothing the client did not see already: the phone and the hours are the salon's
   public details; the e-mail is the one the client typed. */

/** „Azi”: the business's hours for today in its zone (per location: the lot after B.22). */
export type TodayHours = { open: false } | { open: true; opensAt: string; closesAt: string };

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** ISO weekday (1 = Monday … 7 = Sunday) of `now` in the zone. */
function weekdayIn(timeZone: string, now: Date): number {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day) + 1;
}

export async function todayHours(
  client: PoolClient,
  timeZone: string,
  now = new Date(),
): Promise<TodayHours> {
  const week = await readBusinessWeek(client);
  const d = week.find((x) => x.weekday === weekdayIn(timeZone, now));
  if (!d || !d.isOpen || d.opensAtMin === null || d.closesAtMin === null) return { open: false };
  return { open: true, opensAt: hhmm(d.opensAtMin), closesAt: hhmm(d.closesAtMin) };
}

/**
 * „V-am trimis un e-mail la …”: the first two characters of the name (one for a short name),
 * then ***, then the domain — cristina.dobre@gmail.com → cr***@gmail.com.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  return `${name.slice(0, name.length > 2 ? 2 : 1)}***${email.slice(at)}`;
}
