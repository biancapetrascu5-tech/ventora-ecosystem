import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { commercialEntitlementProvider } from '@ventora/commercial';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { guardBulkOp } from '@ventora/db-kit';
import { deliverEmail } from '@ventora/notifications';
import { findPublicOrganization, listLocations } from '@ventora/organizations';
import { makePublicContext } from './actor';
import {
  activeQuestions,
  questionsForService,
  toPublicQuestion,
  validateAnswers,
  writeAnswers,
  type FormAnswer,
  type PublicFormQuestion,
} from './forms';
import {
  createAppointmentInOrg,
  getBookingSettingsInOrg,
  normalizePublicContact,
  publicClientInOrg,
  type ClientInput,
  type ClientLocale,
} from './appointments';
import { getFreeSlotsInOrg, type FreeSlots } from './availability';
import { isHighRisk } from './behavior';
import { withBookingTx } from './db';
import { locationFilter } from './locations';
import { issueManageToken } from './manage-token';
import { isUuid } from './validation';

/*
 * Lot B.11a — the public booking, without an account (BOOKING.md §3 B.11; design BookingPublic,
 * S116; D-B-5, D-B-6). The page lives at app.ventora-hub.com/r/<slug> (the route and the screen
 * are the UI lot); these are the server steps it calls:
 *
 *   getPublicBookingPage   the business, its locations, the services and members bookable online
 *   getPublicFreeSlots     the free times, mode 'online' (notice, horizon, held times excluded)
 *   startPublicBooking     the anti-robot check (Turnstile, on the server), the limits per IP and
 *                          per e-mail, a blocked client refused without saying why, the time held
 *                          10 minutes, the 6-digit code by e-mail
 *   verifyPublicBooking    the code (5 tries) → the client (found or new) and the appointment
 *                          (source 'public', the quota booking.appointments as from the Hub);
 *                          manual confirmation (or „Risc ridicat”, until the deposit of B.22)
 *                          gives „Neconfirmată”
 *   resendPublicBookingCode after 60 s, at most 3 sends
 *
 * T1: the business comes only from the slug (findPublicOrganization: active businesses only); a
 * hold id of another business is not found (RLS on public_hold, in that business's context).
 * Personal data: the hold keeps name, phone, e-mail and the message only while pending; the code
 * and the IP only as SHA-256. No audit category, no role, no package: Turnstile is one fetch.
 */

export const PUBLIC_LIMITS = {
  holdMinutes: 10,
  codeAttempts: 5,
  resendAfterSeconds: 60,
  sends: 3,
  perIpPerHour: 10,
  perEmailPerDay: 5,
  message: 500,
} as const;

// ── the anti-robot check (D-B-6: Cloudflare Turnstile, verified on the server) ────────────────

export type CaptchaVerifier = (token: string, ip: string | null) => Promise<boolean>;

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Without TURNSTILE_SECRET_KEY nothing passes (the keys are set by the founder). */
const turnstile: CaptchaVerifier = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
};

let captcha: CaptchaVerifier = turnstile;

/** Tests (and a future second provider) replace the verifier; undefined puts Turnstile back. */
export function configurePublicBooking(opts: { captcha?: CaptchaVerifier }): void {
  captcha = opts.captcha ?? turnstile;
}

// ── the context of the page ─────────────────────────────────────────────────────────────────

export type PublicPlace = { ctx: TenantContext; name: string; timeZone: string };

/** The business of the slug, when it is active, has an owner and has Booking; else not found. */
export async function place(slug: unknown): Promise<PublicPlace> {
  const org = await findPublicOrganization(slug);
  if (!org || !org.ownerUserId) throw new ResourceNotFound();
  if (!(await commercialEntitlementProvider.isEnabled(org.organizationId, 'booking'))) {
    throw new ResourceNotFound();
  }
  return {
    ctx: makePublicContext(org.organizationId, org.ownerUserId),
    name: org.name,
    timeZone: org.timeZone,
  };
}

export const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const codeHash = (holdId: string, code: string) => sha256(`${holdId}:${code}`);

function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// ── the page ────────────────────────────────────────────────────────────────────────────────

