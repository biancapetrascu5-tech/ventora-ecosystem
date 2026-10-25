/** Contextul de tenant stabilit de authorize() — ARCHITECTURE §11.1 */
export interface TenantContext {
  organizationId: string;
  userId?: string;
  actor?: 'user' | 'system' | 'support';
}
