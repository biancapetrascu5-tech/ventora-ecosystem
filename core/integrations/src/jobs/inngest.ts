import { Inngest, NonRetriableError } from 'inngest';
import type { JobRegistry } from './registry';
import {
  consoleJobErrorReporter,
  InvalidJobEnvelopeError,
  runJob,
  type JobErrorReporter,
} from './run-job';

/*
 * Adaptorul pentru Inngest (D4-3 = a). Singurul fișier care știe de serviciu: registrul și job-urile
 * nu depind de el. Ruta comună (`app/api/inngest/route.ts`) servește funcțiile construite de aici
 * din registrul aplicației; un job nou intră în registru, nu în rută.
 *
 * Cheile (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) stau doar în `.env.local` și Vercel; SDK-ul
 * le citește din mediu. Local, fără cont: serverul de dezvoltare (CLI-ul `inngest-cli dev`), în
 * care intră clientul când nu rulează în producție.
 */

export const JOBS_APP_ID = 'ventora-platform';

export function createJobsClient(options: { isDev?: boolean } = {}): Inngest {
  return new Inngest({
    id: JOBS_APP_ID,
    isDev: options.isDev ?? process.env.NODE_ENV !== 'production',
  });
}

/** Funcțiile Inngest pentru job-urile cu logică din registru (cele doar declarate nu se servesc). */
export function toInngestFunctions(
  client: Inngest,
  registry: JobRegistry,
  report: JobErrorReporter = consoleJobErrorReporter,
) {
  return registry.runnable().map((job) =>
    client.createFunction(
      {
        id: job.id,
        name: job.description,
        retries: (job.retries ?? 3) as 3,
        triggers: [
          'cron' in job.trigger ? { cron: job.trigger.cron } : { event: job.trigger.event },
        ],
      },
      async ({ event, runId, attempt }) => {
        try {
          return await runJob(job, { event, runId, attempt }, report);
        } catch (err) {
          // a broken envelope is final: no retries (it was already reported by runJob)
          if (err instanceof InvalidJobEnvelopeError) throw new NonRetriableError(err.message);
          throw err;
        }
      },
    ),
  );
}
