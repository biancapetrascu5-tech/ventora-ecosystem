import { guardTenant } from '@ventora/db-kit';
import { InvalidInput, summarizeError } from '@ventora/errors';
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
import { withModuleRead, withOrganizationRead, withOrganizationWrite } from './db';
import { analysisOperationId, getAnalysisQuota } from './quota';
import { assertNoRestrictedData } from './restricted-data';

export class AiCostLimitExceededError extends Error {
  readonly code = 'ai_cost_limit_exceeded' as const;
  constructor(
    readonly scope: 'global' | 'organization',
    readonly currentCostRon: number,
    readonly limitRon: number,
  ) {
    super(
      `[ai] ${scope} cost limit reached: ${currentCostRon.toFixed(2)} / ${limitRon.toFixed(2)} RON`,
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
 * One analysis (D4-21, fondatoarea 05.11.2026): a successful call started by a user, whose result
 * is returned to be shown. Refusals (restricted data, cost plafon, quota) and failures are not
 * counted: the ai.analyses unit is reserved only after the checks, released on failure and
 * committed with the usage row.
 */
export async function runAnalysis(params: AiCompletionParams): Promise<AiCompletionResult> {
  const { organizationId, applicationId, userId, promptKey, userMessage } = params;
  guardTenant({ organizationId });
  if (!userId) throw new InvalidInput('An analysis is started by a user');
  assertNoRestrictedData(params.dataAttestation, userMessage);

  const period = currentPeriod();

  const prompt = await withOrganizationRead(organizationId, (client) =>
    getSystemPrompt(client, organizationId, applicationId, promptKey),
  );
  if (!prompt) throw new AiPromptNotFoundError(applicationId, promptKey);

  const model = await withModuleRead((client) => getModelConfig(client, prompt.modelSlug));
  if (!model) throw new AiModelNotFoundError(prompt.modelSlug);

  const org = await withOrganizationRead(organizationId, (client) =>
    checkOrgCostLimit(client, organizationId, period),
  );
  if (!org.allowed) {
    throw new AiCostLimitExceededError('organization', org.currentCostRon, org.limitRon!);
  }
  const global = await withModuleRead((client) => checkGlobalCostLimit(client, period));
  if (!global.allowed) {
    throw new AiCostLimitExceededError('global', global.currentCostRon, global.limitRon!);
  }

  const ctx = { organizationId };
  const quota = getAnalysisQuota();
  const operationId = analysisOperationId(crypto.randomUUID());
  await quota.reserve(ctx, operationId);

  let result: AiCompletionResult;
  try {
    const response = await getAiProvider().complete({
      model: model.providerModelId,
      systemPrompt: prompt.content,
      userMessage,
      maxTokens: Math.min(prompt.maxOutputTokens, model.maxOutputTokens),
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
        operationId,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costRon,
      }),
    );
    result = {
      operationId,
      content: response.content,
      modelSlug: model.slug,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costRon,
    };
  } catch (err) {
    await quota.release(ctx, operationId).catch((releaseErr: unknown) => {
      console.error('[ai] runAnalysis: releasing the quota failed', {
        operationId,
        error: summarizeError(releaseErr),
      });
    });
    throw err;
  }

  // the usage row exists: a commit that fails here is done by the reconciliation (§8.3)
  await quota.commit(ctx, operationId).catch((err: unknown) => {
    console.error('[ai] runAnalysis: committing the quota failed', {
      operationId,
      error: summarizeError(err),
    });
  });
  return result;
}
