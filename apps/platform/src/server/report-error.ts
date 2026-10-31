import * as Sentry from '@sentry/nextjs';
import { summarizeError, type ErrorSummary } from '@ventora/errors';

/** A copy of the error for Sentry: the masked message, and the frames of the original stack. */
export function safeErrorForSentry(
  err: unknown,
  summary: ErrorSummary = summarizeError(err),
): Error {
  const safe = new Error(summary.message);
  safe.name = summary.name;
  if (err instanceof Error && err.stack) {
    // the frames only: the original first line repeats the unmasked message
    safe.stack = [`${summary.name}: ${summary.message}`, ...err.stack.split('\n').slice(1)].join(
      '\n',
    );
  }
  return safe;
}

/* The server actions turn exceptions into plain results for the screens. Before that, the cause
   goes to the server log, and an unexpected one also to Sentry (a no-op while SENTRY_DSN is not
   set). Without personal data: class, code and message with addresses masked (summarizeError).
   Expected refusals (4xx: wrong code, no right) are only a warning. */
export function reportActionError(
  action: string,
  err: unknown,
  opts: { quietIfExpected?: boolean } = {},
): void {
  const summary = summarizeError(err);
  if (summary.expected) {
    if (!opts.quietIfExpected) console.warn(`[platform] ${action} refused`, summary);
    return;
  }
  console.error(`[platform] ${action} failed`, summary);
  Sentry.captureException(safeErrorForSentry(err, summary), {
    tags: { app: 'platform', action, ...(summary.code ? { code: summary.code } : {}) },
  });
}
