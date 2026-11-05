import type { DataAttestation } from './restricted-data';

/**
 * One analysis, started by a user. The system prompt and the model come only from the database
 * (§12.4): the caller sends the user's text, which never goes into the system prompt.
 */
export interface AiCompletionParams {
  organizationId: string;
  applicationId: string;
  userId: string;
  promptKey: string;
  userMessage: string;
  /** Required until the lawyer's opinion (restricted-data.ts). */
  dataAttestation: DataAttestation;
  temperature?: number;
}

export interface AiCompletionResult {
  operationId: string;
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

export interface AiUsageRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  userId: string;
  modelSlug: string;
  promptKey: string;
  operationId: string;
  inputTokens: number;
  outputTokens: number;
  costRon: number;
  createdAt: Date;
}
