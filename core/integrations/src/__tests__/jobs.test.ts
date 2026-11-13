import { describe, expect, it, vi } from 'vitest';
import { NonRetriableError } from 'inngest';
import { writeOutboxEvent } from '@ventora/db-kit';
import {
  createJobsClient,
  cronEnvName,
  cronFor,
  InvalidJobEnvelopeError,
  jobContext,
  JobRegistry,
  runJob,
  toInngestFunctions,
  wakeDispatcherOnOutboxWrite,
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

describe('the schedule from the environment (lotul Inngest, 13.11)', () => {
  const job = cronJob({ trigger: { cron: '* * * * *', quietCron: '*/10 * * * *' } });

  it('JOB_CRON_<ID> first, then JOBS_SCHEDULE=quiet, then the registry', () => {
    expect(cronEnvName('platform.notification-delivery')).toBe(
      'JOB_CRON_PLATFORM_NOTIFICATION_DELIVERY',
    );
    expect(cronFor(job, {})).toBe('* * * * *');
    expect(cronFor(job, { JOBS_SCHEDULE: 'quiet' })).toBe('*/10 * * * *');
    expect(cronFor(job, { JOBS_SCHEDULE: 'quiet', JOB_CRON_PLATFORM_TEST_CRON: '0 * * * *' })).toBe(
      '0 * * * *',
    );
    // without a quiet schedule, quiet keeps the registry's
    expect(cronFor(cronJob(), { JOBS_SCHEDULE: 'quiet' })).toBe('* * * * *');
    expect(cronFor(eventJob(), { JOBS_SCHEDULE: 'quiet' })).toBeNull();
  });

  it('an invalid JOB_CRON_<ID> is ignored (logged), the route keeps serving', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cronFor(job, { JOB_CRON_PLATFORM_TEST_CRON: 'every minute' })).toBe('* * * * *');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('JOB_CRON_PLATFORM_TEST_CRON'));
    error.mockRestore();
  });

  it('the served function uses the resolved schedule; the registry checks quietCron and wake', () => {
    const client = createJobsClient({ isDev: true });
    const r = new JobRegistry().register(job);
    const [fn] = toInngestFunctions(client, r, () => {}, { JOBS_SCHEDULE: 'quiet' });
    expect(fn!.opts).toMatchObject({ triggers: [{ cron: '*/10 * * * *' }] });
    expect(() =>
      new JobRegistry().register(cronJob({ trigger: { cron: '* * * * *', quietCron: 'often' } })),
    ).toThrow(/Cron invalid/);
    expect(() =>
      new JobRegistry().register(
        eventJob({ wake: { event: 'platform/outbox.written', debounce: '10s', maxWait: '1m' } }),
      ),
    ).toThrow(/doar pentru un job programat/);
    expect(() =>
      new JobRegistry().register(
        cronJob({ wake: { event: 'not an event', debounce: '10s', maxWait: '1m' } }),
      ),
    ).toThrow(/Eveniment invalid/);
  });

  it('the wake-up function runs the same logic as the cron, without an organization', async () => {
    const run = vi.fn(async (ctx: { organizationId: string | null }) => ctx.organizationId);
    const r = new JobRegistry().register(
      cronJob({ run, wake: { event: 'platform/outbox.written', debounce: '10s', maxWait: '1m' } }),
    );
    const fns = toInngestFunctions(createJobsClient({ isDev: true }), r, () => {}, {});
    expect(fns.map((f) => f.id())).toEqual(['platform.test-cron', 'platform.test-cron.wake']);
    const handler = (fns[1] as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn;
    await expect(handler({ event: { data: {} }, runId: 'w1', attempt: 0 })).resolves.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the dispatcher wake-up after an outbox write', () => {
  const Widget = { type: 'widget.shipped', version: 1, parse: (p: unknown) => p };
  const tx = { query: vi.fn(async () => ({})) };
  const write = () =>
    writeOutboxEvent(tx, 'jobs_wake', Widget, {
      organizationId: '0193a4b0-7c1e-7b3a-9f00-1234567890ab',
      sourceApp: 'test',
      resourceId: '0193a4b0-7c1e-7b3a-9f00-1234567890ac',
      payload: {},
    });

  it('a burst of writes sends one event; the next one after the interval', async () => {
    let t = 1_000;
    const send = vi.fn(async () => {});
    const stop = wakeDispatcherOnOutboxWrite(send, { minIntervalMs: 5_000, now: () => t });
    try {
      await write();
      await write();
      t += 4_999;
      await write();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({ name: 'platform/outbox.written', data: {} });
      t += 1;
      await write();
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
    await write();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a failed send never breaks the write; logged once', async () => {
    let t = 0;
    const log = vi.fn();
    const stop = wakeDispatcherOnOutboxWrite(async () => Promise.reject(new Error('no service')), {
      minIntervalMs: 1,
      now: () => (t += 10),
      log,
    });
    try {
      await expect(write()).resolves.toMatchObject({ type: 'widget.shipped' });
      await expect(write()).resolves.toMatchObject({ type: 'widget.shipped' });
      await new Promise((r) => setTimeout(r, 0));
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]![0]).toContain('no service');
    } finally {
      stop();
    }
  });
});
