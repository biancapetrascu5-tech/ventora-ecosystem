import * as Sentry from '@sentry/nextjs';
import { setBillingErrorReporter } from '@ventora/billing';
import { summarizeError } from '@ventora/errors';
import { safeErrorForSentry } from './report-error';

/* Lotul 3.5: o eroare după o plată care nu o poate anula (linia Stripe a unei cumpărări deja
   plătite și active) ajunge în jurnal și în Sentry; job-ul billing.stripe-reconcile o reia. */
setBillingErrorReporter((where, error, context) => {
  const summary = summarizeError(error);
  console.error(`[platform] billing ${where}`, { ...summary, ...context });
  Sentry.captureException(safeErrorForSentry(error, summary), {
    tags: {
      app: 'platform',
      area: 'billing',
      where,
      organizationId: context.organizationId,
      ...(summary.code ? { code: summary.code } : {}),
    },
    extra: { purchaseId: context.purchaseId },
  });
});
