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
}): Promise<DeliveryResult> {
  const rendered = renderSupportSessionOpened(params);
  return deliverEmail({
    to: params.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
