import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAiAdapter, openAiConfigFromEnv } from '../adapters/openai';
import { AiProviderError } from '../adapter';

describe('OpenAiAdapter', () => {
  const adapter = new OpenAiAdapter({ apiKey: 'test-key' });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct request shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'response text' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adapter.complete({
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helper.',
      userMessage: 'Hello',
      maxTokens: 1000,
      temperature: 0.5,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-key');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.max_tokens).toBe(1000);
    expect(body.temperature).toBe(0.5);

    expect(result.content).toBe('response text');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(10);
  });

  it('uses custom baseUrl', async () => {
    const euAdapter = new OpenAiAdapter({ apiKey: 'k', baseUrl: 'https://eu.api.openai.com/v1' });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await euAdapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    expect(mockFetch.mock.calls[0][0]).toBe('https://eu.api.openai.com/v1/chat/completions');
  });

  it('throws retryable on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toThrow(AiProviderError);

    try {
      await adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('retryable');
    }
  });

  it('throws rate_limited on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }),
    );

    try {
      await adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('rate_limited');
    }
  });

  it('throws retryable on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }),
    );

    try {
      await adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('retryable');
    }
  });

  it('throws rejected on 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' }),
    );

    try {
      await adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('rejected');
    }
  });

  it('throws rejected when no choices returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } }),
      }),
    );

    await expect(
      adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toThrow('no choices');
  });
});

describe('openAiConfigFromEnv', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns null when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY;
    expect(openAiConfigFromEnv()).toBeNull();
  });

  it('returns config with key', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const config = openAiConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config!.apiKey).toBe('sk-test');
    expect(config!.baseUrl).toBeUndefined();
  });

  it('includes baseUrl when OPENAI_BASE_URL is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_BASE_URL = 'https://eu.api.openai.com/v1';
    const config = openAiConfigFromEnv();
    expect(config!.baseUrl).toBe('https://eu.api.openai.com/v1');
  });
});
