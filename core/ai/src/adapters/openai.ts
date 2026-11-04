import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResponse,
} from '../adapter';

export interface OpenAiAdapterConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * OpenAI adapter — uses fetch directly against the Chat Completions API.
 *
 * If the SDK proposal (openai package) is approved by the founder, this will
 * be replaced with the SDK client. The adapter interface stays the same.
 */
export class OpenAiAdapter implements AiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: request.model,
      messages: [
        { role: 'system' as const, content: request.systemPrompt },
        { role: 'user' as const, content: request.userMessage },
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new AiProviderError('retryable', 'OpenAI request failed (network)', err);
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
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = json.choices[0];
    if (!choice) {
      throw new AiProviderError('rejected', 'OpenAI returned no choices');
    }

    return {
      content: choice.message.content,
      inputTokens: json.usage.prompt_tokens,
      outputTokens: json.usage.completion_tokens,
    };
  }
}

export function openAiConfigFromEnv(): OpenAiAdapterConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
  };
}
