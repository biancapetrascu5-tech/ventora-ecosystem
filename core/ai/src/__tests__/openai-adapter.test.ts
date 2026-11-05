import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAiAdapter, openAiConfigFromEnv } from '../adapters/openai';
import { AiProviderError, DEFAULT_MAX_TOKENS } from '../adapter';

const REQ = { model: 'gpt-4o-mini', systemPrompt: 's', userMessage: 'u' };

const okResponse = (json: unknown) => ({ ok: true, json: async () => json });
const GOOD = {
  choices: [{ message: { content: 'response text' } }],
  usage: { prompt_tokens: 20, completion_tokens: 10 },
};

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AiProviderError);
    return (err as AiProviderError).kind;
  }
  throw new Error('expected a rejection');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OpenAiAdapter', () => {
  const adapter = new OpenAiAdapter({ apiKey: 'test-key' });

  it('sends the Chat Completions request with a timeout signal', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse(GOOD));
    vi.stubGlobal('fetch', mockFetch);

    const result = await adapter.complete({ ...REQ, maxTokens: 300, temperature: 0.5 });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(opts.body);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
    expect(body.max_tokens).toBe(300);
    expect(body.temperature).toBe(0.5);
    expect(result).toEqual({ content: 'response text', inputTokens: 20, outputTokens: 10 });
  });

  it('max_tokens defaults to 1024', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse(GOOD));
    vi.stubGlobal('fetch', mockFetch);
    await adapter.complete(REQ);
    expect(DEFAULT_MAX_TOKENS).toBe(1024);
    expect(JSON.parse(mockFetch.mock.calls[0]![1].body).max_tokens).toBe(1024);
  });

  it('OPENAI_BASE_URL (EU endpoint) replaces the host, without code', async () => {
    const eu = new OpenAiAdapter({ apiKey: 'k', baseUrl: 'https://eu.api.openai.com/v1/' });
    const mockFetch = vi.fn().mockResolvedValue(okResponse(GOOD));
    vi.stubGlobal('fetch', mockFetch);
    await eu.complete(REQ);
    expect(mockFetch.mock.calls[0]![0]).toBe('https://eu.api.openai.com/v1/chat/completions');
  });

  it('a provider that does not answer in time → timeout (30 s by default)', async () => {
    const slow = new OpenAiAdapter({ apiKey: 'k', timeoutMs: 20 });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
          }),
      ),
    );
    expect(await kindOf(slow.complete(REQ))).toBe('timeout');
  });

  it('a response without usage → no_usage (the cost would be unknown)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: 'x' } }] })),
    );
    expect(await kindOf(adapter.complete(REQ))).toBe('no_usage');
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'retryable'],
    [400, 'rejected'],
  ])('HTTP %i → %s', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status, text: async () => 'body' }),
    );
    expect(await kindOf(adapter.complete(REQ))).toBe(kind);
  });

  it('network error → retryable, the message carries no key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    try {
      await adapter.complete(REQ);
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('retryable');
      expect(JSON.stringify(err) + (err as Error).message).not.toContain('test-key');
    }
  });

  it('no choices → rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ choices: [], usage: {} })));
    expect(await kindOf(adapter.complete(REQ))).toBe('rejected');
  });
});

describe('openAiConfigFromEnv', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('null without OPENAI_API_KEY', () => {
    delete process.env.OPENAI_API_KEY;
    expect(openAiConfigFromEnv()).toBeNull();
  });

  it('reads the key and OPENAI_BASE_URL', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_BASE_URL = 'https://eu.api.openai.com/v1';
    expect(openAiConfigFromEnv()).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://eu.api.openai.com/v1',
    });
  });
});
