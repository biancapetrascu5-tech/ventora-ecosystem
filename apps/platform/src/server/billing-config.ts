import * as Sentry from '@sentry/nextjs';
import { setBillingErrorReporter, setInvoiceApplicationNames } from '@ventora/billing';
import { APPS } from '@ventora/ui/apps';
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

/* Lotul 3.6: numele aplicației pe factură și în e-mailul ei („EasyBook · noiembrie”), din același
   loc ca în Hub; id-ul rămâne când aplicația nu are nume. Furnizorul de facturi (SmartBill) se
   ia din mediu (SMARTBILL_*), în core/billing; fără el, facturile rămân pending. */
setInvoiceApplicationNames((id) => APPS[id]?.name ?? id);
