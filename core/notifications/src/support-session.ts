import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import { deliverEmail, type DeliveryResult } from './channel';
import { renderSupportSessionOpened } from './templates/index';

/** E-6: tells an owner that the Ventora team opened a support session (D10 variant A). */
export async function sendSupportSessionNotice(params: {
  email: string;
  name?: string | null;
  businessName: string;
  founderName: string;
  reason: string;
  ticketRef: string;
  expiresAt: Date;
  /** D4-8: the owner's language (UserPreference); Romanian when not chosen yet. */
  locale?: string | null;
}): Promise<DeliveryResult> {
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(params.locale ?? '')
    ? (params.locale as Locale)
    : undefined;
  const rendered = renderSupportSessionOpened({ ...params, locale });
  return deliverEmail({
    to: params.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
