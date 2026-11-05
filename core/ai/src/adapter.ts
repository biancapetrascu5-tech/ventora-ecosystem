export interface AiProviderRequest {
  model: string;
  systemPrompt: string;
  userMessage: string;
  /** Default DEFAULT_MAX_TOKENS. */
  maxTokens?: number;
  temperature?: number;
}

export interface AiProviderResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export const DEFAULT_MAX_TOKENS = 1024;
export const PROVIDER_TIMEOUT_MS = 30_000;

export type AiProviderErrorKind =
  'retryable' | 'rejected' | 'rate_limited' | 'timeout' | 'no_usage' | 'not_configured';

/** Never carries the API key; `detail` is the provider's response body, kept out of logs. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
