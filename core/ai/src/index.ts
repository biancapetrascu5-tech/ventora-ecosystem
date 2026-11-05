import { registerOperationResolver } from '@ventora/quota';
import { usageExists } from './cost';
import { withOrganizationRead } from './db';
import { AI_ANALYSES_QUOTA_KEY } from './quota';

registerOperationResolver(AI_ANALYSES_QUOTA_KEY, (organizationId, operationId) =>
  withOrganizationRead(organizationId, (client) => usageExists(client, operationId)),
);

export type { AiCompletionParams, AiCompletionResult, AiModelConfig, AiUsageRecord } from './types';

export type { AiProvider, AiProviderRequest, AiProviderResponse } from './adapter';
export {
  AiProviderError,
  DEFAULT_MAX_TOKENS,
  PROVIDER_TIMEOUT_MS,
  type AiProviderErrorKind,
} from './adapter';

export { getAiProvider, setAiProvider } from './channel';
export {
  runAnalysis,
  AiCostLimitExceededError,
  AiModelNotFoundError,
  AiPromptNotFoundError,
} from './analyze';
export {
  AiRestrictedDataError,
  NO_PERSONAL_OR_HEALTH_DATA,
  type DataAttestation,
} from './restricted-data';
export { AI_ANALYSES_QUOTA_KEY, setAnalysisQuotaForTests, type AnalysisQuota } from './quota';
export { AI_COST_TIME_ZONE, computeCostRon, currentPeriod, type UsagePeriod } from './cost';
export { closeAiPools } from './db';
