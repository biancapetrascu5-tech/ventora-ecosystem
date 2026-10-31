/** A pg client (or the dispatcher's transaction client) inside a transaction. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export { uuidv7 } from '@ventora/db-kit';
