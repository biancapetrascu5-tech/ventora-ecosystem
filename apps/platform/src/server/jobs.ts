import * as Sentry from '@sentry/nextjs';
import { Pool } from 'pg';
import {
  billingDisputeAlertConsumer,
  billingInvoiceIssuedConsumer,
  billingPaymentFailedConsumer,
  commercialSetupNoticeConsumer,
  commercialTrialEndingConsumer,
  invoiceIssueConsumer,
  runInvoiceIssueJob,
  runStripeReconcileJob,
  runSubscriptionTrialJob,
  runTransferInvoiceJob,
  runTransferOverdueJob,
  transferReceiptConsumer,
} from '@ventora/billing';
import {
  ownerNotifiedConsumer,
  runDunningGraceJob,
  runQuotaReconciliationJob,
  runTrialJob,
} from '@ventora/commercial';
import './billing-config';
import { bookingQuotaRefundConsumer } from '@ventora/booking';
import { growthConversionConsumer, growthSignalConsumer } from '@ventora/growth';
import { summarizeError } from '@ventora/errors';
import { getNotificationContactsInTx } from '@ventora/identity';
import {
  deliverPendingNotifications,
  getEmailChannel,
  type ContactResolver,
} from '@ventora/notifications';
import { invitationNewLinkRequestedConsumer } from '@ventora/organizations';
import {
  freeStoppedQuota,
  runPendingExecutions,
  workflowsTriggerConsumer,
} from '@ventora/workflows';
import {
  runSupportAutoCloseJob,
  supportAutoCloseWarningConsumer,
  supportReplyConsumer,
} from '@ventora/support';
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
  // Lot 4.7: file.uploaded / file.deleted (fără consumator încă: se marchează livrate)
  { schema: 'files', moduleRole: 'files_rw' },
  // Lot 3.5: plățile (billing.payment.succeeded / failed, billing.dispute.opened)
  { schema: 'billing', moduleRole: 'billing_rw' },
  // Lot 4.6: support.reply.posted (Founder) și support.request.auto_close_warning (job-ul)
  { schema: 'support', moduleRole: 'support_rw' },
  // Lot B.1: booking.service.archived (fără consumator încă: se marchează livrat); B.4b:
  // booking.appointment.* (cancelled → rambursarea cotei; restul fără consumator încă)
  { schema: 'booking', moduleRole: 'booking_rw' },
  // Lot CR.2: crm.contact.* / crm.company.* (no consumer yet: delivered)
  { schema: 'crm', moduleRole: 'crm_rw' },
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
  .register(invitationNewLinkRequestedConsumer)
  // Lot 3.5: plata refuzată → owner-ul (S115: payment.pack, payment.renewal, payment.retry)
  .register(billingPaymentFailedConsumer)
  // Lotul 3.6: plata reușită → factura (pending); factura emisă → „Factura … e emisă” (S115);
  // disputa deschisă → e-mail pe FOUNDER_ALERTS_EMAIL
  .register(invoiceIssueConsumer)
  .register(billingInvoiceIssuedConsumer)
  .register(billingDisputeAlertConsumer)
  // Lotul 3.7: „Recomandă” / „Anunță proprietarul” → notificarea owner-ului, în Hub
  .register(ownerNotifiedConsumer)
  // Lotul 4.10: motorul de automatizări — evenimentul unui declanșator → execuția din jurnal
  .register(workflowsTriggerConsumer)
  // Lotul 4.6: „Răspuns nou la solicitarea ta” + E-7; avertizarea cu o zi înainte de închidere
  .register(supportReplyConsumer)
  .register(supportAutoCloseWarningConsumer)
  // Lotul 3.8 (N16): încasarea prin transfer, confirmată în Founder → încasarea în SmartBill
  .register(transferReceiptConsumer)
  // Lotul 3.8: „Perioada de probă se încheie” (S115 trial.ending), implementarea de plătit
  // (setup.accepted) și aplicația pornită (setup.started)
  .register(commercialTrialEndingConsumer)
  .register(commercialSetupNoticeConsumer)
  // Lotul B.4b (legat în B.4c): o programare anulată înainte de început → unitatea
  // booking.appointments înapoi (refundQuota, idempotent: o a doua livrare nu mai dă nimic)
  .register(bookingQuotaRefundConsumer)
  // Lotul 5.7 (FAZA-5): semnalele growthSafe → campaniile automate; conversiile (pachet cumpărat,
  // aplicație pornită, probă pornită) atribuite click-ului din ultimele 7 zile (P24)
  .register(growthSignalConsumer)
  .register(growthConversionConsumer);

