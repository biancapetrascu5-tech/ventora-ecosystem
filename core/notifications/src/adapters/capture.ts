import type { EmailChannel, SendEmailParams } from '../email.js';

// Test double: keeps every message in memory so tests can read the link instead of
// reading tokens from the database. `failWith` makes the next sends throw.
export class CaptureEmailAdapter implements EmailChannel {
  readonly sent: SendEmailParams[] = [];
  failWith: Error | null = null;

  async send(params: SendEmailParams): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(params);
  }

  to(address: string): SendEmailParams[] {
    return this.sent.filter((m) => m.to === address);
  }

  clear(): void {
    this.sent.length = 0;
    this.failWith = null;
  }
}
