export {
  authorize,
  grantApplicationAccess,
  checkRolePermission,
  configureAccess,
  ensureAccessConfigured,
  acceptInvitationWithAccess,
} from './contract';
export type { TenantContext, AuthorizeParams } from './contract';
export { getAccessDb, makeAccessClient } from './db';
