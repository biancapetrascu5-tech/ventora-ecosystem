import { ResendEmailAdapter } from './adapters/resend.js';
import { LogEmailAdapter } from './adapters/log.js';
import { UnconfiguredEmailChannel } from './adapters/unconfigured.js';
import { EmailNotConfiguredError, type EmailChannel, type SendEmailParams } from './email.js';

/**
 * - RESEND_API_KEY set → Resend.
 * - missing, outside production → log adapter (development, tests).
 * - missing, in production → every send fails as `not_configured` (staging, B-7 b). Real
 *   production refuses to start without the key (@ventora/config).
 */
export function makeEmailChannel(): EmailChannel {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return new ResendEmailAdapter(apiKey);
  return process.env.NODE_ENV === 'production'
    ? new UnconfiguredEmailChannel()
    : new LogEmailAdapter();
}

let override: EmailChannel | null = null;

/** Replaces the channel (tests, composition root). `null` restores the default. */
export function setEmailChannel(channel: EmailChannel | null): void {
  override = channel;
}

export function getEmailChannel(): EmailChannel {
  return override ?? makeEmailChannel();
}

export type EmailFailureReason = 'not_configured' | 'provider_error';
export type DeliveryResult = { status: 'sent' } | { status: 'failed'; reason: EmailFailureReason };

/**
 * Sends one message and never throws: the operation that triggered the email (reset request,
 * invitation) must succeed anyway. The error is logged without recipient or body.
 */
export async function deliverEmail(params: SendEmailParams): Promise<DeliveryResult> {
  try {
    await getEmailChannel().send(params);
    return { status: 'sent' };
  } catch (err) {
    const reason: EmailFailureReason =
      err instanceof EmailNotConfiguredError ? 'not_configured' : 'provider_error';
    console.error('[notifications] email not delivered', {
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'failed', reason };
  }
}
