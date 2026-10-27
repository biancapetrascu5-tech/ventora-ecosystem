export {
  authorize,
  grantApplicationAccess,
  checkRolePermission,
  configureAccess,
  acceptInvitationWithAccess,
} from './contract.js';
export type { TenantContext, AuthorizeParams } from './contract.js';
export { getAccessDb, makeAccessClient } from './db.js';
