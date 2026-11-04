import type { AiCompletionParams, AiCompletionResult } from './types';
import { getAiProvider } from './channel';
import {
  checkGlobalCostLimit,
  checkOrgCostLimit,
  computeCostRon,
  currentPeriod,
  getModelConfig,
  getSystemPrompt,
  recordUsage,
} from './cost';
import { withModuleRead, withOrganizationWrite } from './db';

export class AiCostLimitExceededError extends Error {
  readonly code = 'ai_cost_limit_exceeded' as const;
  constructor(
    readonly scope: 'global' | 'organization',
    readonly currentCostRon: number,
    readonly limitRon: number,
  ) {
    super(
      `[ai] ${scope} cost limit exceeded: ${currentCostRon.toFixed(2)} / ${limitRon.toFixed(2)} RON`,
    );
    this.name = 'AiCostLimitExceededError';
  }
}

export class AiModelNotFoundError extends Error {
  readonly code = 'ai_model_not_found' as const;
  constructor(slug: string) {
    super(`[ai] model not found or disabled: ${slug}`);
    this.name = 'AiModelNotFoundError';
  }
}

export class AiPromptNotFoundError extends Error {
  readonly code = 'ai_prompt_not_found' as const;
  constructor(applicationId: string, promptKey: string) {
    super(`[ai] system prompt not found: ${applicationId}/${promptKey}`);
    this.name = 'AiPromptNotFoundError';
  }
}

/**
 * Run one AI analysis: resolve prompt + model from DB, check cost limits,
 * call the provider, record usage. The caller is responsible for checking
 * the quota (ai.analyses) via reserveQuota/commitQuota before calling this.
 */
export async function runAnalysis(params: AiCompletionParams): Promise<AiCompletionResult> {
  const { organizationId, applicationId, userId, promptKey, userMessage } = params;
  const period = currentPeriod();

  const prompt =
    params.systemPromptOverride != null
      ? { content: params.systemPromptOverride, modelSlug: params.modelSlugOverride ?? '' }
      : await withOrganizationWrite(organizationId, (client) =>
          getSystemPrompt(client, organizationId, applicationId, promptKey),
        );

  if (!prompt) throw new AiPromptNotFoundError(applicationId, promptKey);

  const modelSlug = params.modelSlugOverride ?? prompt.modelSlug;
  if (!modelSlug) throw new AiModelNotFoundError('(empty)');

  const model = await withModuleRead((client) => getModelConfig(client, modelSlug));
  if (!model) throw new AiModelNotFoundError(modelSlug);

  const orgCostCheck = await withOrganizationWrite(organizationId, (client) =>
    checkOrgCostLimit(client, organizationId, period),
  );
  if (!orgCostCheck.allowed) {
    throw new AiCostLimitExceededError(
      'organization',
      orgCostCheck.currentCostRon,
      orgCostCheck.limitRon!,
    );
  }

  const globalCostCheck = await withModuleRead((client) => checkGlobalCostLimit(client, period));
  if (!globalCostCheck.allowed) {
    throw new AiCostLimitExceededError(
      'global',
      globalCostCheck.currentCostRon,
      globalCostCheck.limitRon!,
    );
  }

  const provider = getAiProvider();
  const response = await provider.complete({
    model: model.providerModelId,
    systemPrompt: prompt.content,
    userMessage,
    maxTokens: params.maxTokens ?? model.maxOutputTokens,
    temperature: params.temperature,
  });

  const costRon = computeCostRon(model, response.inputTokens, response.outputTokens);

  await withOrganizationWrite(organizationId, (client) =>
    recordUsage(client, {
      organizationId,
      applicationId,
      userId,
      modelSlug: model.slug,
      promptKey,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costRon,
    }),
  );

  return {
    content: response.content,
    modelSlug: model.slug,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costRon,
  };
}
