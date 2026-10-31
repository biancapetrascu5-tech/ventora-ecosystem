/*
 * Registrul de job-uri (Lot 4.2, ARCHITECTURE §11.3, D4-2 = a). Un singur loc unde se declară
 * tot ce rulează programat sau asincron. Fiecare lot își înregistrează job-urile aici, în
 * registrul aplicației, fără să atingă ruta comună (`app/api/inngest/route.ts`), care servește
 * doar ce găsește în registru.
 *
 * Un job poate fi doar declarat (fără `run`): F3 și 4.3 își declară job-urile acum, iar logica
 * vine în loturile lor, cu `attach`. Un job declarat nu e servit, deci nu rulează și nu poate
 * eșua până nu are logică.
 */

/** Programat (expresie cron, UTC) sau la un eveniment (numele lui, `<domeniu>/<entitate>.<acțiune>`). */
export type JobTrigger = { cron: string } | { event: string };

export interface JobRunContext {
  jobId: string;
  runId: string;
  /** Încercarea curentă, de la 0. */
  attempt: number;
  /**
   * Contextul de tenant, din plicul evenimentului (§11.2). null pentru un job programat: acela
   * lucrează pe toate organizațiile și ia organizația din fiecare rând (ca dispecerul outbox).
   */
  organizationId: string | null;
  correlationId: string | null;
  /** Datele evenimentului (plicul), pentru un job declanșat de eveniment; null pentru cron. */
  data: Readonly<Record<string, unknown>> | null;
}

export type JobRun = (ctx: JobRunContext) => Promise<unknown>;

export interface JobDefinition {
  /** Stabil: `<domeniu>.<nume>`, ex. `platform.outbox-dispatch`. */
  id: string;
  /** Cine îl scrie (lotul), ex. `Lot 4.1`, `Lot 3.5`. */
  owner: string;
  description: string;
  trigger: JobTrigger;
  /** Reîncercări după primul eșec (0–20); implicit 3, regula serviciului. */
  retries?: number;
  /** Logica; lipsește cât timp job-ul e doar declarat. */
  run?: JobRun;
}

const JOB_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const EVENT_NAME = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const CRON = /^(\S+\s+){4}\S+$/;

export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition>();

  register(job: JobDefinition): this {
    if (!JOB_ID.test(job.id)) {
      throw new Error(`[integrations] Id de job invalid: "${job.id}"`);
    }
    if (this.jobs.has(job.id)) {
      throw new Error(`[integrations] Job înregistrat de două ori: "${job.id}"`);
    }
    if ('cron' in job.trigger) {
      if (!CRON.test(job.trigger.cron.trim())) {
        throw new Error(`[integrations] Cron invalid pentru ${job.id}: "${job.trigger.cron}"`);
      }
    } else if (!EVENT_NAME.test(job.trigger.event)) {
      throw new Error(`[integrations] Eveniment invalid pentru ${job.id}: "${job.trigger.event}"`);
    }
    if (
      job.retries !== undefined &&
      (!Number.isInteger(job.retries) || job.retries < 0 || job.retries > 20)
    ) {
      throw new Error(`[integrations] retries trebuie să fie între 0 și 20 (${job.id})`);
    }
    this.jobs.set(job.id, { ...job });
    return this;
  }

  /** Logica unui job declarat mai devreme (de ex. de F3, în lotul ei). */
  attach(id: string, run: JobRun): this {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`[integrations] Job necunoscut: "${id}"`);
    if (job.run) throw new Error(`[integrations] Job-ul "${id}" are deja logică`);
    job.run = run;
    return this;
  }

  get(id: string): JobDefinition | undefined {
    return this.jobs.get(id);
  }

  /** Job-urile cu logică: acestea se servesc. */
  runnable(): (JobDefinition & { run: JobRun })[] {
    return [...this.jobs.values()].filter((j): j is JobDefinition & { run: JobRun } => !!j.run);
  }

  /** Job-urile doar declarate, care așteaptă logica din lotul lor. */
  declaredOnly(): JobDefinition[] {
    return [...this.jobs.values()].filter((j) => !j.run);
  }

  all(): JobDefinition[] {
    return [...this.jobs.values()];
  }
}
