import type { EventDefinition } from '@ventora/contracts';
import type { ConsumerRegistry } from '../consumers';
import {
  dispatchOutbox,
  type DispatchReport,
  type OutboxSource,
  type PoolLike,
} from '../dispatcher';
import type { JobDefinition } from './registry';

/*
 * Dispecerul outbox ca job periodic (Lot 4.2, D-INF-4). Rulează `dispatchOutbox` (Lot 4.1)
 * pentru fiecare schemă care emite. Contextul de tenant îl pune dispecerul, pentru fiecare
 * eveniment, din plic (rolul modulului + `app.organization_id`), deci job-ul nu are organizație.
 *
 * O schemă care eșuează nu le oprește pe celelalte; la final, eșecurile se aruncă împreună, ca
 * job-ul să fie raportat și reîncercat. Reîncercarea e sigură: un eveniment livrat nu mai e
 * `pending`, iar `processed_events` oprește un efect dublu.
 */

export const OUTBOX_DISPATCH_JOB_ID = 'platform.outbox-dispatch';

export function outboxDispatchJob(options: {
  pool: PoolLike;
  sources: readonly OutboxSource[];
  consumers: ConsumerRegistry;
  catalog?: readonly EventDefinition[];
  /** Implicit: în fiecare minut. */
  cron?: string;
  limit?: number;
}): JobDefinition {
  return {
    id: OUTBOX_DISPATCH_JOB_ID,
    owner: 'Lot 4.1 / 4.2',
    description: 'Dispecerul outbox: livrează evenimentele care așteaptă',
    trigger: { cron: options.cron ?? '* * * * *' },
    retries: 3,
    async run() {
      const reports: Record<string, DispatchReport> = {};
      const failures: { schema: string; error: unknown }[] = [];
      for (const source of options.sources) {
        try {
          reports[source.schema] = await dispatchOutbox({
            pool: options.pool,
            source,
            registry: options.consumers,
            catalog: options.catalog,
            limit: options.limit,
          });
        } catch (error) {
          failures.push({ schema: source.schema, error });
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((f) => f.error),
          `[integrations] outbox dispatch failed for: ${failures.map((f) => f.schema).join(', ')}`,
        );
      }
      return reports;
    },
  };
}
