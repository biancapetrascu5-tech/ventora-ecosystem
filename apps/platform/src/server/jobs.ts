import * as Sentry from '@sentry/nextjs';
import { Pool } from 'pg';
import { runQuotaReconciliationJob } from '@ventora/commercial';
import { summarizeError } from '@ventora/errors';
import { getNotificationContactsInTx } from '@ventora/identity';
import {
  deliverPendingNotifications,
  getEmailChannel,
  type ContactResolver,
} from '@ventora/notifications';
import { invitationNewLinkRequestedConsumer } from '@ventora/organizations';
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
export const platformConsumers = new ConsumerRegistry()
  // Lot 4.3: primul consumator real (ARCHITECTURE §15.1), notificarea în Hub pentru owner și admini
  .register(invitationNewLinkRequestedConsumer);

/*
 * Lot 4.5: notificările Fazei 3 (S115) se trimit cu un singur apel, notifyBillingInTx
 * (core/organizations): varianta owner-ului, în aplicație și pe e-mail, și, la limite și la doar
 * citire, varianta pentru ceilalți membri, în aplicație. Consumatorii evenimentelor F3
 * (commercial.quota.threshold, subscription.version_change_scheduled, plățile, facturile, proba)
 * se înregistrează în loturile F3 care au datele textelor: evenimentele au doar id-uri și cifre,
 * iar textele cer numele resursei și al pachetului, data resetării, sumele și numele owner-ului
 * (Loturile 3.4, 3.5, 3.6, 3.7, 3.8). Până atunci evenimentele se marchează livrate fără
 * consumator (withoutConsumer: 'complete').
 */

// Datele de contact și limba destinatarului, din identity (în tranzacția job-ului de livrare).
const notificationContacts: ContactResolver = (tx, userIds) =>
  getNotificationContactsInTx(
    {
      query: async (sql, params) => (await tx.query(sql, params)).rows as Record<string, unknown>[],
      exec: async (sql) => {
        await tx.query(sql);
      },
    },
    userIds,
  );

export const platformJobs = new JobRegistry()
  .register(
    outboxDispatchJob({ pool: jobsPool, sources: OUTBOX_SOURCES, consumers: platformConsumers }),
  )
  // Lotul 3.3: rezervările rămase după 15 minute, fiecare în contextul organizației din rândul ei
  // (ARCHITECTURE §8.3); o rezervare nereconciliată face job-ul să eșueze (Sentry, reîncercare).
  .register({
    id: 'platform.quota-reconcile',
    owner: 'Lot 3.3',
    description: 'Reconcilierea rezervărilor expirate de cote',
    trigger: { cron: '*/5 * * * *' },
    run: () => runQuotaReconciliationJob(),
  })
  // Lotul 4.3: livrarea notificărilor pe e-mail, cu reîncercări (1 și 5 minute), apoi „failed”;
  // fiecare livrare în contextul destinatarului, în limba lui (D4-8).
  .register({
    id: 'platform.notification-delivery',
    owner: 'Lot 4.3',
    description: 'Livrarea notificărilor (e-mail), cu reîncercări',
    trigger: { cron: '* * * * *' },
    run: () =>
      deliverPendingNotifications({
        pool: jobsPool,
        contacts: notificationContacts,
        channels: { email: getEmailChannel() },
      }),
  })
  // Declarate; logica vine în lotul fiecăruia, cu platformJobs.attach(id, run).
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
