import { listDeadLetterEvents, type DeadLetterEvent } from '@ventora/db-kit';
import type { PoolLike } from './dispatcher';

/*
 * Lista dead-letter, citibilă din Founder (Lot 4.1). Rulează pe conexiunea founder_runtime,
 * prin `<schema>.outbox_dead_letters` (SECURITY DEFINER, fără payload). Ecranul vine mai
 * târziu (lipsește din design); contractul cu sesiunea Founder se leagă odată cu el.
 */
export async function listOutboxDeadLetters(params: {
  founderPool: PoolLike;
  schemas: readonly string[];
  limit?: number;
}): Promise<(DeadLetterEvent & { schema: string })[]> {
  const client = await params.founderPool.connect();
  try {
    const all: (DeadLetterEvent & { schema: string })[] = [];
    for (const schema of params.schemas) {
      const rows = await listDeadLetterEvents(client, schema, params.limit ?? 100);
      all.push(...rows.map((r) => ({ ...r, schema })));
    }
    return all.sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime());
  } finally {
    client.release();
  }
}
