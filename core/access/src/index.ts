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
