import type { AiProvider } from './adapter';
import { OpenAiAdapter, openAiConfigFromEnv } from './adapters/openai';
import { UnconfiguredAiProvider } from './adapters/unconfigured';

export function makeAiProvider(): AiProvider {
  const openAiConfig = openAiConfigFromEnv();
  if (openAiConfig) return new OpenAiAdapter(openAiConfig);
  return process.env.NODE_ENV === 'production'
    ? new UnconfiguredAiProvider()
    : new UnconfiguredAiProvider();
}

let override: AiProvider | null = null;

export function setAiProvider(provider: AiProvider | null): void {
  override = provider;
}

export function getAiProvider(): AiProvider {
  return override ?? makeAiProvider();
}
