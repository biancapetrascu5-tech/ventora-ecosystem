import { deliverEmail, type DeliveryResult } from './channel';
import { renderOwnerRecovery } from './templates/index';

/**
 * E-5: tells the owner that the Ventora team reset their two-step authentication.
 * Prepared in 2.5b; recoverOwnerAccess (2.5c) calls it and audits the result as E41.
 */
export async function sendOwnerRecoveryNotice(params: {
  email: string;
  name?: string | null;
  businessName: string;
  ticketRef: string;
  passwordResetLink?: string | null;
}): Promise<DeliveryResult> {
  const rendered = renderOwnerRecovery(params);
  return deliverEmail({
    to: params.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
