import type { AiProvider } from './adapter';
import { OpenAiAdapter, openAiConfigFromEnv } from './adapters/openai';
import { UnconfiguredAiProvider } from './adapters/unconfigured';

/** OPENAI_API_KEY set → OpenAI; missing → every call fails as `not_configured`. */
export function makeAiProvider(): AiProvider {
  const config = openAiConfigFromEnv();
  return config ? new OpenAiAdapter(config) : new UnconfiguredAiProvider();
}

let override: AiProvider | null = null;

/** Replaces the provider (tests, composition root). `null` restores the default. */
export function setAiProvider(provider: AiProvider | null): void {
  override = provider;
}

export function getAiProvider(): AiProvider {
  return override ?? makeAiProvider();
}
