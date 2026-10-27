import { Resend } from 'resend';
import type { EmailChannel, SendEmailParams } from '../email.js';

const DEFAULT_FROM = 'noreply@ventora-hub.com';

export class ResendEmailAdapter implements EmailChannel {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(params: SendEmailParams): Promise<void> {
    const { error } = await this.client.emails.send({
      from: params.from ?? DEFAULT_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) throw new Error(`[notifications] Resend error: ${error.message}`);
  }
}
