// Lot 4.6: the support requests (brief §39, D4-13 = a, D4-14 = b, D4-15 = b, S116-D18)
export {
  SUPPORT_STATUSES,
  SUPPORT_URGENCIES,
  SUBJECT_MAX,
  BODY_MAX,
  AUTO_CLOSE_DAYS,
  AUTO_CLOSE_WARNING_DAYS_BEFORE,
  SupportTransitionRefused,
  hubStatus,
  founderStatus,
  nextStatus,
  eventKindOf,
} from './status';
export type {
  SupportStatus,
  SupportUrgency,
  HubStatus,
  FounderStatus,
  SupportAction,
  SupportEventKind,
} from './status';
export {
  SUPPORT_APPLICATIONS,
  ATTACHMENTS_PER_MESSAGE_MAX,
  REF_RE as SUPPORT_REF_RE,
  isSupportApplication,
  supportApplicationFor,
} from './model';
export type {
  SupportApplication,
  SupportRequestRow,
  SupportMessage,
  SupportAttachment,
  SupportHistoryItem,
  SupportThread,
} from './model';
export {
  resolveSupportActor,
  seesAllRequests,
  newSupportRequestId,
  listSupportRequests,
  countSupportNewReplies,
  createSupportRequest,
  getSupportThread,
  replyToSupportRequest,
  reopenSupportRequest,
  startSupportUpload,
  finishSupportUpload,
} from './hub';
export type { SupportActor, HubSupportThread } from './hub';
export {
  listSupportRequestsForFounder,
  countSupportRequestsForFounder,
  getSupportThreadForFounder,
  replyAsTeam,
  markSupportRequestInProgress,
  closeSupportRequestAsTeam,
  startTeamUpload,
  finishTeamUpload,
  isSupportRequestRefOf,
} from './founder';
export type { FounderSupportGroup, FounderSupportListItem, FounderSupportCounts } from './founder';
export { supportReplyConsumer, supportAutoCloseWarningConsumer, bucharestDay } from './consumers';
export { runSupportAutoCloseJob } from './job';
export type { SupportAutoCloseReport } from './job';
export { SUPPORT_FILE_MODULE, SUPPORT_FILE_RESOURCE } from './attachments';
export { closeSupportPools } from './db';
