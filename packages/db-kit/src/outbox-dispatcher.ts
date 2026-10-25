// Validare schemă — previne SQL injection în numele schemei
function validateSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`[db-kit] Schemă invalidă: "${schema}"`);
  }
  return schema;
}

export interface OutboxEvent {
  id: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

export interface OutboxDispatcherClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export type OutboxEventHandler = (event: OutboxEvent) => Promise<void>;

/**
 * Citește evenimentele neprocesate din outbox_events, le trimite prin handler,
 * marchează fiecare ca procesat atomic. — D-INF-4
 *
 * Rulat periodic (cron Inngest) sau declanșat după o tranzacție importantă.
 * Fiecare eveniment e procesat cel puțin o dată (at-least-once delivery).
 * La eșec: attempts++ și nu e marcat procesat (va fi reîncercat).
 *
 * @returns numărul de evenimente procesate cu succes
 */
export async function processOutboxEvents(
  client: OutboxDispatcherClient,
  schema: string,
  handler: OutboxEventHandler,
  batchSize = 10,
): Promise<number> {
  const safeSchema = validateSchema(schema);

  const result = await client.query(
    `SELECT id, "eventType", payload, attempts, "createdAt"
     FROM ${safeSchema}.outbox_events
     WHERE "processedAt" IS NULL
     ORDER BY "createdAt" ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [batchSize],
  );

  let processed = 0;
  for (const raw of result.rows) {
    const row = raw as {
      id: string;
      eventType: string;
      payload: unknown;
      attempts: number;
      createdAt: Date;
    };
    try {
      await handler({ ...row });
      await client.query(
        `UPDATE ${safeSchema}.outbox_events
         SET "processedAt" = now(), attempts = attempts + 1
         WHERE id = $1`,
        [row.id],
      );
      processed++;
    } catch {
      await client.query(
        `UPDATE ${safeSchema}.outbox_events
         SET attempts = attempts + 1
         WHERE id = $1`,
        [row.id],
      );
    }
  }
  return processed;
}
