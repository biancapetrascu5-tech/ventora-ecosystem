import { Inngest, NonRetriableError } from 'inngest';
import { isCron, type JobDefinition, type JobRegistry } from './registry';
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

type Env = Readonly<Record<string, string | undefined>>;

/** `platform.outbox-dispatch` → `JOB_CRON_PLATFORM_OUTBOX_DISPATCH`. */
export const cronEnvName = (jobId: string): string =>
  `JOB_CRON_${jobId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/**
 * Programul unui job, din mediu (Inngest îl citește la sincronizare, deci o schimbare cere un
 * redeploy): `JOB_CRON_<ID>` întâi; apoi, cu `JOBS_SCHEDULE=quiet` (staging, contul Hobby),
 * programul mai rar al job-ului; altfel cel din registru. Un `JOB_CRON_<ID>` invalid se ignoră
 * (cu un mesaj în jurnal): o greșeală de configurare nu oprește ruta tuturor job-urilor.
 */
export function cronFor(job: Pick<JobDefinition, 'id' | 'trigger'>, env: Env = process.env) {
  if (!('cron' in job.trigger)) return null;
  const name = cronEnvName(job.id);
  const override = env[name]?.trim();
  if (override) {
    if (isCron(override)) return override;
    console.error(`[integrations] ${name} ignorat: nu e o expresie cron („${override}”)`);
  }
  if (env.JOBS_SCHEDULE === 'quiet' && job.trigger.quietCron) return job.trigger.quietCron;
  return job.trigger.cron;
}

/**
 * Funcțiile Inngest pentru job-urile cu logică din registru (cele doar declarate nu se servesc).
 * Un job cu `wake` primește încă o funcție, `<id>.wake`, la evenimentul lui, cu debounce și fără
 * reîncercări (cron-ul e plasa de siguranță); rulează aceeași logică, fără organizație.
 */
export function toInngestFunctions(
  client: Inngest,
  registry: JobRegistry,
  report: JobErrorReporter = consoleJobErrorReporter,
  env: Env = process.env,
) {
  return registry.runnable().flatMap((job) => {
    const cron = cronFor(job, env);
    const main = client.createFunction(
      {
        id: job.id,
        name: job.description,
        retries: (job.retries ?? 3) as 3,
        triggers: [cron !== null ? { cron } : { event: (job.trigger as { event: string }).event }],
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
    );
    if (!job.wake || cron === null) return [main];
    const wake = client.createFunction(
      {
        id: `${job.id}.wake`,
        name: `${job.description} (la eveniment)`,
        retries: 0,
        debounce: { period: job.wake.debounce, timeout: job.wake.maxWait },
        triggers: [{ event: job.wake.event }],
      },
      // the same logic as the scheduled run: no envelope, no organization (cron context)
      async ({ runId, attempt }) =>
        runJob({ ...job, trigger: { cron } }, { event: null, runId, attempt }, report),
    );
    return [main, wake];
  });
}
