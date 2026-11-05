import { describe, it, expect, beforeEach } from 'vitest';
import { TestAiAdapter } from '../adapters/test';
import { UnconfiguredAiProvider } from '../adapters/unconfigured';
import { AiProviderError } from '../adapter';

describe('TestAiAdapter', () => {
  let adapter: TestAiAdapter;

  beforeEach(() => {
    adapter = new TestAiAdapter();
  });

  it('returns the default response', async () => {
    const result = await adapter.complete({
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helper.',
      userMessage: 'Hello',
    });
    expect(result.content).toBe('Test AI response');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });

  it('captures calls', async () => {
    await adapter.complete({
      model: 'gpt-4o-mini',
      systemPrompt: 'System prompt',
      userMessage: 'User message',
    });
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0].request.model).toBe('gpt-4o-mini');
    expect(adapter.calls[0].request.userMessage).toBe('User message');
  });

  it('allows overriding the next response', async () => {
    adapter.setNextResponse({ content: 'Custom response', inputTokens: 50, outputTokens: 25 });
    const result = await adapter.complete({
      model: 'gpt-4o',
      systemPrompt: 'prompt',
      userMessage: 'msg',
    });
    expect(result.content).toBe('Custom response');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(25);
  });

  it('resets state', async () => {
    await adapter.complete({ model: 'm', systemPrompt: 's', userMessage: 'u' });
    adapter.reset();
    expect(adapter.calls).toHaveLength(0);
  });
});

describe('UnconfiguredAiProvider', () => {
  it('throws AiProviderError with not_configured kind', async () => {
    const provider = new UnconfiguredAiProvider();
    await expect(
      provider.complete({ model: 'gpt-4o-mini', systemPrompt: 'test', userMessage: 'hello' }),
    ).rejects.toThrow(AiProviderError);

    try {
      await provider.complete({ model: 'gpt-4o-mini', systemPrompt: 'test', userMessage: 'hello' });
    } catch (err) {
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).kind).toBe('not_configured');
    }
  });
});