/** Un raport de job cu erori → job-ul eșuează (Sentry, reîncercare); restul rămâne făcut. */
function failOnErrors<T extends { errors: Array<{ error: unknown }> }>(
  label: string,
  report: T,
): T {
  if (report.errors.length) {
    throw new AggregateError(
      report.errors.map((e) => e.error),
      `[${label}] ${report.errors.length} not handled`,
    );
  }
  return report;
}

/*
 * Lot 4.5: notificările Fazei 3 (S115) se trimit cu un singur apel, notifyBillingInTx
 * (core/organizations): varianta owner-ului, în aplicație și pe e-mail, și, la limite și la doar
 * citire, varianta pentru ceilalți membri, în aplicație. Consumatorii evenimentelor F3
 * (commercial.quota.threshold, subscription.version_change_scheduled, plățile, facturile, proba)
 * se înregistrează în loturile F3 care au datele textelor: evenimentele au doar id-uri și cifre,
 * iar textele cer numele resursei și al pachetului, data resetării, sumele și numele owner-ului
 * (Loturile 3.4, 3.5, 3.6, 3.7, 3.8). Până atunci evenimentele se marchează livrate fără
 * consumator (withoutConsumer: 'complete'). Lotul 3.5: plata refuzată (billingPaymentFailedConsumer).
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
  // Lotul 3.5 (D3-4 a): reînnoirea o face Stripe Billing; job-ul aduce abonamentul Stripe al
  // fiecărei afaceri cu card la modelul comercial (liniile, reducerile, anularea făcute din
  // Founder) și activează cumpărările plătite rămase neactivate. Fiecare afacere în contextul ei.
  .register({
    id: 'billing.stripe-reconcile',
    owner: 'Lot 3.5',
    description: 'Abonamentele Stripe aliniate la modelul comercial',
    trigger: { cron: '*/15 * * * *' },
    run: async () => {
      const report = await runStripeReconcileJob();
      if (report.failed.length) {
        // job-ul eșuează (jurnal + Sentry, reîncercare); afacerile reușite rămân făcute
        throw new AggregateError(
          report.failed.map((f) => f.error),
          `[billing] ${report.failed.length} of ${report.checked} businesses not reconciled: ` +
            report.failed.map((f) => f.organizationId).join(', '),
        );
      }
      return report;
    },
  })
  // Lotul 4.10: execuțiile automatizărilor (fiecare în contextul afacerii ei) și unitățile din
  // workflows.active rămase neeliberate după o oprire (D-WF-4). O execuție a cărei tranzacție
  // eșuează rămâne în așteptare; job-ul eșuează (Sentry, reîncercare), celelalte rămân făcute.
  .register({
    id: 'workflows.run',
    owner: 'Lot 4.10',
    description: 'Execuțiile automatizărilor și eliberarea cotei după oprire',
    trigger: { cron: '* * * * *' },
    run: async () => {
      const runs = await runPendingExecutions();
      const freed = await freeStoppedQuota();
      const errors = [...runs.errors, ...freed.errors];
      if (errors.length) {
        throw new AggregateError(
          errors.map((e) => e.error),
          `[workflows] ${errors.length} not handled: ` +
            errors.map((e) => ('executionId' in e ? e.executionId : e.activationId)).join(', '),
        );
      }
      return { ...runs, errors: 0, freed: freed.freed };
    },
  })
  // Lotul 4.6 (S116-D18): o solicitare fără răspuns de la afacere 7 zile după răspunsul echipei
  // se închide singură; cu o zi înainte, persoana primește avertizarea (outbox → notificarea).
  // Fiecare solicitare în contextul afacerii ei; una care eșuează nu le oprește pe celelalte.
  .register({
    id: 'support.auto-close',
    owner: 'Lot 4.6',
    description: 'Închiderea automată a solicitărilor de suport (7 zile) și avertizarea',
    trigger: { cron: '*/15 * * * *' },
    run: async () => {
      const report = await runSupportAutoCloseJob();
      if (report.failed.length) {
        throw new AggregateError(
          report.failed.map((f) => f.error),
          `[support] ${report.failed.length} requests not handled: ` +
            report.failed.map((f) => f.requestId).join(', '),
        );
      }
      return report;
    },
  })
  // Declarate; logica vine în lotul fiecăruia, cu platformJobs.attach(id, run).
  // Lotul 3.8 (D3-5): proba unei aplicații se încheie la termen (datele rămân), cu reminderul cu
  // 3 zile înainte (commercial.trial.ending); proba pe tot abonamentul (N4): activ cu card sau
  // transfer, altfel doar citire. Din oră în oră, ca termenul (now() + 14 zile) să nu aștepte o zi.
  .register({
    id: 'commercial.trial-end',
    owner: 'Lot 3.8',
    description: 'Finalul perioadei de probă',
    trigger: { cron: '7 * * * *' },
    run: async () => {
      const apps = failOnErrors('commercial.trial', await runTrialJob());
      const subs = failOnErrors('billing.subscription-trial', await runSubscriptionTrialJob());
      return { ...apps, errors: 0, subscriptions: { ...subs, errors: 0 } };
    },
  })
  // Lotul 3.8 (D3-12): după cele 14 zile de grație, afacerea trece pe doar citire și export.
  .register({
    id: 'commercial.dunning-grace',
    owner: 'Lot 3.8',
    description: 'Neplata: doar citire după perioada de grație',
    trigger: { cron: '17 * * * *' },
    run: async () => ({
      ...failOnErrors('commercial.dunning', await runDunningGraceJob()),
      errors: 0,
    }),
  })
  // Lotul 3.8 (D3-11): factura de transfer a fiecărei perioade (emisă întâi, cu scadența), apoi
  // restanța: factura emisă, neîncasată după scadență → cazul de neplată. Zilnic, dimineața.
  .register({
    id: 'billing.transfer-invoices',
    owner: 'Lot 3.8',
    description: 'Facturile de transfer și restanțele',
    trigger: { cron: '0 6 * * *' },
    run: async () => {
      const invoices = await runTransferInvoiceJob();
      const overdue = await runTransferOverdueJob();
      const errors = [...invoices.errors, ...overdue.errors];
      if (errors.length) {
        throw new AggregateError(
          errors.map((e) => e.error),
          `[billing] ${errors.length} transfer invoices not handled`,
        );
      }
      return { invoices: invoices.created, overdue: overdue.opened };
    },
  })
  // Lotul 3.6: emiterea facturilor SmartBill și reîncercarea lor, în fiecare minut (prima emitere
  // vine imediat după dispecer, care scrie factura pending); fiecare factură în contextul afacerii
  // ei, una câte una (SmartBill: 30 de apeluri / 10 s). O factură care aruncă face job-ul să eșueze
  // (Sentry, reîncercare); cele refuzate sau incerte trec în failed și apar în Founder.
  .register({
    id: 'commercial.invoice-retry',
    owner: 'Lot 3.6',
    description: 'Emiterea și reîncercarea facturilor SmartBill',
    trigger: { cron: '* * * * *' },
    run: async () => {
      const report = await runInvoiceIssueJob();
      if (report.errors.length) {
        throw new AggregateError(
          report.errors.map((e) => e.error),
          `[billing] ${report.errors.length} of ${report.due} invoices not handled: ` +
            report.errors.map((e) => e.invoiceId).join(', '),
        );
      }
      return report;
    },
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
