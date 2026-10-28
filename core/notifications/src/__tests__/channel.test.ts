import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const {
  CaptureEmailAdapter,
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  LogEmailAdapter,
  ResendEmailAdapter,
  UnconfiguredEmailChannel,
  deliverEmail,
  makeEmailChannel,
  setEmailChannel,
} = await import('../index');

const TOKEN = 'tok_0123456789abcdef';
const message = {
  to: 'ana@example.com',
  subject: 'Subiect',
  html: `<a href="https://app.example/reset-password?token=${TOKEN}">x</a>`,
  text: `https://app.example/reset-password?token=${TOKEN}`,
};

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_REPLY_TO;
  resendSend.mockReset();
});
afterEach(() => {
  process.env = { ...saved };
  setEmailChannel(null);
  vi.restoreAllMocks();
});

describe('N.1 — makeEmailChannel', () => {
  it('with a key → Resend', () => {
    process.env.RESEND_API_KEY = 're_test';
    expect(makeEmailChannel()).toBeInstanceOf(ResendEmailAdapter);
  });

  it('without a key, outside production → log adapter', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(makeEmailChannel()).toBeInstanceOf(LogEmailAdapter);
  });

  it('without a key, in production → unconfigured channel (B-7 b)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(makeEmailChannel()).toBeInstanceOf(UnconfiguredEmailChannel);
    vi.unstubAllEnvs();
  });
});

describe('N.2 — log adapter', () => {
  it('logs recipient, sender and subject, never the body or the token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new LogEmailAdapter().send(message);
    const printed = JSON.stringify(log.mock.calls);
    expect(printed).toContain('ana@example.com');
    expect(printed).toContain('Subiect');
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain('reset-password');
  });
});

describe('N.4 — Resend adapter', () => {
  it('sends from the default sender with Reply-To support (B-1, B-3)', async () => {
    resendSend.mockResolvedValue({ data: { id: '1' }, error: null });
    await new ResendEmailAdapter('re_test').send(message);
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DEFAULT_FROM,
        replyTo: DEFAULT_REPLY_TO,
        to: 'ana@example.com',
        text: message.text,
      }),
    );
    expect(DEFAULT_FROM).toBe('Ventora <noreply@ventora-hub.com>');
    expect(DEFAULT_REPLY_TO).toBe('support@ventorasystems.com');
  });

  it('EMAIL_FROM / EMAIL_REPLY_TO override the defaults', async () => {
    process.env.EMAIL_FROM = 'Ventora <noreply@staging.example>';
    process.env.EMAIL_REPLY_TO = 'help@staging.example';
    resendSend.mockResolvedValue({ data: { id: '1' }, error: null });
    await new ResendEmailAdapter('re_test').send(message);
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Ventora <noreply@staging.example>',
        replyTo: 'help@staging.example',
      }),
    );
  });

  it('an API error throws without the key or the recipient in the message', async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field: ana@example.com' },
    });
    const err = await new ResendEmailAdapter('re_secret_key').send(message).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('validation_error');
    expect(err.message).not.toContain('ana@example.com');
    expect(err.message).not.toContain('re_secret_key');
  });
});

describe('deliverEmail', () => {
  it('sent through the configured channel', async () => {
    const capture = new CaptureEmailAdapter();
    setEmailChannel(capture);
    expect(await deliverEmail(message)).toEqual({ status: 'sent' });
    expect(capture.to('ana@example.com')).toHaveLength(1);
  });

  it('provider error → failed / provider_error, never throws, logs no body', async () => {
    const capture = new CaptureEmailAdapter();
    capture.failWith = new Error('[notifications] Resend error: rate_limit_exceeded');
    setEmailChannel(capture);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await deliverEmail(message)).toEqual({ status: 'failed', reason: 'provider_error' });
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
  });

  it('sendOwnerRecoveryNotice (2.5c) goes through the channel', async () => {
    const { sendOwnerRecoveryNotice } = await import('../index');
    const capture = new CaptureEmailAdapter();
    setEmailChannel(capture);
    const result = await sendOwnerRecoveryNotice({
      email: 'owner@x.ro',
      businessName: 'Salon Aurora',
      ticketRef: 'SUP-1',
    });
    expect(result).toEqual({ status: 'sent' });
    expect(capture.to('owner@x.ro')[0]?.subject).toBe(
      'Autentificarea în doi pași a contului tău a fost resetată',
    );
  });

  it('unconfigured channel → failed / not_configured', async () => {
    setEmailChannel(new UnconfiguredEmailChannel());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await deliverEmail(message)).toEqual({ status: 'failed', reason: 'not_configured' });
  });
});
