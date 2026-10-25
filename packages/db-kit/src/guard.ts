import type { TenantContext } from './types';

export class MissingTenantContextError extends Error {
  constructor() {
    super(
      '[db-kit] TenantContext.organizationId lipsă. Apelează authorize() înainte de orice acces la date.',
    );
    this.name = 'MissingTenantContextError';
  }
}

export class MissingBulkFilterError extends Error {
  constructor(operation: string) {
    super(
      `[db-kit] Operația în masă "${operation}" necesită un filtru explicit. Trimite cel puțin { where: { organizationId } }.`,
    );
    this.name = 'MissingBulkFilterError';
  }
}

/**
 * Aruncă MissingTenantContextError dacă ctx sau ctx.organizationId lipsesc.
 * Apelează la intrarea în orice funcție de acces la date. — ARCHITECTURE §12.3
 */
export function guardTenant(ctx: TenantContext | null | undefined): asserts ctx is TenantContext {
  if (!ctx?.organizationId) {
    throw new MissingTenantContextError();
  }
}

/**
 * Aruncă MissingBulkFilterError dacă filter lipsește sau e gol.
 * Apelează înainte de updateMany / deleteMany. — ARCHITECTURE §12.3, D-SEC-3
 */
export function guardBulkOp(
  operation: string,
  filter: Record<string, unknown> | null | undefined,
): void {
  if (!filter || Object.keys(filter).length === 0) {
    throw new MissingBulkFilterError(operation);
  }
}
