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
 * Dispecerul outbox ca job (Lot 4.2, D-INF-4; lotul Inngest, 13.11: la eveniment + cron de siguranță). Rulează `dispatchOutbox` (Lot 4.1)
 * pentru fiecare schemă care emite. Contextul de tenant îl pune dispecerul, pentru fiecare
 * eveniment, din plic (rolul modulului + `app.organization_id`), deci job-ul nu are organizație.
 *
 * Pornește la scrierea în outbox (evenimentul `platform/outbox.written`, adunat cu debounce: o
 * rulare după 10 s de liniște, cel târziu după un minut) și la un cron de siguranță, la 15 minute.
 *
 * O schemă care eșuează nu le oprește pe celelalte; la final, eșecurile se aruncă împreună, ca
 * job-ul să fie raportat (Sentry). Nu se reîncearcă în aceeași rulare (`retries: 0`): următoarea
 * rulare e reîncercarea, iar o schemă stricată nu mai înmulțește execuțiile cu 4. Reîncercarea e
 * sigură: un eveniment livrat nu mai e `pending`, iar `processed_events` oprește un efect dublu.
 *
 * O rulare are un buget de timp (`seconds`, implicit 40): după el nu mai ia evenimente noi; ce a
 * rămas pleacă la rularea următoare (`deferred`).
 */

export const OUTBOX_DISPATCH_JOB_ID = 'platform.outbox-dispatch';
/** Trimis (fără date) după o scriere în outbox; trezește dispecerul. */
export const OUTBOX_WRITTEN_EVENT = 'platform/outbox.written';

export interface OutboxDispatchResult {
  schemas: Record<string, DispatchReport>;
  /** Schemele neatinse pentru că bugetul de timp s-a terminat. */
  deferred: string[];
}

export function outboxDispatchJob(options: {
  pool: PoolLike;
  sources: readonly OutboxSource[];
  consumers: ConsumerRegistry;
  catalog?: readonly EventDefinition[];
  /** Cron-ul de siguranță; implicit la 15 minute. */
  cron?: string;
  limit?: number;
  /** Bugetul de timp al unei rulări, în secunde; implicit 40. */
  seconds?: number;
}): JobDefinition {
  return {
    id: OUTBOX_DISPATCH_JOB_ID,
    owner: 'Lot 4.1 / 4.2',
    description: 'Dispecerul outbox: livrează evenimentele care așteaptă',
    trigger: { cron: options.cron ?? '*/15 * * * *' },
    wake: { event: OUTBOX_WRITTEN_EVENT, debounce: '10s', maxWait: '1m' },
    retries: 0,
    async run(): Promise<OutboxDispatchResult> {
      const deadline = Date.now() + (options.seconds ?? 40) * 1000;
      const reports: Record<string, DispatchReport> = {};
      const deferred: string[] = [];
      const failures: { schema: string; error: unknown }[] = [];
      for (const source of options.sources) {
        if (Date.now() >= deadline) {
          deferred.push(source.schema);
          continue;
        }
        try {
          reports[source.schema] = await dispatchOutbox({
            pool: options.pool,
            source,
            registry: options.consumers,
            catalog: options.catalog,
            limit: options.limit,
            deadline,
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
      return { schemas: reports, deferred };
    },
  };
}
