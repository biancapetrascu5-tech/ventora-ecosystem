export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative of the same message. */
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailChannel {
  send(params: SendEmailParams): Promise<void>;
}

/**
 * Thrown by the channel used in production when no provider is configured (decision B-7 b):
 * the caller records the email as failed with reason `not_configured`.
 */
export class EmailNotConfiguredError extends Error {
  readonly code = 'not_configured' as const;
  constructor() {
    super('[notifications] email provider is not configured (RESEND_API_KEY missing)');
    this.name = 'EmailNotConfiguredError';
  }
}

/** Sender and Reply-To (ARCHITECTURE §11.6, decisions B-1, B-2, B-3). */
export const DEFAULT_FROM = 'Ventora <noreply@ventora-hub.com>';
export const DEFAULT_REPLY_TO = 'support@ventorasystems.com';

export function emailFrom(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

export function emailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;
}

/** Address shown in email texts where the reader should write to support. */
export function supportEmail(): string {
  return emailReplyTo();
}
