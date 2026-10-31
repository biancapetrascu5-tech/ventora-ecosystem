import {
  completeOutboxEvent,
  enterTenantContext,
  isOutboxEventProcessed,
  listPendingOutboxEvents,
  lockPendingOutboxEvent,
  markOutboxEventProcessed,
  recordOutboxFailure,
  sqlIdentifier,
  type OutboxSqlClient,
} from '@ventora/db-kit';
import { EVENT_CATALOG, findEventDefinition, type EventDefinition } from '@ventora/contracts';
import type { ConsumerRegistry } from './consumers';

/*
 * Dispecerul outbox-ului (Lot 4.1, D4-2 = a). Rulează în fundal (Lotul 4.2 îl pune pe un
 * program); nu e cod de request și nu folosește un context de sistem.
 *
 * Pentru fiecare eveniment care așteaptă, o tranzacție:
 *   1. rolul modulului emițător și organizația din plic (SET LOCAL, §12.3), deci totul sub RLS;
 *   2. rândul blocat (FOR UPDATE SKIP LOCKED) până la COMMIT: doi dispeceri nu livrează același
 *      eveniment în paralel;
 *   3. fiecare consumator într-un SAVEPOINT: efectul lui și `processed_events` împreună; un
 *      consumator care l-a procesat deja e sărit (livrare dublă = efect unic, T6);
 *   4. toți au reușit → `dispatched`; unul a eșuat → eșecul se notează (30 s, 2 min, apoi
 *      dead-letter la al 3-lea), iar consumatorii reușiți rămân procesați.
 */

export interface PoolLike {
  connect(): Promise<OutboxSqlClient & { release(err?: Error | boolean): void }>;
}

/** O schemă care emite: tabelele ei de outbox și rolul modulului (de ex. organizations, org_rw). */
export interface OutboxSource {
  schema: string;
  moduleRole: string;
}

export interface DispatchReport {
  /** Evenimente livrate tuturor consumatorilor (sau fără destinatar, `complete`). */
  delivered: number;
  /** Evenimente cu un eșec, care vor fi reîncercate. */
  retried: number;
  /** Evenimente trecute acum în dead-letter. */
  dead: number;
  /** Evenimente luate între timp de alt dispecer. */
  skipped: number;
}

export async function dispatchOutbox(params: {
  pool: PoolLike;
  source: OutboxSource;
  registry: ConsumerRegistry;
  catalog?: readonly EventDefinition[];
  limit?: number;
}): Promise<DispatchReport> {
  const { pool, source, registry } = params;
  const catalog = params.catalog ?? EVENT_CATALOG;
  const role = sqlIdentifier(source.moduleRole, 'Rol');
  const report: DispatchReport = { delivered: 0, retried: 0, dead: 0, skipped: 0 };

  const client = await pool.connect();
  try {
    // ce așteaptă, în toate organizațiile: doar id-ul și organizația (outbox_pending)
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const pending = await listPendingOutboxEvents(client, source.schema, params.limit ?? 20);
    await client.query('COMMIT');

    for (const candidate of pending) {
      const outcome = await dispatchOne(client, source, registry, catalog, candidate);
      report[outcome] += 1;
    }
    return report;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function dispatchOne(
  client: OutboxSqlClient,
  source: OutboxSource,
  registry: ConsumerRegistry,
  catalog: readonly EventDefinition[],
  candidate: { eventId: string; organizationId: string },
): Promise<keyof DispatchReport> {
  const { schema, moduleRole } = source;
  await client.query('BEGIN');
  try {
    await enterTenantContext(client, moduleRole, candidate.organizationId);
    const envelope = await lockPendingOutboxEvent(client, schema, candidate.eventId);
    if (!envelope) {
      await client.query('COMMIT');
      return 'skipped';
    }

    const consumers = registry.consumersFor(envelope.type, envelope.version);
    if (consumers.length === 0) {
      const def = findEventDefinition(envelope.type, envelope.version, catalog);
      if (def?.withoutConsumer === 'complete') {
        await completeOutboxEvent(client, schema, envelope.eventId);
        await client.query('COMMIT');
        return 'delivered';
      }
      const why = def ? 'no consumer registered' : 'event type not in the catalog';
      await recordOutboxFailure(client, schema, envelope.eventId, new Error(why), 1);
      await client.query('COMMIT');
      return 'dead';
    }

    for (const consumer of consumers) {
      if (await isOutboxEventProcessed(client, schema, consumer.name, envelope.eventId)) continue;
      await client.query('SAVEPOINT consumer');
      try {
        await consumer.handle(envelope, client);
        // consumatorul poate fi trecut pe rolul lui; processed_events e al emițătorului
        await client.query(`SET LOCAL ROLE ${sqlIdentifier(moduleRole, 'Rol')}`);
        if (!(await markOutboxEventProcessed(client, schema, consumer.name, envelope))) {
          // procesat între timp de altcineva: efectul de acum nu rămâne
          await client.query('ROLLBACK TO SAVEPOINT consumer');
        } else {
          await client.query('RELEASE SAVEPOINT consumer');
        }
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT consumer');
        await client.query(`SET LOCAL ROLE ${sqlIdentifier(moduleRole, 'Rol')}`);
        const error = new Error(`${consumer.name}: ${err instanceof Error ? err.message : err}`);
        const state = await recordOutboxFailure(client, schema, envelope.eventId, error);
        await client.query('COMMIT');
        return state === 'dead' ? 'dead' : 'retried';
      }
    }

    await completeOutboxEvent(client, schema, envelope.eventId);
    await client.query('COMMIT');
    return 'delivered';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
