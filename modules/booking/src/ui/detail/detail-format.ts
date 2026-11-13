/* BookingDetail / BookingStatuses: the pure part — the look of the 7 states (S116 f: tone and
   icon, D-B-11 ids → the booking.status.* keys), the actions each state allows (the same map as
   TRANSITIONS in server/appointments.ts and the BookingStatuses README), the history line of an
   appointment_history row. No React, no texts: the view and the tests use it. */

export type DetailStatus =
  | 'awaiting_payment'
  | 'unconfirmed'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

type Tone = 'neutral' | 'attention' | 'done' | 'danger';
type Icon = 'wallet' | 'clock' | 'check' | 'circle-dot' | 'check-check' | 'x' | 'circle-x';

/** BookingStatuses ST: the StatusPill of each state; `key` is the booking.status.* key. */
export const STATUS_LOOK: Record<DetailStatus, { key: string; tone: Tone; icon: Icon }> = {
  awaiting_payment: { key: 'awaitingPayment', tone: 'neutral', icon: 'wallet' },
  unconfirmed: { key: 'unconfirmed', tone: 'neutral', icon: 'clock' },
  confirmed: { key: 'confirmed', tone: 'neutral', icon: 'check' },
  in_progress: { key: 'inProgress', tone: 'attention', icon: 'circle-dot' },
  completed: { key: 'done', tone: 'done', icon: 'check-check' },
  cancelled: { key: 'cancelled', tone: 'neutral', icon: 'x' },
  no_show: { key: 'noShow', tone: 'danger', icon: 'circle-x' },
};

export const FINAL: ReadonlySet<DetailStatus> = new Set(['completed', 'cancelled', 'no_show']);

/** The actions of the drawer: the footer's main ones and the „…” menu. */
export type DetailAction =
  | 'resendPay'
  | 'move'
  | 'confirm'
  | 'start'
  | 'collect'
  | 'complete'
  | 'rebook'
  | 'noShow'
  | 'cancel'
  | 'correct'
  | 'duplicate';

export type ActionContext = {
  /** booking:write on this appointment (a member: only their own). */
  canWrite: boolean;
  /** The owner or an admin (S116-D9): „Corectează starea…”. */
  canCorrect: boolean;
  /** The start time has passed: „Nu a venit” (D-B4: only after the start). */
  started: boolean;
  /** Within 24 h of the final state (S116-D9). */
  correctable: boolean;
  /** „Încasează” has a screen (BookingPayments, screen 5); until then „Marchează ca încheiată”. */
  canCollect?: boolean;
  /** „Retrimite linkul de plată” has a provider (B.22). */
  canResendPay?: boolean;
};

/**
 * BookingStatuses DET, from the state: the footer (the main action last, as the design) and the
 * menu. A final state offers „Programează din nou” and, for the owner or an admin within 24 h,
 * „Corectează starea…”; nothing else is offered (S116 f).
 */
export function actionsFor(
  status: DetailStatus,
  c: ActionContext,
): { footer: DetailAction[]; menu: DetailAction[] } {
  if (!c.canWrite) return { footer: [], menu: [] };
  const noShow: DetailAction[] = c.started ? ['noShow'] : [];
  switch (status) {
    case 'awaiting_payment':
      return { footer: c.canResendPay ? ['resendPay'] : [], menu: ['cancel'] };
    case 'unconfirmed':
      return { footer: ['move', 'confirm'], menu: [...noShow, 'cancel'] };
    case 'confirmed':
      return { footer: ['move', 'start'], menu: [...noShow, 'cancel'] };
    case 'in_progress':
      // decided 13.11.2026: no cancellation from „În desfășurare” (TRANSITIONS: only → completed;
      // S147 took it out of the preview). S147 puts „Corectează starea…” in this menu, but the
      // correction is only for final states (S116-D9, correctAppointmentStatus): NECESITĂ DECIZIE
      return { footer: [c.canCollect ? 'collect' : 'complete'], menu: [] };
    case 'completed':
    case 'cancelled':
    case 'no_show':
      return {
        footer: ['rebook'],
        menu: c.canCorrect && c.correctable && status !== 'cancelled' ? ['correct'] : [],
      };
  }
}

/** S116-D9: only „Încheiată” ↔ „Nu a venit”, within 24 hours of the change. */
export function correctTarget(status: DetailStatus): 'completed' | 'no_show' | null {
  return status === 'completed' ? 'no_show' : status === 'no_show' ? 'completed' : null;
}

export const CORRECT_WINDOW_MS = 24 * 3_600_000;

export type HistoryRow = {
  kind: 'created' | 'status' | 'moved' | 'corrected' | 'updated';
  toStatus: DetailStatus | null;
  actorType: 'user' | 'client' | 'system';
  /** The person's name (the team member who did it), when known. */
  actor: string | null;
  /** For 'moved': the local times before and after. */
  from?: string | null;
  to?: string | null;
  source?: 'hub' | 'public';
};

/** The booking.detail.h.* key and its values for one history row. */
export function historyLine(r: HistoryRow): { key: string; vars: Record<string, string> } {
  const name = r.actor;
  type Line = { key: string; vars: Record<string, string> };
  const by = (k: string): Line =>
    r.actorType === 'client'
      ? { key: `${k}Client`, vars: {} }
      : name
        ? { key: k, vars: { name } }
        : { key: `${k}System`, vars: {} };
  switch (r.kind) {
    case 'created':
      if (r.actorType === 'client' || r.source === 'public')
        return { key: 'createdOnline', vars: {} };
      return name ? { key: 'createdBy', vars: { name } } : { key: 'created', vars: {} };
    case 'moved':
      return name
        ? { key: 'moved', vars: { name, from: r.from ?? '', to: r.to ?? '' } }
        : { key: 'movedSystem', vars: { from: r.from ?? '', to: r.to ?? '' } };
    case 'corrected':
      return { key: 'corrected', vars: { name: name ?? '', status: r.toStatus ?? '' } };
    case 'updated':
      return name ? { key: 'updated', vars: { name } } : { key: 'updatedSystem', vars: {} };
    case 'status':
      switch (r.toStatus) {
        case 'confirmed': {
          const x = by('confirmed');
          return x;
        }
        case 'in_progress':
          return name ? { key: 'started', vars: { name } } : { key: 'startedSystem', vars: {} };
        case 'completed':
          return name ? { key: 'completed', vars: { name } } : { key: 'completedSystem', vars: {} };
        case 'cancelled':
          return r.actorType === 'client'
            ? { key: 'cancelledClient', vars: {} }
            : name
              ? { key: 'cancelled', vars: { name } }
              : { key: 'cancelledSystem', vars: {} };
        case 'no_show':
          return name ? { key: 'noShow', vars: { name } } : { key: 'noShowSystem', vars: {} };
        default:
          return name ? { key: 'updated', vars: { name } } : { key: 'updatedSystem', vars: {} };
      }
  }
}
