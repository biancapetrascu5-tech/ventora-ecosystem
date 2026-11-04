export interface AiCompletionParams {
  organizationId: string;
  applicationId: string;
  userId: string;
  promptKey: string;
  userMessage: string;
  /** Overrides the system prompt from DB, if set. */
  systemPromptOverride?: string;
  /** Overrides the model slug from DB, if set. */
  modelSlugOverride?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResult {
  content: string;
  modelSlug: string;
  inputTokens: number;
  outputTokens: number;
  costRon: number;
}

export interface AiModelConfig {
  slug: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  costPerInputTokenRon: number;
  costPerOutputTokenRon: number;
}

export interface AiSystemPrompt {
  promptKey: string;
  applicationId: string;
  modelSlug: string;
  content: string;
}

export interface AiUsageRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  userId: string;
  modelSlug: string;
  promptKey: string;
  inputTokens: number;
  outputTokens: number;
  costRon: number;
  createdAt: Date;
}

export interface AiCostLimit {
  organizationId: string | null;
  period: 'month';
  limitRon: number;
  enabled: boolean;
}