export type PublicBookingPage = {
  name: string;
  timeZone: string;
  locations: Array<{ id: string; name: string; address: string | null }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    durationMaxMinutes: number | null;
    priceKind: 'fixed' | 'from' | 'range';
    priceMinor: number;
    priceMaxMinor: number | null;
    currency: string;
    /** The members bookable online who do it, in the team's order. */
    staff: Array<{ id: string; displayName: string }>;
  }>;
  /**
   * B.12: the salon's questions, in order („Câteva întrebări de la salon”); the page shows at the
   * details step only those of the chosen service (serviceIds null = every service).
   */
  questions: PublicFormQuestion[];
};

export async function getPublicBookingPage(slug: unknown): Promise<PublicBookingPage> {
  const p = await place(slug);
  const locations = (await listLocations({ organizationId: p.ctx.organizationId })).filter(
    (l) => l.timeZone === p.timeZone,
  );
  const services = await withBookingTx(
    p.ctx.organizationId,
    async (client) => {
      const svc = (
        await client.query<{
          id: string;
          name: string;
          duration_minutes: number;
          duration_max_minutes: number | null;
          price_kind: 'fixed' | 'from' | 'range';
          price_minor: number;
          price_max_minor: number | null;
          currency: string;
        }>(
          `SELECT id, name, duration_minutes, duration_max_minutes, price_kind, price_minor,
                  price_max_minor, currency
             FROM booking.service
            WHERE archived_at IS NULL AND bookable_online
            ORDER BY sort_order, name, id`,
        )
      ).rows;
      // B.2b: a member does a service when „Toate serviciile” or when it is linked to them
      const staff = (
        await client.query<{ service_id: string; id: string; display_name: string }>(
          `SELECT s.id AS service_id, m.id, m.display_name
             FROM booking.service s
             JOIN booking.staff_member m ON m.archived_at IS NULL AND m.bookable_online
            WHERE s.archived_at IS NULL AND s.bookable_online
              AND (m.all_services OR EXISTS (
                    SELECT 1 FROM booking.staff_service l
                     WHERE l.staff_member_id = m.id AND l.service_id = s.id
                       AND l.archived_at IS NULL))
            ORDER BY m.sort_order, m.display_name, m.id`,
        )
      ).rows;
      return svc
        .map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.duration_minutes,
          durationMaxMinutes: s.duration_max_minutes,
          priceKind: s.price_kind,
          priceMinor: s.price_minor,
          priceMaxMinor: s.price_max_minor,
          currency: s.currency,
          staff: staff
            .filter((m) => m.service_id === s.id)
            .map((m) => ({ id: m.id, displayName: m.display_name })),
        }))
        .filter((s) => s.staff.length > 0); // S129: a service nobody does is not shown
    },
    true,
  );
  const shown = new Set(services.map((s) => s.id));
  const questions = (
    await withBookingTx(p.ctx.organizationId, (client) => activeQuestions(client), true)
  )
    .filter((q) => q.serviceIds === null || q.serviceIds.some((id) => shown.has(id)))
    .map(toPublicQuestion);
  return {
    name: p.name,
    timeZone: p.timeZone,
    locations: locations.map((l) => ({ id: l.id, name: l.name, address: l.address })),
    services,
    questions,
  };
}

export type PublicSlotQuery = {
  serviceId: unknown;
  staffMemberId: unknown;
  from: unknown;
  to: unknown;
  locationId?: unknown;
};

export async function getPublicFreeSlots(slug: unknown, q: PublicSlotQuery): Promise<FreeSlots> {
  const { ctx } = await place(slug);
  return getFreeSlotsInOrg(ctx, {
    serviceId: q.serviceId,
    staffMemberId: q.staffMemberId,
    from: q.from,
    to: q.to,
    mode: 'online',
    locationId: await locationFilter(ctx, q.locationId),
  });
}

// ── the hold and the code ───────────────────────────────────────────────────────────────────

export type StartPublicBookingInput = {
  serviceId: unknown;
  /** A member's id, or 'any' („Oricine e liber”). */
  staffMemberId: unknown;
  /** ISO 8601 with offset, one of the free times. */
  startsAt: unknown;
  locationId?: unknown;
  name: unknown;
  phone: unknown;
  email: unknown;
  locale?: unknown;
  message?: unknown;
  /** B.12: the answers to the questions of the service ({ questionId, value }). */
  answers?: unknown;
  /** The Turnstile token from the page. */
  captchaToken: unknown;
  /** The caller's IP, from the request (never from the body). */
  ip: string | null;
};

