import { commitQuota, releaseQuota, reserveQuota, type QuotaContext } from '@ventora/quota';

/** D4-21: the client sees „Număr analize AI” (platform manifest, flow, monthly, block). */
export const AI_ANALYSES_QUOTA_KEY = 'ai.analyses';

export const analysisOperationId = (id: string) => `ai.analysis:${id}`;

/** The quota contract runAnalysis needs; the default is @ventora/quota (core/commercial). */
export interface AnalysisQuota {
  reserve(ctx: QuotaContext, operationId: string): Promise<void>;
  commit(ctx: QuotaContext, operationId: string): Promise<void>;
  release(ctx: QuotaContext, operationId: string): Promise<void>;
}

const realQuota: AnalysisQuota = {
  async reserve(ctx, operationId) {
    await reserveQuota(ctx, AI_ANALYSES_QUOTA_KEY, 1, operationId);
  },
  async commit(ctx, operationId) {
    await commitQuota(ctx, operationId);
  },
  async release(ctx, operationId) {
    await releaseQuota(ctx, operationId);
  },
};

let override: AnalysisQuota | null = null;

/** Tests only. `null` restores @ventora/quota. */
export function setAnalysisQuotaForTests(quota: AnalysisQuota | null): void {
  override = quota;
}

export function getAnalysisQuota(): AnalysisQuota {
  return override ?? realQuota;
}
