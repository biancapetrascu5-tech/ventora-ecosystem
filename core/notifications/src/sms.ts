/*
 * The SMS channel, as an interface only (Lot 4.3, D4-26 = a): the adapters (SMS_PROVIDER after
 * D-SMS-8, ANDROID_SIM after E-SMS-1) come with Booking. Until then the channel is not
 * configured: a delivery on it fails as `not_configured`, without retries. D4-7: no SMS to the
 * team for now; SMS and WhatsApp to the team come later as more channels, without changing
 * the notification model.
 */
export interface SmsMessage {
  /** E.164 phone number. */
  to: string;
  /** GSM-7, without diacritics, at most 160 characters (D-SMS-10). */
  text: string;
  idempotencyKey: string;
  validUntil?: Date | null;
}

export interface SmsChannel {
  send(message: SmsMessage): Promise<void>;
}

export class SmsNotConfiguredError extends Error {
  constructor() {
    super('[notifications] SMS channel is not configured (D-SMS-8, E-SMS-1)');
    this.name = 'SmsNotConfiguredError';
  }
}

export class UnconfiguredSmsChannel implements SmsChannel {
  async send(_message: SmsMessage): Promise<void> {
    throw new SmsNotConfiguredError();
  }
}
