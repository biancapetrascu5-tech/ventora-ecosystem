import { EmailNotConfiguredError, type EmailChannel } from '../email.js';

// Production without RESEND_API_KEY (allowed only on staging, decision B-7 b): every send
// fails, so the caller marks the email as failed and audits it.
export class UnconfiguredEmailChannel implements EmailChannel {
  async send(): Promise<void> {
    throw new EmailNotConfiguredError();
  }
}
