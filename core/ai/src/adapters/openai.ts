import {
  AiProviderError,
  DEFAULT_MAX_TOKENS,
  PROVIDER_TIMEOUT_MS,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResponse,
} from '../adapter';

export interface OpenAiAdapterConfig {
  apiKey: string;
  /** OPENAI_BASE_URL: the EU endpoint once the EU project exists (D4-20), no code change. */
  baseUrl?: string;
  timeoutMs?: number;
}

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Chat Completions over fetch (decision: no SDK package). */
export class OpenAiAdapter implements AiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  }

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const body = {
      model: request.model,
      messages: [
        { role: 'system' as const, content: request.systemPrompt },
        { role: 'user' as const, content: request.userMessage },
      ],
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new AiProviderError('timeout', `OpenAI did not answer in ${this.timeoutMs} ms`);
      }
      throw new AiProviderError('retryable', 'OpenAI request failed (network)');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new AiProviderError('rate_limited', `OpenAI rate limited: ${res.status}`, text);
      }
      if (res.status >= 500) {
        throw new AiProviderError('retryable', `OpenAI server error: ${res.status}`, text);
      }
      throw new AiProviderError('rejected', `OpenAI error: ${res.status}`, text);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new AiProviderError('rejected', 'OpenAI returned no choices');
    }
    const inputTokens = json.usage?.prompt_tokens;
    const outputTokens = json.usage?.completion_tokens;
    if (!Number.isInteger(inputTokens) || !Number.isInteger(outputTokens)) {
      // without the token counts the cost cannot be recorded: the answer is not used
      throw new AiProviderError(
        'no_usage',
        'OpenAI response has no usage (prompt_tokens / completion_tokens): cost unknown',
      );
    }

    return { content, inputTokens: inputTokens!, outputTokens: outputTokens! };
  }
}

export function openAiConfigFromEnv(): OpenAiAdapterConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return { apiKey, baseUrl: process.env.OPENAI_BASE_URL || undefined };
}
