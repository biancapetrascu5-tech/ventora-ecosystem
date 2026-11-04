import { describe, it, expect, afterEach } from 'vitest';
import { getAiProvider, setAiProvider } from '../channel';
import { TestAiAdapter } from '../adapters/test';
import { UnconfiguredAiProvider } from '../adapters/unconfigured';

afterEach(() => {
  setAiProvider(null);
});

describe('channel', () => {
  it('returns UnconfiguredAiProvider when no OPENAI_API_KEY', () => {
    const provider = getAiProvider();
    expect(provider).toBeInstanceOf(UnconfiguredAiProvider);
  });

  it('allows overriding the provider', () => {
    const test = new TestAiAdapter();
    setAiProvider(test);
    expect(getAiProvider()).toBe(test);
  });

  it('restores default on null', () => {
    const test = new TestAiAdapter();
    setAiProvider(test);
    setAiProvider(null);
    expect(getAiProvider()).not.toBe(test);
  });
});