export type PublicHoldResult = {
  holdId: string;
  staffMemberId: string;
  startsAt: Date;
  expiresAt: Date;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function requireStart(value: unknown): Date {
  if (typeof value !== 'string' || !ISO_RE.test(value))
    throw new InvalidInput('startsAt', 'invalid');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new InvalidInput('startsAt', 'invalid');
  return d;
}

export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

export function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput('message', 'invalid');
  const m = value.trim();
  if (m.length === 0) return null;
  if (m.length > PUBLIC_LIMITS.message) throw new InvalidInput('message', 'too_long');
  return m;
}

/**
 * The pending holds whose 10 minutes passed: expired, their personal data wiped. Called at each
 * public request and by the job booking.public-hold-cleanup; returns how many.
 */
export async function settleExpired(client: PoolClient): Promise<number> {
  guardBulkOp('booking.public_hold.settle_expired', { state: 'pending', expired: true });
  const res = await client.query(
    `UPDATE booking.public_hold
        SET state = 'expired', settled_at = now(),
            client_name = NULL, client_phone = NULL, client_email = NULL, message = NULL,
            answers = NULL
      WHERE state = 'pending' AND expires_at <= now()`,
  );
  return res.rowCount ?? 0;
}

export async function settle(
  client: PoolClient,
  holdId: string,
  state: 'confirmed' | 'expired' | 'refused',
  appointmentId: string | null = null,
): Promise<void> {
  await client.query(
    `UPDATE booking.public_hold
        SET state = $2, appointment_id = $3, settled_at = now(),
            client_name = NULL, client_phone = NULL, client_email = NULL, message = NULL,
            answers = NULL
      WHERE id = $1 AND state = 'pending'`,
    [holdId, state, appointmentId],
  );
}

