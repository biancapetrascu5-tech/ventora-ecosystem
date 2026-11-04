import type { AiProvider, AiProviderRequest, AiProviderResponse } from '../adapter';

export interface CapturedAiCall {
  request: AiProviderRequest;
  response: AiProviderResponse;
}

export class TestAiAdapter implements AiProvider {
  readonly name = 'test';
  readonly calls: CapturedAiCall[] = [];

  private nextResponse: AiProviderResponse = {
    content: 'Test AI response',
    inputTokens: 10,
    outputTokens: 5,
  };

  setNextResponse(response: AiProviderResponse): void {
    this.nextResponse = response;
  }

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const response = { ...this.nextResponse };
    this.calls.push({ request, response });
    return response;
  }

  reset(): void {
    this.calls.length = 0;
    this.nextResponse = { content: 'Test AI response', inputTokens: 10, outputTokens: 5 };
  }
}
