export {
  authorize,
  grantApplicationAccess,
  checkRolePermission,
  configureAccess,
  ensureAccessConfigured,
  acceptInvitationWithAccess,
  listAuditLogs,
} from './contract';
export { PLATFORM_APPLICATION_ID, platformManifest } from './platform-manifest';
export type { TenantContext, AuthorizeParams } from './contract';
export { getAccessDb, makeAccessClient } from './db';
export {
  openSupportSession,
  closeSupportSession,
  authorizeSupport,
  listActiveSupportSessions,
  getSupportSessionBanner,
  closeSupportSessionAsOwner,
  isSupportPermission,
  SUPPORT_PERMISSIONS,
  SUPPORT_SESSION_DEFAULT_MINUTES,
  SUPPORT_SESSION_MAX_MINUTES,
} from './support';
export type { SupportSessionSummary, ActiveSupportSession, SupportSessionBanner } from './support';
export { recoverOwnerAccess } from './owner-recovery';
export type { RecoverOwnerAccessResult } from './owner-recovery';
export { closeFounderPools } from './founder-db';
