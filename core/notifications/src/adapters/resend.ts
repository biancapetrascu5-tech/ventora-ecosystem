import { Resend } from 'resend';
import { emailFrom, emailReplyTo, type EmailChannel, type SendEmailParams } from '../email';

export class ResendEmailAdapter implements EmailChannel {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(params: SendEmailParams): Promise<void> {
    const { error } = await this.client.emails.send({
      from: params.from ?? emailFrom(),
      to: params.to,
      replyTo: params.replyTo ?? emailReplyTo(),
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    });
    // The provider message can echo the recipient; only the error name leaves this adapter.
    if (error) throw new Error(`[notifications] Resend error: ${error.name ?? 'unknown'}`);
  }
}
