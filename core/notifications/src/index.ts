export type { EmailChannel, SendEmailParams } from './email.js';
export { ResendEmailAdapter } from './adapters/resend.js';
export { LogEmailAdapter } from './adapters/log.js';

import { ResendEmailAdapter } from './adapters/resend.js';
import { LogEmailAdapter } from './adapters/log.js';
import type { EmailChannel } from './email.js';

export function makeEmailChannel(): EmailChannel {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new ResendEmailAdapter(apiKey) : new LogEmailAdapter();
}
