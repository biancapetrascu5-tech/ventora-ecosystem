// Validare schemă — previne SQL injection în numele schemei
function validateSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`[db-kit] Schemă invalidă: "${schema}"`);
  }
  return schema;
}

export interface OutboxTx {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Scrie un eveniment în outbox_events al schemei date, în tranzacția curentă.
 * Pattern E7: atomic cu operația principală. — D-INF-4
 */
export async function writeOutboxEvent(
  tx: OutboxTx,
  schema: string,
  params: {
    id: string;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  const safeSchema = validateSchema(schema);
  await tx.$executeRawUnsafe(
    `INSERT INTO ${safeSchema}.outbox_events (id, "eventType", payload, "createdAt")
     VALUES ($1, $2, $3::jsonb, now())`,
    params.id,
    params.eventType,
    JSON.stringify(params.payload),
  );
}
