export interface AiProviderRequest {
  model: string;
  systemPrompt: string;
  userMessage: string;
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

export type AiProviderErrorKind = 'retryable' | 'rejected' | 'rate_limited' | 'not_configured';

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
