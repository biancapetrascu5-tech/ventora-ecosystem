import { summarizeError } from '@ventora/errors';
import type { JobDefinition, JobRun, JobRunContext } from './registry';

/*
 * Rularea unui job, independentă de serviciul de job-uri (testabilă fără Inngest).
 *
 * - **Contextul de tenant vine din plic.** Un job declanșat de eveniment primește plicul §11.2 ca
 *   date; `organizationId` (UUID) e obligatoriu. Fără el, rularea e refuzată fără reîncercări: un
 *   plic greșit nu se repară singur. Un job programat (cron) nu are organizație; ia organizația
 *   din fiecare rând pe care îl procesează. Niciun job nu folosește `withSystemContext`.
 * - **Erorile nu se înghit.** O eroare ajunge la raportor (Sentry în aplicație, cu `jobId`,
 *   `organizationId`, `correlationId`), apoi e aruncată mai departe, ca serviciul să reîncerce
 *   după regula lui (`retries`).
 */

export interface JobErrorReport {
  jobId: string;
  runId: string;
  attempt: number;
  organizationId: string | null;
  correlationId: string | null;
  error: unknown;
  /** false: plic invalid, nu se mai reîncearcă. */
  retriable: boolean;
}

export type JobErrorReporter = (report: JobErrorReport) => void;

/** Plic invalid pentru un job de eveniment: nu se reîncearcă (serviciul îl tratează ca final). */
export class InvalidJobEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJobEnvelopeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jobContext(
  job: Pick<JobDefinition, 'id' | 'trigger'>,
  input: { event?: { data?: unknown } | null; runId: string; attempt: number },
): JobRunContext {
  const base = { jobId: job.id, runId: input.runId, attempt: input.attempt };
  if ('cron' in job.trigger) {
    return { ...base, organizationId: null, correlationId: null, data: null };
  }
  const data = input.event?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new InvalidJobEnvelopeError(`[integrations] ${job.id}: evenimentul nu are plic`);
  }
  const envelope = data as Record<string, unknown>;
  const organizationId = envelope.organizationId;
  if (typeof organizationId !== 'string' || !UUID.test(organizationId)) {
    throw new InvalidJobEnvelopeError(`[integrations] ${job.id}: plicul nu are organizationId`);
  }
  const correlationId =
    typeof envelope.correlationId === 'string' && envelope.correlationId.length > 0
      ? envelope.correlationId
      : null;
  return { ...base, organizationId, correlationId, data: Object.freeze({ ...envelope }) };
}

export async function runJob(
  job: Pick<JobDefinition, 'id' | 'trigger'> & { run: JobRun },
  input: { event?: { data?: unknown } | null; runId: string; attempt: number },
  report: JobErrorReporter,
): Promise<unknown> {
  let ctx: JobRunContext | null = null;
  try {
    ctx = jobContext(job, input);
    return await job.run(ctx);
  } catch (error) {
    const data = input.event?.data as { organizationId?: unknown; correlationId?: unknown } | null;
    report({
      jobId: job.id,
      runId: input.runId,
      attempt: input.attempt,
      organizationId:
        ctx?.organizationId ??
        (typeof data?.organizationId === 'string' ? data.organizationId : null),
      correlationId:
        ctx?.correlationId ?? (typeof data?.correlationId === 'string' ? data.correlationId : null),
      error,
      retriable: !(error instanceof InvalidJobEnvelopeError),
    });
    throw error;
  }
}

/**
 * Raportorul implicit, până îl înlocuiește aplicația (Sentry): doar jurnalul serverului, fără
 * date personale (clasa, codul și mesajul cu adresele mascate, summarizeError).
 */
export const consoleJobErrorReporter: JobErrorReporter = (r) => {
  console.error(`[jobs] ${r.jobId} failed`, {
    runId: r.runId,
    attempt: r.attempt,
    organizationId: r.organizationId,
    correlationId: r.correlationId,
    retriable: r.retriable,
    error: summarizeError(r.error),
  });
};
