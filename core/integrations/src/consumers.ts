import type { OutboxEnvelope, OutboxSqlClient } from '@ventora/db-kit';

/*
 * Consumatorii evenimentelor (Lot 4.1). Un consumator are un nume stabil (cheia lui în
 * `processed_events`), lista evenimentelor pe care le ascultă (tip + versiune) și `handle`.
 *
 * `handle` primește clientul tranzacției deschise de dispecer, deja în contextul organizației
 * din plic (rolul modulului emițător, `app.organization_id`). Efectul lui și rândul din
 * `processed_events` se scriu împreună: o livrare repetată nu repetă efectul. Un consumator care
 * scrie în schema altui modul își schimbă rolul cu `SET LOCAL ROLE <rolul lui>` (organizația
 * rămâne aceeași); dispecerul revine apoi la rolul emițătorului.
 */
export interface OutboxConsumer {
  name: string;
  handles: readonly { type: string; version: number }[];
  handle(envelope: OutboxEnvelope, tx: OutboxSqlClient): Promise<void>;
}

const NAME = /^[a-z][a-z0-9_.-]{1,127}$/;

export class ConsumerRegistry {
  private readonly consumers: OutboxConsumer[] = [];

  register(consumer: OutboxConsumer): this {
    if (!NAME.test(consumer.name)) {
      throw new Error(`[integrations] Nume de consumator invalid: "${consumer.name}"`);
    }
    if (this.consumers.some((c) => c.name === consumer.name)) {
      throw new Error(`[integrations] Consumator înregistrat de două ori: "${consumer.name}"`);
    }
    this.consumers.push(consumer);
    return this;
  }

  /** Consumatorii unui eveniment, în ordinea înregistrării. */
  consumersFor(type: string, version: number): OutboxConsumer[] {
    return this.consumers.filter((c) =>
      c.handles.some((h) => h.type === type && h.version === version),
    );
  }
}
