import { onOutboxWritten } from '@ventora/db-kit';
import { OUTBOX_WRITTEN_EVENT } from './outbox-job';

/*
 * Lotul Inngest (13.11): trezirea dispecerului după o scriere în outbox. Aplicația care are cheia
 * de evenimente (platform) o pornește o dată, la start (instrumentation). Cel mult o trimitere la
 * `minIntervalMs` pe proces: o rafală de scrieri dă un singur eveniment, iar Inngest le adună și
 * el (debounce de 10 s pe funcția `platform.outbox-dispatch.wake`). Trimiterea nu e așteptată și
 * nu poate strica scrierea; o trezire pierdută o acoperă cron-ul de siguranță (15 minute).
 */
export function wakeDispatcherOnOutboxWrite(
  send: (event: { name: string; data: Record<string, never> }) => Promise<unknown>,
  options: { minIntervalMs?: number; now?: () => number; log?: (message: string) => void } = {},
): () => void {
  const minIntervalMs = options.minIntervalMs ?? 5_000;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((m: string) => console.error(m));
  let last = -Infinity;
  let warned = false;
  onOutboxWritten(() => {
    const t = now();
    if (t - last < minIntervalMs) return;
    last = t;
    send({ name: OUTBOX_WRITTEN_EVENT, data: {} }).catch((err: unknown) => {
      // once per process: without the events service the safety cron still delivers
      if (warned) return;
      warned = true;
      log(
        `[integrations] outbox wake-up not sent (${err instanceof Error ? err.message : String(err)}); ` +
          'the safety cron delivers the events',
      );
    });
  });
  return () => onOutboxWritten(null);
}
