// Validare nume rol — previne SQL injection în SET LOCAL ROLE
function validateRole(role: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(
      `[db-kit] Nume de rol invalid: "${role}". Sunt permise doar litere mici, cifre și _`,
    );
  }
  return role;
}

export interface TenantDb {
  $transaction<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T>;
}

export interface TenantTx {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/**
 * Execută fn într-o tranzacție cu SET LOCAL ROLE + set_config('app.organization_id').
 * Varianta C (D-DB-1): rol de modul NOLOGIN + NOINHERIT, accesibil prin SET LOCAL ROLE.
 * RLS citește current_setting('app.organization_id', true) — D-SEC-1.
 *
 * @see docs/experiments/E4.md (varianta C)
 * @see docs/experiments/E5.md (mecanismul RLS)
 */
export async function withTenantContext<T>(
  db: TenantDb,
  organizationId: string,
  role: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  const safeRole = validateRole(role);
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