const CODE_TEXTS: Record<ClientLocale, { title: string; pre: string; after: string }> = {
  ro: {
    title: 'Codul pentru programarea dumneavoastră',
    pre: 'Introduceți codul pe pagina de rezervare.',
    after: 'Codul expiră în 10 minute. Dacă nu ați cerut o programare, ignorați acest e-mail.',
  },
  en: {
    title: 'Your booking code',
    pre: 'Enter the code on the booking page.',
    after:
      'The code expires in 10 minutes. If you didn’t ask for an appointment, ignore this email.',
  },
  fr: {
    title: 'Votre code de réservation',
    pre: 'Saisissez le code sur la page de réservation.',
    after:
      'Le code expire dans 10 minutes. Si vous n’avez pas demandé de rendez-vous, ignorez cet e-mail.',
  },
  es: {
    title: 'Su código de reserva',
    pre: 'Introduzca el código en la página de reserva.',
    after: 'El código caduca en 10 minutos. Si no ha pedido una cita, ignore este correo.',
  },
  de: {
    title: 'Ihr Buchungscode',
    pre: 'Geben Sie den Code auf der Buchungsseite ein.',
    after:
      'Der Code läuft in 10 Minuten ab. Wenn Sie keinen Termin angefragt haben, ignorieren Sie diese E-Mail.',
  },
  it: {
    title: 'Il Suo codice di prenotazione',
    pre: 'Inserisca il codice nella pagina di prenotazione.',
    after:
      'Il codice scade tra 10 minuti. Se non ha chiesto un appuntamento, ignori questa e-mail.',
  },
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The code e-mail (email.booking.code.*; the texts of the design, 6 languages). The button of the
 * design needs the public URL (3.9): until then, the code only.
 */
async function sendCode(to: string, locale: ClientLocale, business: string, code: string) {
  const t = CODE_TEXTS[locale] ?? CODE_TEXTS.ro;
  const subject = `${t.title}: ${code}`;
  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="font-family:Arial,sans-serif;color:#1a1a1a">` +
    `<p style="color:#666">${escapeHtml(business)}</p>` +
    `<h1 style="font-size:20px">${escapeHtml(t.title)}</h1>` +
    `<p>${escapeHtml(t.pre)}</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
    `<p style="color:#666">${escapeHtml(t.after)}</p></body></html>`;
  const text = `${business}\n\n${t.title}\n\n${t.pre}\n\n${code}\n\n${t.after}`;
  return deliverEmail({ to, subject, html, text });
}

export async function startPublicBooking(
  slug: unknown,
  input: StartPublicBookingInput,
): Promise<PublicHoldResult> {
  const p = await place(slug);
  const { ctx } = p;
  // D-B-6: no valid check, nothing at all (not even a lookup)
  if (typeof input.captchaToken !== 'string' || !(await captcha(input.captchaToken, input.ip))) {
    throw new InvalidInput('captcha', 'invalid');
  }
  const contact = normalizePublicContact({
    name: input.name,
    phone: input.phone,
    email: input.email,
    locale: input.locale,
  } as ClientInput);
  const message = normalizeMessage(input.message);
  const startsAt = requireStart(input.startsAt);
  const locationId = await locationFilter(ctx, input.locationId);
  const emailHash = sha256(contact.email);
  const ipHash = sha256(`${ctx.organizationId}:${input.ip ?? 'unknown'}`);

  // the limits per IP and per e-mail (a burst stops here, before any slot is read)
  const limited = await withBookingTx(ctx.organizationId, async (client) => {
    await settleExpired(client);
    const { rows } = await client.query<{ ip: number; email: number }>(
      // only the rows that still have their hashes (the job sets them to NULL after 24 hours)
      `SELECT count(*) FILTER (WHERE ip_hash IS NOT NULL AND ip_hash = $1
                                 AND created_at > now() - interval '1 hour')::int AS ip,
              count(*) FILTER (WHERE email_hash IS NOT NULL AND email_hash = $2
                                 AND created_at > now() - interval '1 day')::int AS email
         FROM booking.public_hold
        WHERE created_at > now() - interval '1 day'`,
      [ipHash, emailHash],
    );
    return (
      rows[0]!.ip >= PUBLIC_LIMITS.perIpPerHour || rows[0]!.email >= PUBLIC_LIMITS.perEmailPerDay
    );
  });
  if (limited) throw new Conflict('rate_limited');

  // B.7a: a blocked client is refused without learning why (the same answer as a taken time)
  if ((await publicClientInOrg(ctx, contact, false)).blocked) throw new Conflict('slot_taken');

  // the time must be one of the free online times (notice, horizon, held times, the rules)
  const date = localDate(startsAt, p.timeZone);
  const query = {
    serviceId: input.serviceId,
    from: date,
    to: nextDate(date),
    mode: 'online' as const,
    locationId,
  };
  const slots = await getFreeSlotsInOrg(ctx, { ...query, staffMemberId: input.staffMemberId });
  const slot = slots.days
    .flatMap((d) => d.slots)
    .find((s) => s.available && s.startsAt.getTime() === startsAt.getTime());
  if (!slot) throw new Conflict('slot_taken');
  // B.12: the answers to the questions of this service (a required one left empty: InvalidInput)
  const serviceId = input.serviceId as string;
  const answers = validateAnswers(
    await withBookingTx(
      ctx.organizationId,
      (client) => questionsForService(client, serviceId, 'public'),
      true,
    ),
    input.answers,
    true,
  );
  const staffMemberId =
    input.staffMemberId === 'any' ? slot.staffMemberIds?.[0] : (input.staffMemberId as string);
  if (!staffMemberId) throw new Conflict('slot_taken');
  // the member's own duration (online: the maximum, S123-3)
  const durationMinutes =
    input.staffMemberId === 'any'
      ? (await getFreeSlotsInOrg(ctx, { ...query, staffMemberId })).durationMinutes
      : slots.durationMinutes;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  const holdId = crypto.randomUUID();
  const code = newCode();
  const hold = await withBookingTx(ctx.organizationId, async (client) => {
    // one hold at a time per member: the member's row is the lock
    await client.query(`SELECT 1 FROM booking.staff_member WHERE id = $1 FOR UPDATE`, [
      staffMemberId,
    ]);
    const taken = await client.query(
      `SELECT 1 FROM booking.public_hold
        WHERE staff_member_id = $1 AND state = 'pending' AND expires_at > now()
          AND starts_at < $3 AND ends_at > $2
       UNION ALL
       SELECT 1 FROM booking.appointment
        WHERE staff_member_id = $1
          AND status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
          AND starts_at < $3 AND ends_at > $2
       LIMIT 1`,
      [staffMemberId, startsAt, endsAt],
    );
    if (taken.rows.length > 0) return null;
    // a new attempt of the same e-mail replaces its pending one
    await client.query(
      `UPDATE booking.public_hold
          SET state = 'expired', settled_at = now(),
              client_name = NULL, client_phone = NULL, client_email = NULL, message = NULL,
            answers = NULL
        WHERE email_hash = $1 AND state = 'pending'`,
      [emailHash],
    );
    const { rows } = await client.query<{ expires_at: Date }>(
      `INSERT INTO booking.public_hold
         (id, organization_id, staff_member_id, service_id, location_id, starts_at, ends_at,
          duration_minutes, client_name, client_phone, client_email, client_locale, message,
          email_hash, ip_hash, code_hash, expires_at, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               now() + make_interval(mins => $17), $18)
       RETURNING expires_at`,
      [
        holdId,
        ctx.organizationId,
        staffMemberId,
        input.serviceId,
        locationId ?? null,
        startsAt,
        endsAt,
        durationMinutes,
        contact.name,
        contact.phone,
        contact.email,
        contact.locale,
        message,
        emailHash,
        ipHash,
        codeHash(holdId, code),
        PUBLIC_LIMITS.holdMinutes,
        answers.length > 0 ? JSON.stringify(answers) : null,
      ],
    );
    return rows[0]!;
  });
  if (!hold) throw new Conflict('slot_taken');

  const sent = await sendCode(contact.email, contact.locale, p.name, code);
  if (sent.status !== 'sent') {
    await withBookingTx(ctx.organizationId, (client) => settle(client, holdId, 'refused'));
    throw new Conflict('email_not_delivered');
  }
  return { holdId, staffMemberId, startsAt, expiresAt: hold.expires_at };
}

export type HoldRow = {
  id: string;
  staff_member_id: string;
  service_id: string;
  location_id: string | null;
  starts_at: Date;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_locale: ClientLocale;
  message: string | null;
  /** B.12: the answers, while pending */
  answers: FormAnswer[] | null;
  /** null only for a move hold (B.11b), never read here */
  code_hash: string | null;
  attempts: number;
  sends: number;
  last_sent_at: Date;
  expires_at: Date;
  state: string;
};

const HOLD_COLUMNS = `id, staff_member_id, service_id, location_id, starts_at, client_name,
  client_phone, client_email, client_locale, message, answers, code_hash, attempts, sends,
  last_sent_at, expires_at, state`;

function requireHoldId(value: unknown): string {
  if (!isUuid(value)) throw new ResourceNotFound();
  return value;
}

export type PublicBookingResult = {
  appointmentId: string;
  number: number;
  /** „confirmed” (automatic confirmation) or „unconfirmed” (sent to the salon). */
  status: 'confirmed' | 'unconfirmed';
  startsAt: Date;
  /**
   * B.11b: the client's link for moving or cancelling (/r/<slug>/m/<token>), shown once: only its
   * SHA-256 is kept.
   */
  manageToken: string;
};

export async function verifyPublicBooking(
  slug: unknown,
  input: { holdId: unknown; code: unknown },
): Promise<PublicBookingResult> {
  const { ctx } = await place(slug);
  const holdId = requireHoldId(input.holdId);
  if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) {
    throw new InvalidInput('code', 'invalid');
  }
  const code = input.code;

  // the check of the code commits its try even when it is wrong
  const checked = await withBookingTx(ctx.organizationId, async (client) => {
    const hold = (
      await client.query<HoldRow>(
        `SELECT ${HOLD_COLUMNS} FROM booking.public_hold
          WHERE id = $1 AND move_appointment_id IS NULL FOR UPDATE`,
        [holdId],
      )
    ).rows[0];
    if (!hold) return { kind: 'not_found' as const };
    if (hold.state !== 'pending') return { kind: 'expired' as const };
    if (hold.expires_at.getTime() <= Date.now()) {
      await settle(client, holdId, 'expired');
      return { kind: 'expired' as const };
    }
    const ok = crypto.timingSafeEqual(
      Buffer.from(codeHash(holdId, code)),
      Buffer.from(hold.code_hash ?? ''.padEnd(64, '-')),
    );
    if (!ok) {
      const attempts = hold.attempts + 1;
      if (attempts >= PUBLIC_LIMITS.codeAttempts) {
        await client.query(`UPDATE booking.public_hold SET attempts = $2 WHERE id = $1`, [
          holdId,
          attempts,
        ]);
        await settle(client, holdId, 'refused');
        return { kind: 'too_many' as const };
      }
      await client.query(`UPDATE booking.public_hold SET attempts = $2 WHERE id = $1`, [
        holdId,
        attempts,
      ]);
      return { kind: 'wrong' as const, left: PUBLIC_LIMITS.codeAttempts - attempts };
    }
    return { kind: 'ok' as const, hold };
  });
  if (checked.kind === 'not_found') throw new ResourceNotFound();
  if (checked.kind === 'expired') throw new Conflict('code_expired');
  if (checked.kind === 'too_many') throw new Conflict('too_many_attempts');
  if (checked.kind === 'wrong') throw new InvalidInput('code', `wrong:${checked.left}`);
  const hold = checked.hold;

  const contact = {
    name: hold.client_name,
    phone: hold.client_phone,
    email: hold.client_email,
    locale: hold.client_locale,
  };
  const client = await publicClientInOrg(ctx, contact, true);
  if (client.blocked || !client.id) {
    await withBookingTx(ctx.organizationId, (c) => settle(c, holdId, 'refused'));
    throw new Conflict('slot_taken');
  }
  const clientId = client.id;
  const settings = await getBookingSettingsInOrg(ctx);
  const highRisk = await withBookingTx(ctx.organizationId, (c) => isHighRisk(c, clientId), true);
  // D-B-6: „Risc ridicat” needs the deposit (B.22); until then the salon confirms it
  const confirmed = settings.confirmationMode === 'auto' && !highRisk;

  let appointment;
  try {
    appointment = await createAppointmentInOrg(ctx, 'all', {
      id: crypto.randomUUID(),
      staffMemberId: hold.staff_member_id,
      serviceId: hold.service_id,
      clientId,
      startsAt: hold.starts_at.toISOString(),
      confirmed,
      teamNote: hold.message,
      ...(hold.location_id ? { locationId: hold.location_id } : {}),
    });
  } catch (err) {
    if (
      err instanceof Conflict &&
      ['appointment_overlap', 'staff_unavailable', 'resource_unavailable'].includes(err.message)
    ) {
      await withBookingTx(ctx.organizationId, (c) => settle(c, holdId, 'expired'));
      throw new Conflict('slot_taken');
    }
    throw err;
  }
  const manageToken = await withBookingTx(ctx.organizationId, async (c) => {
    // B.12: the answers go to the booking before the hold (and its copy of them) is wiped
    if (hold.answers?.length) {
      await writeAnswers(c, ctx.organizationId, appointment.id, hold.answers, { source: 'client' });
    }
    await settle(c, holdId, 'confirmed', appointment.id);
    return issueManageToken(c, ctx.organizationId, appointment.id);
  });
  return {
    appointmentId: appointment.id,
    number: appointment.number,
    status: confirmed ? 'confirmed' : 'unconfirmed',
    startsAt: appointment.startsAt,
    manageToken,
  };
}

