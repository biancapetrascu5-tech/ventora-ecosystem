/**
 * @ventora/workflows — the workflow engine (Lot 4.10, D-WF-1…6, D4-22 = b: core/workflows, its
 * own service, apart from the dispatcher of 4.1–4.2). Founder builds, starts and stops; the Hub
 * reads (D-WF-3); the whitelist of S116-D19.
 */
import { registerOperationResolver } from '@ventora/quota';
import { WORKFLOWS_QUOTA_KEY, activationExists } from './engine';

// ARCHITECTURE §8.3 step 4: an expired workflows.active reservation is committed when its
// activation exists, released otherwise (at load time, like the other quota owners)
registerOperationResolver(WORKFLOWS_QUOTA_KEY, activationExists);

export {
  WORKFLOWS_QUOTA_KEY,
  activationExists,
  freeActivationQuota,
  freeStoppedQuota,
  runExecutionInTx,
  runPendingExecutions,
  stopOperationId,
  workflowsTriggerConsumer,
  type RunReport,
  type RunResult,
} from './engine';
export {
  activateWorkflow,
  listActivationsForFounder,
  listDefinitionsForFounder,
  listExecutionsForFounder,
  retryExecution,
  saveDefinition,
  setEnginePaused,
  startOperationId,
  stopWorkflow,
  type ActivationRow,
  type DefinitionSummary,
  type ExecutionLogRow,
} from './founder';
export { STEP_HANDLERS, type StepContext, type StepHandler, type StepOutcome } from './steps';
export {
  CONDITION_CODES,
  DELAYS_MINUTES,
  REASON_CODES,
  STEP_KINDS,
  STEP_TEMPLATES,
  TRIGGERS,
  TRIGGER_CODES,
  availableEventTypes,
  triggersForEvent,
  validateDefinition,
  type ConditionCode,
  type DefinitionInput,
  type DelayMinutes,
  type ReasonCode,
  type StepInput,
  type StepKind,
  type TriggerCode,
  type TriggerDef,
  type ValidDefinition,
} from './whitelist';
export { closeWorkflowsPools } from './db';
