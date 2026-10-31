import { describe, expect, it, vi } from 'vitest';
import { NonRetriableError } from 'inngest';
import {
  createJobsClient,
  InvalidJobEnvelopeError,
  jobContext,
  JobRegistry,
  runJob,
  toInngestFunctions,
  type JobDefinition,
  type JobErrorReport,
} from '../index';

const ORG = '0193a4b0-7c1e-7b3a-9f00-1234567890ab';

const cronJob = (over: Partial<JobDefinition> = {}): JobDefinition => ({
  id: 'platform.test-cron',
  owner: 'Lot 4.2',
  description: 'test',
  trigger: { cron: '* * * * *' },
  run: async () => 'ok',
  ...over,
});
const eventJob = (over: Partial<JobDefinition> = {}): JobDefinition => ({
  id: 'platform.test-event',
  owner: 'Lot 4.2',
  description: 'test',
  trigger: { event: 'platform/widget.created' },
  run: async (ctx) => ctx.organizationId,
  ...over,
});

describe('JobRegistry', () => {
  it('validates the id, the trigger and retries, and refuses duplicates', () => {
    const r = new JobRegistry().register(cronJob());
    expect(() => r.register(cronJob())).toThrow(/două ori/);
    expect(() => new JobRegistry().register(cronJob({ id: 'NoDomain' }))).toThrow(/Id de job/);
    expect(() =>
      new JobRegistry().register(cronJob({ trigger: { cron: 'every minute' } })),
    ).toThrow(/Cron invalid/);
    expect(() =>
      new JobRegistry().register(eventJob({ trigger: { event: 'widget.created' } })),
    ).toThrow(/Eveniment invalid/);
    expect(() => new JobRegistry().register(cronJob({ retries: 21 }))).toThrow(/retries/);
  });

  it('a declared job is not runnable until its lot attaches the logic', () => {
    const r = new JobRegistry().register(cronJob({ id: 'commercial.trial-end', run: undefined }));
    expect(r.runnable()).toHaveLength(0);
    expect(r.declaredOnly().map((j) => j.id)).toEqual(['commercial.trial-end']);
    r.attach('commercial.trial-end', async () => 1);
    expect(r.runnable().map((j) => j.id)).toEqual(['commercial.trial-end']);
    expect(() => r.attach('commercial.trial-end', async () => 2)).toThrow(/deja logică/);
    expect(() => r.attach('commercial.unknown', async () => 2)).toThrow(/necunoscut/);
  });
});

describe('jobContext / runJob: the tenant comes from the envelope', () => {
  it('a scheduled job has no organization', () => {
    expect(jobContext(cronJob(), { runId: 'r1', attempt: 0 })).toEqual({
      jobId: 'platform.test-cron',
      runId: 'r1',
      attempt: 0,
      organizationId: null,
      correlationId: null,
      data: null,
    });
  });

  it('an event job gets organizationId and correlationId from the envelope', async () => {
    const event = { data: { organizationId: ORG, correlationId: 'req-1', resourceId: 'x' } };
    const ctx = jobContext(eventJob(), { event, runId: 'r2', attempt: 1 });
    expect(ctx).toMatchObject({ organizationId: ORG, correlationId: 'req-1', attempt: 1 });
    expect(Object.isFrozen(ctx.data)).toBe(true);
    const job = eventJob() as JobDefinition & { run: NonNullable<JobDefinition['run']> };
    await expect(runJob(job, { event, runId: 'r2', attempt: 1 }, () => {})).resolves.toBe(ORG);
  });

  it('an envelope without a valid organizationId is refused, reported as not retriable', async () => {
    const reports: JobErrorReport[] = [];
    const job = eventJob() as JobDefinition & { run: NonNullable<JobDefinition['run']> };
    for (const data of [undefined, { organizationId: 'not-a-uuid' }, ['x']]) {
      await expect(
        runJob(job, { event: { data }, runId: 'r3', attempt: 0 }, (r) => reports.push(r)),
      ).rejects.toBeInstanceOf(InvalidJobEnvelopeError);
    }
    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.retriable === false)).toBe(true);
  });

  it('an error is reported with job, organization and correlationId, then thrown again', async () => {
    const report = vi.fn();
    const boom = new Error('provider down');
    const job = eventJob({
      run: async () => {
        throw boom;
      },
    }) as JobDefinition & { run: NonNullable<JobDefinition['run']> };
    const event = { data: { organizationId: ORG, correlationId: 'req-9' } };
    await expect(runJob(job, { event, runId: 'r4', attempt: 2 }, report)).rejects.toBe(boom);
    expect(report).toHaveBeenCalledWith({
      jobId: 'platform.test-event',
      runId: 'r4',
      attempt: 2,
      organizationId: ORG,
      correlationId: 'req-9',
      error: boom,
      retriable: true,
    });
  });
});

describe('toInngestFunctions: the shared route serves whatever the registry holds', () => {
  const client = createJobsClient({ isDev: true });

  it('only runnable jobs, with their trigger and the retry rule (default 3)', () => {
    const r = new JobRegistry()
      .register(cronJob())
      .register(eventJob({ retries: 5 }))
      .register(cronJob({ id: 'commercial.invoice-retry', run: undefined }));
    const fns = toInngestFunctions(client, r, () => {});
    expect(fns.map((f) => f.id())).toEqual(['platform.test-cron', 'platform.test-event']);
    expect(fns[0]!.opts).toMatchObject({ retries: 3, triggers: [{ cron: '* * * * *' }] });
    expect(fns[1]!.opts).toMatchObject({
      retries: 5,
      triggers: [{ event: 'platform/widget.created' }],
    });
  });

  it('a job registered by another lot is served without any change to the route', () => {
    const r = new JobRegistry().register(cronJob());
    const before = toInngestFunctions(client, r, () => {}).map((f) => f.id());
    // another lot, in its own folder, registers its job in the same registry
    r.register(cronJob({ id: 'commercial.subscription-renewal', trigger: { cron: '0 3 * * *' } }));
    const after = toInngestFunctions(client, r, () => {}).map((f) => f.id());
    expect(before).toEqual(['platform.test-cron']);
    expect(after).toEqual(['platform.test-cron', 'commercial.subscription-renewal']);
  });

  it('the Inngest handler runs the job; a broken envelope becomes NonRetriableError', async () => {
    const report = vi.fn();
    const r = new JobRegistry().register(eventJob());
    const [fn] = toInngestFunctions(client, r, report);
    const handler = (fn as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn;
    await expect(
      handler({ event: { data: { organizationId: ORG } }, runId: 'r5', attempt: 0 }),
    ).resolves.toBe(ORG);
    await expect(handler({ event: { data: {} }, runId: 'r6', attempt: 0 })).rejects.toBeInstanceOf(
      NonRetriableError,
    );
    expect(report).toHaveBeenCalledTimes(1);
  });
});
