/** Interfața minimă necesară pentru operații de cotă. Fără dependență Prisma. */
export interface QuotaRawClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ReserveParams {
  organizationId: string;
  metric: string;
  amount: number;
  operationId: string;
  ttlSeconds?: number;
}

export type ReserveResult =
  | { ok: true; reservationId: string; idempotent?: boolean }
  | { ok: false; reason: 'quota_exceeded' };

export interface ConfirmResult {
  ok: boolean;
  reason?: 'not_found' | 'already_released';
}

export interface ReleaseResult {
  ok: boolean;
  reason?: 'not_found';
}
