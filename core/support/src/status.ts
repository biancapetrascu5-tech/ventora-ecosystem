/*
 * Lot 4.6 — starea unei solicitări de suport (D4-13 = a, D4-14 = b, designul S116).
 *
 * O singură valoare în baza de date (`support.support_request.status`), afișată diferit în
 * Founder (FounderSupportInbox) și în Hub (HubSupport, HubSupportThread):
 *
 *   status              Founder       Hub
 *   open                Deschisă      În lucru       așteaptă echipa
 *   in_progress         În lucru      În lucru       echipa a marcat-o
 *   awaiting_business   În lucru      Răspuns nou    echipa a răspuns, așteaptă afacerea
 *   closed              Închisă       Rezolvat       afacerea o poate redeschide → open
 *
 * Tranzițiile de aici sunt aceleași cu cele din triggerul `support.support_request_guard`
 * (migrarea support_init): baza de date le impune, codul le folosește ca să nu ajungă acolo.
 */

export const SUPPORT_STATUSES = ['open', 'in_progress', 'awaiting_business', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_URGENCIES = ['normal', 'blocking'] as const;
export type SupportUrgency = (typeof SUPPORT_URGENCIES)[number];

/** Cheile din `i18n/support.json` (Hub, 6 limbi): `support.status.*`. */
export type HubStatus = 'newReply' | 'inProgress' | 'resolved';
/** Cheile din `i18n/founder-support.json` (Founder, RO): `founder.inbox.status.*`. */
export type FounderStatus = 'open' | 'progress' | 'closed';

export function hubStatus(status: SupportStatus): HubStatus {
  switch (status) {
    case 'awaiting_business':
      return 'newReply';
    case 'closed':
      return 'resolved';
    default:
      return 'inProgress';
  }
}

export function founderStatus(status: SupportStatus): FounderStatus {
  switch (status) {
    case 'open':
      return 'open';
    case 'closed':
      return 'closed';
    default:
      return 'progress';
  }
}

/** Ce schimbă starea: cine face ce. */
export type SupportAction =
  | 'business_reply'
  | 'business_reopen'
  | 'team_reply'
  | 'team_reply_close'
  | 'team_mark_in_progress'
  | 'team_close'
  | 'system_auto_close';

/** Evenimentul din istoricul stării (`support.support_status_event.kind`). */
export type SupportEventKind =
  | 'opened'
  | 'marked_in_progress'
  | 'team_reply'
  | 'business_reply'
  | 'closed'
  | 'auto_closed'
  | 'reopened';

export class SupportTransitionRefused extends Error {
  constructor(
    readonly from: SupportStatus,
    readonly action: SupportAction,
  ) {
    super(`[support] ${action} is not allowed on a request in ${from}`);
    this.name = 'SupportTransitionRefused';
  }
}

/**
 * Starea următoare după o acțiune, sau SupportTransitionRefused.
 *
 *   - afacerea răspunde: dacă echipa i-a răspuns, solicitarea așteaptă iar echipa (open); altfel
 *     rămâne cum e. Pe una închisă, doar redeschiderea (cu mesaj).
 *   - echipa răspunde: așteaptă afacerea (Hub: „Răspuns nou”); „Trimite și închide” → closed.
 *   - echipa marchează „În lucru” doar ce o așteaptă pe ea (open).
 *   - închiderea automată (S116-D18) doar pentru ce așteaptă afacerea.
 */
export function nextStatus(from: SupportStatus, action: SupportAction): SupportStatus {
  switch (action) {
    case 'business_reply':
      if (from === 'closed') break;
      return from === 'awaiting_business' ? 'open' : from;
    case 'business_reopen':
      if (from !== 'closed') break;
      return 'open';
    case 'team_reply':
      if (from === 'closed') break;
      return 'awaiting_business';
    case 'team_reply_close':
    case 'team_close':
      if (from === 'closed') break;
      return 'closed';
    case 'team_mark_in_progress':
      if (from !== 'open') break;
      return 'in_progress';
    case 'system_auto_close':
      if (from !== 'awaiting_business') break;
      return 'closed';
  }
  throw new SupportTransitionRefused(from, action);
}

/** Ce rând de istoric scrie acțiunea (null: starea nu se schimbă, nu e un eveniment). */
export function eventKindOf(
  action: SupportAction,
  from: SupportStatus,
  to: SupportStatus,
): SupportEventKind | null {
  switch (action) {
    case 'business_reply':
      return from === to ? null : 'business_reply';
    case 'business_reopen':
      return 'reopened';
    case 'team_reply':
      return 'team_reply';
    case 'team_reply_close':
    case 'team_close':
      return 'closed';
    case 'team_mark_in_progress':
      return 'marked_in_progress';
    case 'system_auto_close':
      return 'auto_closed';
  }
}

/** Limitele textelor (aceleași cu CHECK-urile din migrare). PROPUSE: designul nu le dă. */
export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;
/** S116-D18 */
export const AUTO_CLOSE_DAYS = 7;
export const AUTO_CLOSE_WARNING_DAYS_BEFORE = 1;
