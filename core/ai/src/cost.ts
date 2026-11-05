import type { PoolClient } from 'pg';
import type { AiModelConfig, AiUsageRecord } from './types';

/** The internal cost month is the calendar month in Bucharest, not UTC. */
export const AI_COST_TIME_ZONE = 'Europe/Bucharest';

export interface UsagePeriod {
  year: number;
  month: number;
}

export function computeCostRon(
  model: AiModelConfig,
  inputTokens: number,
  outputTokens: number,
): number {
  return inputTokens * model.costPerInputTokenRon + outputTokens * model.costPerOutputTokenRon;
}

const periodFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: AI_COST_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
});

export function currentPeriod(at: Date = new Date()): UsagePeriod {
  const parts = periodFormat.formatToParts(at);
  const get = (type: 'year' | 'month') => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month') };
}

export async function recordUsage(
  client: PoolClient,
  record: Omit<AiUsageRecord, 'id' | 'createdAt'>,
): Promise<void> {
  await client.query(
    `INSERT INTO ai.usage_records
       (organization_id, application_id, user_id, model_slug, prompt_key, operation_id,
        input_tokens, output_tokens, cost_ron)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.organizationId,
      record.applicationId,
      record.userId,
      record.modelSlug,
      record.promptKey,
      record.operationId,
      record.inputTokens,
      record.outputTokens,
      record.costRon,
    ],
  );
}

/** For the quota reconciliation: the analysis happened iff its usage row exists. */
export async function usageExists(client: PoolClient, operationId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM ai.usage_records WHERE operation_id = $1`, [
    operationId,
  ]);
  return rows.length > 0;
}

export interface CostCheckResult {
  allowed: boolean;
  currentCostRon: number;
  limitRon: number | null;
}

function check(currentCostRon: number, limitRon: number | null): CostCheckResult {
  return { allowed: limitRon === null || currentCostRon < limitRon, currentCostRon, limitRon };
}

/** In the organization's context (ai_rw, RLS): its own plafon and its own usage. */
export async function checkOrgCostLimit(
  client: PoolClient,
  organizationId: string,
  period: UsagePeriod,
): Promise<CostCheckResult> {
  const { rows } = await client.query<{ limit_ron: string | null; total: string }>(
    `SELECT (SELECT limit_ron FROM ai.cost_limits
              WHERE organization_id = $1 AND period = 'month' AND enabled) AS limit_ron,
            (SELECT COALESCE(SUM(u.cost_ron), 0)
               FROM ai.usage_records u, ai.month_bounds($2, $3) b
              WHERE u.organization_id = $1
                AND u.created_at >= b.from_at AND u.created_at < b.to_at) AS total`,
    [organizationId, period.year, period.month],
  );
  const row = rows[0]!;
  return check(Number(row.total), row.limit_ron === null ? null : Number(row.limit_ron));
}

/** The platform-wide plafon; the total comes from the SECURITY DEFINER ai.global_monthly_cost. */
export async function checkGlobalCostLimit(
  client: PoolClient,
  period: UsagePeriod,
): Promise<CostCheckResult> {
  const { rows } = await client.query<{ limit_ron: string | null; total: string }>(
    `SELECT (SELECT limit_ron FROM ai.cost_limits
              WHERE organization_id IS NULL AND period = 'month' AND enabled) AS limit_ron,
            ai.global_monthly_cost($1, $2) AS total`,
    [period.year, period.month],
  );
  const row = rows[0]!;
  return check(Number(row.total), row.limit_ron === null ? null : Number(row.limit_ron));
}

export async function getModelConfig(
  client: PoolClient,
  slug: string,
): Promise<AiModelConfig | null> {
  const { rows } = await client.query<{
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
       FROM ai.models WHERE slug = $1 AND enabled`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    slug: r.slug,
    provider: r.provider,
    providerModelId: r.provider_model_id,
    displayName: r.display_name,
    maxInputTokens: r.max_input_tokens,
    maxOutputTokens: r.max_output_tokens,
    costPerInputTokenRon: Number(r.cost_per_input_token_ron),
    costPerOutputTokenRon: Number(r.cost_per_output_token_ron),
  };
}

export interface ResolvedPrompt {
  modelSlug: string;
  content: string;
  maxOutputTokens: number;
}

/** The organization's own prompt wins over the platform default. */
export async function getSystemPrompt(
  client: PoolClient,
  organizationId: string,
  applicationId: string,
  promptKey: string,
): Promise<ResolvedPrompt | null> {
  const { rows } = await client.query<{
    model_slug: string;
    content: string;
    max_output_tokens: number;
  }>(
    `SELECT model_slug, content, max_output_tokens FROM ai.system_prompts
      WHERE (organization_id = $1 OR organization_id IS NULL)
        AND application_id = $2 AND prompt_key = $3 AND enabled
      ORDER BY organization_id NULLS LAST
      LIMIT 1`,
    [organizationId, applicationId, promptKey],
  );
  const r = rows[0];
  if (!r) return null;
  return { modelSlug: r.model_slug, content: r.content, maxOutputTokens: r.max_output_tokens };
}
