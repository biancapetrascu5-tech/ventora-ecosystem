import type { EmailChannel, SendEmailParams } from '../email.js';

export class LogEmailAdapter implements EmailChannel {
  async send(params: SendEmailParams): Promise<void> {
    console.log('[notifications] Email (log adapter):', {
      to: params.to,
      from: params.from ?? 'noreply@ventora-hub.com',
      subject: params.subject,
    });
  }
}