export async function resendPublicBookingCode(
  slug: unknown,
  input: { holdId: unknown },
): Promise<{ expiresAt: Date }> {
  const p = await place(slug);
  const holdId = requireHoldId(input.holdId);
  const code = newCode();
  const result = await withBookingTx(p.ctx.organizationId, async (client) => {
    const hold = (
      await client.query<HoldRow>(
        `SELECT ${HOLD_COLUMNS} FROM booking.public_hold
          WHERE id = $1 AND move_appointment_id IS NULL FOR UPDATE`,
        [holdId],
      )
    ).rows[0];
    if (!hold) return { kind: 'not_found' as const };
    if (hold.state !== 'pending' || hold.expires_at.getTime() <= Date.now()) {
      return { kind: 'expired' as const };
    }
    if (Date.now() - hold.last_sent_at.getTime() < PUBLIC_LIMITS.resendAfterSeconds * 1000) {
      return { kind: 'too_soon' as const };
    }
    if (hold.sends >= PUBLIC_LIMITS.sends) return { kind: 'too_many' as const };
    const { rows } = await client.query<{ expires_at: Date }>(
      `UPDATE booking.public_hold
          SET code_hash = $2, sends = sends + 1, last_sent_at = now(), attempts = 0,
              expires_at = now() + make_interval(mins => $3)
        WHERE id = $1 RETURNING expires_at`,
      [holdId, codeHash(holdId, code), PUBLIC_LIMITS.holdMinutes],
    );
    return {
      kind: 'ok' as const,
      expiresAt: rows[0]!.expires_at,
      email: hold.client_email!,
      locale: hold.client_locale,
    };
  });
  if (result.kind === 'not_found') throw new ResourceNotFound();
  if (result.kind === 'expired') throw new Conflict('code_expired');
  if (result.kind === 'too_soon') throw new Conflict('resend_too_soon');
  if (result.kind === 'too_many') throw new Conflict('too_many_sends');
  const sent = await sendCode(result.email, result.locale, p.name, code);
  if (sent.status !== 'sent') throw new Conflict('email_not_delivered');
  return { expiresAt: result.expiresAt };
}
