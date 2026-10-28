import { CANONICAL_LOCALE, type Locale } from '@ventora/i18n';
import { supportEmail } from '../email.js';
import { renderLayout, type Block, type RenderedEmail } from './layout.js';
import { emailMessages, fill, type EmailMessages } from './messages.js';

export type { RenderedEmail } from './layout.js';
export type MembershipRoleName = keyof EmailMessages['roles'];

// B-5: Romanian until the recipient's language is stored with the account.
const DEFAULT_EMAIL_LOCALE: Locale = CANONICAL_LOCALE;
// Expiry dates are shown in the platform's home time zone until organizations store their own.
const DISPLAY_TIME_ZONE = 'Europe/Bucharest';

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
  const blocks: Block[] = [
    { kind: 'text', text: greeting(m, params.name, params.email) },
    { kind: 'text', text: t.intro },
    { kind: 'button', label: t.button, href: params.link },
    { kind: 'text', text: t.validity },
    { kind: 'text', text: fill(t.notRequested, { supportEmail: supportEmail() }) },
    { kind: 'text', text: m.common.signature },
    { kind: 'footer', text: fill(m.common.footerAccount, { email: params.email }) },
  ];
  return renderLayout(locale, t.subject, blocks);
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
  const blocks: Block[] = [
    { kind: 'text', text: m.common.greetingNoName },
    { kind: 'text', text: fill(t.intro, vars) },
    { kind: 'button', label: t.button, href: params.link },
    ...(params.resent ? [{ kind: 'text' as const, text: t.resentNotice }] : []),
    { kind: 'text', text: fill(t.validity, vars) },
    { kind: 'text', text: fill(t.existingAccount, vars) },
    { kind: 'text', text: t.notExpected },
    { kind: 'text', text: m.common.signature },
    { kind: 'footer', text: fill(m.common.footerInvitation, { email: params.email }) },
  ];
  return renderLayout(locale, fill(t.subject, vars), blocks);
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
  const blocks: Block[] = [
    { kind: 'text', text: m.common.greetingNoName },
    { kind: 'text', text: fill(t.intro, vars) },
    { kind: 'button', label: fill(t.button, vars), href: params.link },
    { kind: 'text', text: fill(t.validity, vars) },
    { kind: 'text', text: t.firstLogin },
    { kind: 'text', text: t.questions },
    { kind: 'text', text: m.common.signature },
    { kind: 'footer', text: fill(m.common.footerInvitation, { email: params.email }) },
  ];
  return renderLayout(locale, fill(t.subject, vars), blocks);
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
  const blocks: Block[] = [
    { kind: 'text', text: greeting(m, params.name, params.email) },
    { kind: 'text', text: fill(t.intro, { ticketRef: params.ticketRef }) },
    ...(params.passwordResetLink
      ? [
          { kind: 'text' as const, text: t.passwordReset },
          { kind: 'button' as const, label: t.button, href: params.passwordResetLink },
        ]
      : []),
    { kind: 'text', text: fill(t.nextSteps, { businessName: params.businessName }) },
    { kind: 'text', text: fill(t.notRequested, { supportEmail: supportEmail() }), strong: true },
    { kind: 'text', text: m.common.signature },
    { kind: 'footer', text: fill(m.common.footerAccount, { email: params.email }) },
  ];
  return renderLayout(locale, t.subject, blocks);
}
