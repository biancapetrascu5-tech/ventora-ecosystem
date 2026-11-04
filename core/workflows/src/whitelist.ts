import { InvalidInput } from '@ventora/errors';

/*
 * Lot 4.10 — the whitelist of the workflow engine (S116-D19, D4-24): the triggers, conditions and
 * steps drawn in FounderAutomations. What is not here does not appear in the builder's menus and
 * is refused on the server (here and by the CHECKs of `workflows_init`). Steps only send messages
 * or notifications; none changes data in an application.
 *
 * The Booking triggers are registered but not `available`: Booking core does not exist yet, so
 * nothing emits their events. They start working when Booking emits them (no simulated events).
 * Today only `commercial.quota_threshold` runs (the quota event of Lot 3.3).
 */

export type TriggerSource =
  | { kind: 'event'; type: string; version: number }
  /** A daily run at an hour; the audience (clients, members) comes from Booking. */
  | { kind: 'schedule' };

export interface TriggerDef {
  code: TriggerCode;
  application: 'booking' | 'platform';
  source: TriggerSource;
  /** False until the source emits (Booking core). */
  available: boolean;
  /** Who a run is for (the „Pentru” column). */
  subject: 'client' | 'owner' | 'member';
}

export const TRIGGER_CODES = [
  'booking.appointment_completed',
  'booking.no_show',
  'booking.high_risk',
  'booking.client_inactive',
  'booking.client_birthday',
  'booking.daily_digest',
  'commercial.quota_threshold',
] as const;
export type TriggerCode = (typeof TRIGGER_CODES)[number];

export const TRIGGERS: Readonly<Record<TriggerCode, TriggerDef>> = {
  // „Programarea trece în «Încheiată»” (Mulțumire după programare)
  'booking.appointment_completed': {
    code: 'booking.appointment_completed',
    application: 'booking',
    source: { kind: 'event', type: 'booking.appointment.completed', version: 1 },
    available: false,
    subject: 'client',
  },
  // „Clientul nu a venit”
  'booking.no_show': {
    code: 'booking.no_show',
    application: 'booking',
    source: { kind: 'event', type: 'booking.appointment.no_show', version: 1 },
    available: false,
    subject: 'client',
  },
  // „Clientul ajunge la «Risc ridicat»” (S116-D10: 2 neprezentări în 6 luni)
  'booking.high_risk': {
    code: 'booking.high_risk',
    application: 'booking',
    source: { kind: 'event', type: 'booking.client.high_risk', version: 1 },
    available: false,
    subject: 'owner',
  },
  // „Zilnic · clienți fără programare de {n} săptămâni” (n: setarea afacerii, S116-D22)
  'booking.client_inactive': {
    code: 'booking.client_inactive',
    application: 'booking',
    source: { kind: 'schedule' },
    available: false,
    subject: 'client',
  },
  // „Ziua de naștere a clientului”
  'booking.client_birthday': {
    code: 'booking.client_birthday',
    application: 'booking',
    source: { kind: 'schedule' },
    available: false,
    subject: 'client',
  },
  // „Zilnic, la o oră” · pentru fiecare membru cu programări (Rezumatul zilei)
  'booking.daily_digest': {
    code: 'booking.daily_digest',
    application: 'booking',
    source: { kind: 'schedule' },
    available: false,
    subject: 'member',
  },
  // „O cotă trece de un prag” (Limita aproape atinsă; S116-D21: notificarea S115)
  'commercial.quota_threshold': {
    code: 'commercial.quota_threshold',
    application: 'platform',
    source: { kind: 'event', type: 'commercial.quota.threshold', version: 1 },
    available: true,
    subject: 'owner',
  },
};

/** „Când”: imediat, după 2 ore, după o zi. */
export const DELAYS_MINUTES = [0, 120, 1440] as const;
export type DelayMinutes = (typeof DELAYS_MINUTES)[number];

/** „Condiții”: all must hold, otherwise the run is skipped with the reason. */
export const CONDITION_CODES = [
  'recipient_has_email',
  'recipient_accepts_messages',
  'not_sent_in_30_days',
] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

