import type { PoolClient } from 'pg';
import type { AiModelConfig, AiUsageRecord } from './types';

export function computeCostRon(
  model: AiModelConfig,
  inputTokens: number,
  outputTokens: number,
): number {
  return inputTokens * model.costPerInputTokenRon + outputTokens * model.costPerOutputTokenRon;
}

export interface UsagePeriod {
  year: number;
  month: number;
}

export function currentPeriod(at?: Date): UsagePeriod {
  const d = at ?? new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export async function recordUsage(
  client: PoolClient,
  record: Omit<AiUsageRecord, 'id' | 'createdAt'>,
): Promise<void> {
  await client.query(
    `INSERT INTO ai.usage_records
       (organization_id, application_id, user_id, model_slug, prompt_key,
        input_tokens, output_tokens, cost_ron)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.organizationId,
      record.applicationId,
      record.userId,
      record.modelSlug,
      record.promptKey,
      record.inputTokens,
      record.outputTokens,
      record.costRon,
    ],
  );
}

export interface CostCheckResult {
  allowed: boolean;
  currentCostRon: number;
  limitRon: number | null;
}

export async function checkOrgCostLimit(
  client: PoolClient,
  organizationId: string,
  period: UsagePeriod,
): Promise<CostCheckResult> {
  const limitRow = await client.query<{ limit_ron: string; enabled: boolean }>(
    `SELECT limit_ron, enabled FROM ai.cost_limits
     WHERE organization_id = $1 AND period = 'month' AND enabled = true`,
    [organizationId],
  );

  if (limitRow.rows.length === 0) {
    return { allowed: true, currentCostRon: 0, limitRon: null };
  }

  const limitRon = parseFloat(limitRow.rows[0].limit_ron);

  const usageRow = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_ron), 0) AS total FROM ai.usage_records
     WHERE organization_id = $1
       AND EXTRACT(YEAR FROM created_at) = $2
       AND EXTRACT(MONTH FROM created_at) = $3`,
    [organizationId, period.year, period.month],
  );

  const currentCostRon = parseFloat(usageRow.rows[0].total);

  return {
    allowed: currentCostRon < limitRon,
    currentCostRon,
    limitRon,
  };
}

export async function checkGlobalCostLimit(
  client: PoolClient,
  period: UsagePeriod,
): Promise<CostCheckResult> {
  const limitRow = await client.query<{ limit_ron: string; enabled: boolean }>(
    `SELECT limit_ron, enabled FROM ai.cost_limits
     WHERE organization_id IS NULL AND period = 'month' AND enabled = true`,
  );

  if (limitRow.rows.length === 0) {
    return { allowed: true, currentCostRon: 0, limitRon: null };
  }

  const limitRon = parseFloat(limitRow.rows[0].limit_ron);

  const usageRow = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_ron), 0) AS total
     FROM ai.global_monthly_cost($1, $2)`,
    [period.year, period.month],
  );

  const currentCostRon = parseFloat(usageRow.rows[0].total);

  return {
    allowed: currentCostRon < limitRon,
    currentCostRon,
    limitRon,
  };
}

export async function getModelConfig(
  client: PoolClient,
  slug: string,
): Promise<AiModelConfig | null> {
  const row = await client.query<{
    slug: string;
    provider: string;
    provider_model_id: string;
    display_name: string;
    max_input_tokens: number;
    max_output_tokens: number;
    cost_per_input_token_ron: string;
    cost_per_output_token_ron: string;
  }>(
    `SELECT slug, provider, provider_model_id, display_name,
            max_input_tokens, max_output_tokens,
            cost_per_input_token_ron, cost_per_output_token_ron
     FROM ai.models WHERE slug = $1 AND enabled = true`,
    [slug],
  );

  if (row.rows.length === 0) return null;

  const r = row.rows[0];
  return {
    slug: r.slug,
    provider: r.provider,
    providerModelId: r.provider_model_id,
    displayName: r.display_name,
    maxInputTokens: r.max_input_tokens,
    maxOutputTokens: r.max_output_tokens,
    costPerInputTokenRon: parseFloat(r.cost_per_input_token_ron),
    costPerOutputTokenRon: parseFloat(r.cost_per_output_token_ron),
  };
}

export async function getSystemPrompt(
  client: PoolClient,
  organizationId: string,
  applicationId: string,
  promptKey: string,
): Promise<{ modelSlug: string; content: string } | null> {
  const row = await client.query<{ model_slug: string; content: string }>(
    `SELECT model_slug, content FROM ai.system_prompts
     WHERE (organization_id = $1 OR organization_id IS NULL)
       AND application_id = $2
       AND prompt_key = $3
       AND enabled = true
     ORDER BY organization_id NULLS LAST
     LIMIT 1`,
    [organizationId, applicationId, promptKey],
  );

  if (row.rows.length === 0) return null;
  return { modelSlug: row.rows[0].model_slug, content: row.rows[0].content };
}
