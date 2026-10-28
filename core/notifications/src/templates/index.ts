import { CANONICAL_LOCALE, type Locale } from '@ventora/i18n';
import { supportEmail } from '../email.js';
import { renderOperationalEmail, type RenderedEmail } from './layout.js';
import { emailMessages, fill, type EmailMessages } from './messages.js';

export type { RenderedEmail } from './layout.js';
export type MembershipRoleName = keyof EmailMessages['roles'];

// B-5: Romanian until the recipient's language is stored with the account.
const DEFAULT_EMAIL_LOCALE: Locale = CANONICAL_LOCALE;
// Expiry dates are shown in the platform's home time zone until organizations store their own.
const DISPLAY_TIME_ZONE = 'Europe/Bucharest';
// Product names used as the eyebrow when no business is involved (not translated).
const HUB_PRODUCT = 'Ventora';
const FOUNDER_PRODUCT = 'Ventora Founder';

function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

/** T-1: greet by name when there is a real one, otherwise the plain greeting. */
function greeting(m: EmailMessages, name: string | null | undefined, email: string): string {
  const clean = name?.trim();
  return clean && clean.toLowerCase() !== email.toLowerCase()
    ? fill(m.common.greeting, { name: clean })
    : m.common.greetingNoName;
}

export function renderPasswordReset(params: {
  app: 'hub' | 'founder';
  email: string;
  name?: string | null;
  link: string;
  locale?: Locale;
}): RenderedEmail {
  const locale = params.locale ?? DEFAULT_EMAIL_LOCALE;
  const m = emailMessages(locale);
  const t = m.passwordReset[params.app];
  return renderOperationalEmail({
    lang: locale,
    subject: t.subject,
    preheader: t.validity,
    eyebrow: params.app === 'founder' ? FOUNDER_PRODUCT : HUB_PRODUCT,
    title: t.subject,
    lead: [greeting(m, params.name, params.email), t.intro],
    button: { label: t.button, href: params.link },
    after: [t.validity, fill(t.notRequested, { supportEmail: supportEmail() })],
    signature: m.common.signature,
    why: fill(m.common.footerAccount, { email: params.email }),
    company: m.common.company,
  });
}

export function renderMemberInvitation(params: {
  email: string;
  inviterName: string;
  businessName: string;
  role: MembershipRoleName;
  expiresAt: Date;
  link: string;
  resent?: boolean;
  locale?: Locale;
}): RenderedEmail {
  const locale = params.locale ?? DEFAULT_EMAIL_LOCALE;
  const m = emailMessages(locale);
  const t = m.invitation.member;
  const vars = {
    inviterName: params.inviterName,
    businessName: params.businessName,
    roleName: m.roles[params.role],
    expiresDate: formatDate(params.expiresAt, locale),
  };
  const subject = fill(t.subject, vars);
  return renderOperationalEmail({
    lang: locale,
    subject,
    preheader: fill(t.validity, vars),
    eyebrow: params.businessName,
    title: subject,
    lead: [
      m.common.greetingNoName,
      fill(t.intro, vars),
      ...(params.resent ? [t.resentNotice] : []),
    ],
    button: { label: t.button, href: params.link },
    after: [fill(t.validity, vars), fill(t.existingAccount, vars), t.notExpected],
    signature: m.common.signature,
    why: fill(m.common.footerInvitation, { email: params.email }),
    company: m.common.company,
  });
}

export function renderOwnerInvitation(params: {
  email: string;
  businessName: string;
  expiresAt: Date;
  link: string;
  locale?: Locale;
}): RenderedEmail {
  const locale = params.locale ?? DEFAULT_EMAIL_LOCALE;
  const m = emailMessages(locale);
  const t = m.invitation.owner;
  const vars = {
    businessName: params.businessName,
    expiresDate: formatDate(params.expiresAt, locale),
  };
  const subject = fill(t.subject, vars);
  return renderOperationalEmail({
    lang: locale,
    subject,
    preheader: fill(t.validity, vars),
    eyebrow: params.businessName,
    title: subject,
    lead: [m.common.greetingNoName, fill(t.intro, vars)],
    button: { label: fill(t.button, vars), href: params.link },
    after: [fill(t.validity, vars), t.firstLogin, t.questions],
    signature: m.common.signature,
    why: fill(m.common.footerInvitation, { email: params.email }),
    company: m.common.company,
  });
}

/**
 * E-5, owner recovery (wired in 2.5c). `passwordResetLink` present = variant B
 * (2FA + password reset), absent = variant A (2FA only).
 */
export function renderOwnerRecovery(params: {
  email: string;
  name?: string | null;
  businessName: string;
  ticketRef: string;
  passwordResetLink?: string | null;
  locale?: Locale;
}): RenderedEmail {
  const locale = params.locale ?? DEFAULT_EMAIL_LOCALE;
  const m = emailMessages(locale);
  const t = m.ownerRecovery;
  const intro = fill(t.intro, { ticketRef: params.ticketRef });
  return renderOperationalEmail({
    lang: locale,
    subject: t.subject,
    preheader: intro,
    eyebrow: params.businessName,
    title: t.subject,
    lead: [
      greeting(m, params.name, params.email),
      intro,
      ...(params.passwordResetLink ? [t.passwordReset] : []),
    ],
    button: params.passwordResetLink
      ? { label: t.button, href: params.passwordResetLink }
      : undefined,
    after: [
      fill(t.nextSteps, { businessName: params.businessName }),
      { text: fill(t.notRequested, { supportEmail: supportEmail() }), strong: true },
    ],
    signature: m.common.signature,
    why: fill(m.common.footerAccount, { email: params.email }),
    company: m.common.company,
  });
}
