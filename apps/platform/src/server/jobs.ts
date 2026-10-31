import * as Sentry from '@sentry/nextjs';
import { Pool } from 'pg';
import { summarizeError } from '@ventora/errors';
import {
  ConsumerRegistry,
  JobRegistry,
  consoleJobErrorReporter,
  createJobsClient,
  outboxDispatchJob,
  toInngestFunctions,
  type JobErrorReporter,
  type OutboxSource,
  type PoolLike,
} from '@ventora/integrations';
import { safeErrorForSentry } from './report-error';

/*
 * Registrul de job-uri al platformei (Lot 4.2, ARCHITECTURE §11.3). Aici își înregistrează
 * fiecare lot job-urile; ruta comună (`app/api/inngest/route.ts`) nu se schimbă.
 *
 * Job-urile rulează în fundal, nu în codul de request, și nu folosesc `withSystemContext`: un job
 * programat ia organizația din fiecare rând (dispecerul, din plicul evenimentului), iar unul
 * declanșat de eveniment o primește din plic (runJob).
 */

/** Schemele care emit evenimente (outboxMigrationSql): schema și rolul modulului. */
const OUTBOX_SOURCES: readonly OutboxSource[] = [
  { schema: 'organizations', moduleRole: 'org_rw' },
  { schema: 'commercial', moduleRole: 'commercial_rw' },
];

// app_runtime (DATABASE_URL), creat la prima rulare: nu la build și nu în codul de request.
let pool: Pool | undefined;
const jobsPool: PoolLike = {
  connect: () => {
    pool ??= new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 10_000,
    });
    return pool.connect();
  },
};

/** Consumatorii evenimentelor; notificările (4.3) și Growth (F5) se înregistrează aici. */
export const platformConsumers = new ConsumerRegistry();

export const platformJobs = new JobRegistry()
  .register(
    outboxDispatchJob({ pool: jobsPool, sources: OUTBOX_SOURCES, consumers: platformConsumers }),
  )
  // Declarate; logica vine în lotul fiecăruia, cu platformJobs.attach(id, run).
  // Lotul 3.3: attach('platform.quota-reconcile', …) cu reconcilierea pe tabelele reale de cote.
  .register({
    id: 'platform.quota-reconcile',
    owner: 'Lot 3.3',
    description: 'Reconcilierea rezervărilor expirate de cote',
    trigger: { cron: '*/5 * * * *' },
  })
  .register({
    id: 'platform.email-retry',
    owner: 'Lot 4.3',
    description: 'Reîncercarea e-mailurilor eșuate',
    trigger: { cron: '*/10 * * * *' },
  })
  .register({
    id: 'commercial.subscription-renewal',
    owner: 'Lot 3.5',
    description: 'Reînnoirea abonamentelor',
    trigger: { cron: '0 3 * * *' },
  })
  .register({
    id: 'commercial.trial-end',
    owner: 'Lot 3.8',
    description: 'Finalul perioadei de probă',
    trigger: { cron: '0 4 * * *' },
  })
  .register({
    id: 'commercial.invoice-retry',
    owner: 'Lot 3.6',
    description: 'Reîncercarea facturilor SmartBill',
    trigger: { cron: '*/30 * * * *' },
  })
  .register({
    id: 'commercial.price-change-notice',
    owner: 'Lot 3.4',
    description: 'Anunțul de 30 de zile la schimbarea în dezavantajul clientului',
    trigger: { cron: '0 8 * * *' },
  });

/**
 * Eroarea unui job: jurnalul serverului și Sentry (no-op fără SENTRY_DSN), cu job-ul,
 * organizația și correlationId, fără date personale. Job-ul e apoi reîncercat de serviciu.
 */
const reportJobError: JobErrorReporter = (report) => {
  consoleJobErrorReporter(report);
  const summary = summarizeError(report.error);
  Sentry.captureException(safeErrorForSentry(report.error, summary), {
    tags: {
      app: 'platform',
      job: report.jobId,
      retriable: String(report.retriable),
      ...(report.organizationId ? { organizationId: report.organizationId } : {}),
      ...(report.correlationId ? { correlationId: report.correlationId } : {}),
      ...(summary.code ? { code: summary.code } : {}),
    },
    extra: { runId: report.runId, attempt: report.attempt },
  });
};

export const jobsClient = createJobsClient();
export const jobFunctions = toInngestFunctions(jobsClient, platformJobs, reportJobError);