/** „Pași”: only messages and notifications (S116-D19). */
export const STEP_KINDS = [
  'email.client',
  'email.member',
  'email.owner',
  'notification.hub',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/**
 * The templates each step can send. `available: false` until the texts and their data exist
 * (the Booking e-mails come with Booking core); a run that reaches one fails with
 * `step.unavailable` instead of inventing a message.
 */
export const STEP_TEMPLATES: Readonly<
  Record<StepKind, Readonly<Record<string, { available: boolean }>>>
> = {
  'email.client': {
    thanks: { available: false }, // „Mulțumim pentru vizită”, cu „Lasă o recenzie”
    winback: { available: false }, // „Ne-a fost dor de tine”, cu linkul de rezervare
    birthday: { available: false }, // „La mulți ani”, cu reducerea afacerii (dacă are)
  },
  'email.member': {
    daily_digest: { available: false }, // programările membrului din ziua respectivă
  },
  'email.owner': {
    high_risk: { available: false },
  },
  'notification.hub': {
    high_risk: { available: false },
    // S116-D21: the S115 notification of the limits (in the app and by e-mail, as notifyBillingInTx)
    quota_limit: { available: true },
  },
};

export interface StepInput {
  kind: StepKind;
  template: string;
}

export interface DefinitionInput {
  trigger: TriggerCode;
  /** commercial.quota_threshold: `{ thresholds: [80] }`; the schedules: `{ at: 'HH:MM' }`. */
  triggerParams?: Record<string, unknown>;
  delayMinutes?: DelayMinutes;
  conditions?: readonly ConditionCode[];
  steps: readonly StepInput[];
}

export interface ValidDefinition {
  trigger: TriggerCode;
  triggerParams: Record<string, unknown>;
  delayMinutes: DelayMinutes;
  conditions: ConditionCode[];
  steps: StepInput[];
}

const AT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEMPLATE_RE = /^[a-z][a-z0-9_]{0,63}$/;

function triggerParamsOf(trigger: TriggerCode, raw: unknown): Record<string, unknown> {
  const params = raw ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new InvalidInput('triggerParams');
  const p = params as Record<string, unknown>;
  const def = TRIGGERS[trigger];
  if (trigger === 'commercial.quota_threshold') {
    const keys = Object.keys(p);
    const t = p.thresholds;
    if (
      keys.some((k) => k !== 'thresholds') ||
      !Array.isArray(t) ||
      t.length === 0 ||
      t.some((x) => x !== 80 && x !== 100) ||
      new Set(t).size !== t.length
    ) {
      throw new InvalidInput('triggerParams', 'thresholds: 80 and / or 100');
    }
    return { thresholds: [...(t as number[])].sort((a, b) => a - b) };
  }
  if (def.source.kind === 'schedule') {
    if (Object.keys(p).some((k) => k !== 'at') || typeof p.at !== 'string' || !AT_RE.test(p.at)) {
      throw new InvalidInput('triggerParams', 'at: HH:MM');
    }
    return { at: p.at };
  }
  if (Object.keys(p).length > 0) throw new InvalidInput('triggerParams');
  return {};
}

/** The builder's input, checked against the whitelist; throws InvalidInput on the first miss. */
export function validateDefinition(input: DefinitionInput): ValidDefinition {
  if (!(TRIGGER_CODES as readonly string[]).includes(input?.trigger)) {
    throw new InvalidInput('trigger', 'Not in the whitelist');
  }
  const delayMinutes = input.delayMinutes ?? 0;
  if (!(DELAYS_MINUTES as readonly number[]).includes(delayMinutes)) {
    throw new InvalidInput('delayMinutes');
  }
  const conditions = [...(input.conditions ?? [])];
  if (
    conditions.some((c) => !(CONDITION_CODES as readonly string[]).includes(c)) ||
    new Set(conditions).size !== conditions.length
  ) {
    throw new InvalidInput('conditions', 'Not in the whitelist');
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 10) {
    throw new InvalidInput('steps', 'One to ten steps');
  }
  const steps = input.steps.map((s, i) => {
    if (!(STEP_KINDS as readonly string[]).includes(s?.kind)) {
      throw new InvalidInput(`steps.${i}.kind`, 'Not in the whitelist');
    }
    if (
      typeof s.template !== 'string' ||
      !TEMPLATE_RE.test(s.template) ||
      !Object.hasOwn(STEP_TEMPLATES[s.kind as StepKind], s.template)
    ) {
      throw new InvalidInput(`steps.${i}.template`, 'Not in the whitelist');
    }
    return { kind: s.kind, template: s.template };
  });
  return {
    trigger: input.trigger,
    triggerParams: triggerParamsOf(input.trigger, input.triggerParams),
    delayMinutes,
    conditions,
    steps,
  };
}

/** The triggers that start a run on an outbox event, by event type and version. */
export function triggersForEvent(type: string, version: number): TriggerCode[] {
  return TRIGGER_CODES.filter((code) => {
    const s = TRIGGERS[code].source;
    return s.kind === 'event' && s.type === type && s.version === version;
  });
}

/** The events the engine listens to now (the available event triggers). */
export function availableEventTypes(): { type: string; version: number }[] {
  return TRIGGER_CODES.flatMap((code) => {
    const t = TRIGGERS[code];
    return t.available && t.source.kind === 'event'
      ? [{ type: t.source.type, version: t.source.version }]
      : [];
  });
}

/*
 * The reasons a run or a step ends without sending (the „Motivul” column), as stable codes; the
 * screens translate them. S116: „Clientul nu are adresă de e-mail”, „Adresa respinge
 * e-mailurile…”, „Limita de mesaje automate a afacerii e atinsă”.
 */
export const REASON_CODES = [
  'automation_stopped', // the automation was stopped between the trigger and the run
  'engine_paused', // the central stop was on
  'condition.recipient_has_email',
  'condition.recipient_accepts_messages',
  'condition.not_sent_in_30_days',
  'no_recipient', // nobody to send to (e.g. no active owner)
  'already_sent', // the same message already went (S116-D21: never a second one)
  'stock_quota_no_period', // a stock quota: the S115 texts of the limits need a reset date
  'message_limit_reached', // the business's limit of automated messages (NECESITĂ DECIZIE: key)
  'step.unavailable', // a whitelisted step whose texts or data do not exist yet (Booking)
  'step.failed', // a step threw; „Rulează din nou” retries only the steps not sent
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
