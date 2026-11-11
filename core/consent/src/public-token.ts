import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidInput } from '@ventora/errors';
import { addressHash, CONSENT_CHANNELS, hashKey, type ConsentChannel } from './address';

/*
 * Lot C.5 (decision 11.11.2026): the sources `form_confirmed` and `preferences` are written ONLY
 * from the public flows (the confirmation link of a form, the preferences / unsubscribe page),
 * with a signed token that names the business, the person, the channel and the address hash. The
 * business's contracts (recordConsent / withdraw) refuse these sources, and the database refuses
 * them with a team member as actor.
 *
 * The token: base64url(JSON payload) "." base64url(HMAC-SHA256). The signing key is derived from
 * CONSENT_HASH_KEY ("consent-public-token"), so no new secret; the address never travels, only its
 * hash. A token expires (7 days for a confirmation, 90 for the preferences link).
 */

export const PUBLIC_CONSENT_PURPOSES = ['form_confirmed', 'preferences'] as const;
export type PublicConsentPurpose = (typeof PUBLIC_CONSENT_PURPOSES)[number];

export type PublicConsentClaims = {
  organizationId: string;
  subject: { type: 'crm_contact' | 'marketing_contact' | 'booking_client'; id: string };
  channel: ConsentChannel;
  addressHash: string;
  purpose: PublicConsentPurpose;
  expiresAt: Date;
};

const TTL_DAYS: Record<PublicConsentPurpose, number> = { form_confirmed: 7, preferences: 90 };

function signingKey(): Buffer {
  return createHmac('sha256', hashKey()).update('consent-public-token').digest();
}

function sign(body: string): string {
  return createHmac('sha256', signingKey()).update(body).digest('base64url');
}

/** For the e-mail / SMS that carries the link; called by the sending code, never by a screen. */
export function issuePublicConsentToken(input: {
  organizationId: string;
  subject: PublicConsentClaims['subject'];
  channel: ConsentChannel;
  address: string;
  purpose: PublicConsentPurpose;
  now?: Date;
}): string {
  if (!(PUBLIC_CONSENT_PURPOSES as readonly string[]).includes(input.purpose)) {
    throw new InvalidInput('purpose');
  }
  const now = input.now ?? new Date();
  const payload = {
    v: 1,
    o: input.organizationId,
    st: input.subject.type,
    si: input.subject.id,
    c: input.channel,
    h: addressHash(input.organizationId, input.channel, input.address),
    p: input.purpose,
    e: Math.floor(now.getTime() / 1000) + TTL_DAYS[input.purpose] * 86_400,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** The claims of a valid, unexpired token; anything else is InvalidInput('token'). */
export function verifyPublicConsentToken(token: string, now = new Date()): PublicConsentClaims {
  const bad = () => new InvalidInput('token');
  if (typeof token !== 'string' || token.length > 2048) throw bad();
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) throw bad();
  const expected = Buffer.from(sign(body), 'base64url');
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad();
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw bad();
  }
  if (
    p.v !== 1 ||
    typeof p.o !== 'string' ||
    typeof p.si !== 'string' ||
    !['crm_contact', 'marketing_contact', 'booking_client'].includes(p.st as string) ||
    !(CONSENT_CHANNELS as readonly string[]).includes(p.c as string) ||
    typeof p.h !== 'string' ||
    !/^[0-9a-f]{64}$/.test(p.h) ||
    !(PUBLIC_CONSENT_PURPOSES as readonly string[]).includes(p.p as string) ||
    typeof p.e !== 'number'
  ) {
    throw bad();
  }
  const expiresAt = new Date(p.e * 1000);
  if (expiresAt.getTime() <= now.getTime()) throw bad();
  return {
    organizationId: p.o,
    subject: { type: p.st as PublicConsentClaims['subject']['type'], id: p.si },
    channel: p.c as ConsentChannel,
    addressHash: p.h,
    purpose: p.p as PublicConsentPurpose,
    expiresAt,
  };
}
