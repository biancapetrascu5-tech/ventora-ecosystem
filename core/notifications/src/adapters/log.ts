import { emailFrom, type EmailChannel, type SendEmailParams } from '../email';

// Development / tests without a provider. Never logs the body: it carries reset and
// invitation tokens.
export class LogEmailAdapter implements EmailChannel {
  async send(params: SendEmailParams): Promise<void> {
    console.log('[notifications] Email (log adapter):', {
      to: params.to,
      from: params.from ?? emailFrom(),
      subject: params.subject,
    });
  }
}
