/*
 * Lot 3.5 — an error after a payment that must not undo it (the Stripe line of a purchase already
 * paid and active): reported, then retried by the platform job (`billing.stripe-reconcile`). The
 * platform sets the reporter (log + Sentry); the default is the server log. Never swallowed.
 */

export type BillingErrorReporter = (
  where: string,
  error: unknown,
  context: { organizationId: string; purchaseId?: string },
) => void;

let reporter: BillingErrorReporter = (where, error, context) => {
  console.error(`[billing] ${where}`, {
    ...context,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
};

export function setBillingErrorReporter(next: BillingErrorReporter): void {
  reporter = next;
}

export function reportBillingError(
  where: string,
  error: unknown,
  context: { organizationId: string; purchaseId?: string },
): void {
  reporter(where, error, context);
}
