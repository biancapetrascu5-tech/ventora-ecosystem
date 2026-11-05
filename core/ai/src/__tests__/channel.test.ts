import { describe, it, expect, afterEach } from 'vitest';
import { getAiProvider, setAiProvider } from '../channel';
import { TestAiAdapter } from '../adapters/test';
import { UnconfiguredAiProvider } from '../adapters/unconfigured';

afterEach(() => {
  setAiProvider(null);
});

describe('channel', () => {
  it('returns UnconfiguredAiProvider when no OPENAI_API_KEY', () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(getAiProvider()).toBeInstanceOf(UnconfiguredAiProvider);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
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
