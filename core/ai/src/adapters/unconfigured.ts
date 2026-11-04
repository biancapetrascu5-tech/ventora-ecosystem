import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResponse,
} from '../adapter';

export class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'unconfigured';

  async complete(_request: AiProviderRequest): Promise<AiProviderResponse> {
    throw new AiProviderError(
      'not_configured',
      '[ai] provider is not configured (OPENAI_API_KEY missing)',
    );
  }
}
