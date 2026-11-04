'use server';

import { headers } from 'next/headers';
import { listBusinessesForFounder } from '@ventora/access';
import { getFounderNames } from '@ventora/identity';
import {
  activateWorkflow,
  listActivationsForFounder,
  listDefinitionsForFounder,
  listExecutionsForFounder,
  retryExecution,
  saveDefinition,
  stopWorkflow,
  type DefinitionInput,
  type DefinitionSummary,
} from '@ventora/workflows';
import { reportActionError } from './report-error';

/* Lotul 4.10 — Founder · Automatizări (D-WF-2). Sesiunea Founder vine din cookie
   (requireFounderSession în core/workflows, cu 2FA); fiecare scriere are rândul ei de audit pe
   persoana Founder, în aceeași tranzacție. Pornirea rezervă o unitate din workflows.active pe
   app_runtime (DATABASE_URL, decizia 04.11.2026). Datele trec spre ecrane fără Date (ISO). */

export type ActionResult =
  { ok: true } | { ok: false; field?: string; conflict?: boolean; overQuota?: boolean };

function fail(action: string, err: unknown): ActionResult {
  reportActionError(action, err);
  const e = err as { code?: string; field?: string };
  if (e.code === 'INVALID_INPUT') return { ok: false, field: e.field };
  if (e.code === 'CONFLICT') return { ok: false, conflict: true };
  if (e.code === 'QUOTA_EXCEEDED') return { ok: false, overQuota: true };
  return { ok: false };
}

export type DefinitionData = DefinitionSummary;

/** „Automatizări”: toate, cu versiunea curentă și cifrele pe 30 de zile. */
export async function readAutomations(): Promise<DefinitionData[] | null> {
  try {
    return await listDefinitionsForFounder({ founderHeaders: await headers() });
  } catch (err) {
    reportActionError('readAutomations', err);
    return null;
  }
}

/** „Salvează automatizarea”: o automatizare nouă sau o versiune nouă. */
export async function saveAutomation(
  input: DefinitionInput & { definitionId?: string; name: string },
): Promise<ActionResult & { definitionId?: string }> {
  try {
    const { definitionId } = await saveDefinition({ founderHeaders: await headers(), ...input });
    return { ok: true, definitionId };
  } catch (err) {
    return fail('saveAutomation', err);
  }
}

export type BusinessActivationData = {
  organizationId: string;
  business: string;
  on: boolean;
  /** ISO: pornirea sau oprirea ultimei activări. */
  since: string | null;
  /** Numele Founder-ului care a pornit-o și motivul. */
  by: string | null;
  reason: string | null;
  settings: Record<string, unknown> | null;
};

/** „Pornită la afaceri”: fiecare afacere, cu ultima activare și setarea ei. */
export async function readAutomationBusinesses(
  definitionId: string,
): Promise<BusinessActivationData[] | null> {
  try {
    const h = await headers();
    const [businesses, activations] = await Promise.all([
      listBusinessesForFounder({ founderHeaders: h }),
      listActivationsForFounder({ founderHeaders: h, definitionId }),
    ]);
    const byOrg = new Map(activations.map((a) => [a.organizationId, a]));
    const founders = await getFounderNames(activations.map((a) => a.activatedByFounderId));
    return businesses.map((b) => {
      const a = byOrg.get(b.id);
      const on = a?.status === 'active';
      return {
        organizationId: b.id,
        business: b.name,
        on,
        since: on && a ? new Date(a.activatedAt).toISOString() : null,
        by: on && a ? (founders[a.activatedByFounderId] ?? null) : null,
        reason: on && a ? a.reason : null,
        settings: a?.settings ?? null,
      };
    });
  } catch (err) {
    reportActionError('readAutomationBusinesses', err);
    return null;
  }
}

/** „Pornește…” / „Oprește…”: „Motiv” obligatoriu, referința de suport opțională; auditate. */
export async function turnAutomation(params: {
  on: boolean;
  organizationId: string;
  definitionId: string;
  reason: string;
  supportRef?: string;
}): Promise<ActionResult> {
  try {
    const founderHeaders = await headers();
    const input = {
      founderHeaders,
      organizationId: params.organizationId,
      definitionId: params.definitionId,
      reason: params.reason,
      supportRef: params.supportRef?.trim() || null,
    };
    if (params.on) await activateWorkflow(input);
    else await stopWorkflow(input);
    return { ok: true };
  } catch (err) {
    return fail('turnAutomation', err);
  }
}

export type RunData = {
  id: string;
  organizationId: string;
  business: string;
  definitionId: string;
  createdAt: string;
  status: 'pending' | 'succeeded' | 'failed' | 'skipped';
  reasonCode: string | null;
  messagesSent: number;
  /** Cine primește: owner-ul afacerii (numele), altfel null. */
  forName: string | null;
};

/** „Jurnalul execuțiilor”, cel mult 200, cele mai noi întâi. */
export async function readRuns(definitionId?: string | null): Promise<RunData[] | null> {
  try {
    const h = await headers();
    const [runs, businesses] = await Promise.all([
      listExecutionsForFounder({
        founderHeaders: h,
        definitionId: definitionId ?? null,
        limit: 200,
      }),
      listBusinessesForFounder({ founderHeaders: h }),
    ]);
    const biz = new Map(businesses.map((b) => [b.id, b]));
    return runs.map((r) => ({
      id: r.executionId,
      organizationId: r.organizationId,
      business: biz.get(r.organizationId)?.name ?? '—',
      definitionId: r.definitionId,
      createdAt: new Date(r.createdAt).toISOString(),
      status: r.status,
      reasonCode: r.reasonCode,
      messagesSent: r.messagesSent,
      forName: r.subjectType === 'owner' ? (biz.get(r.organizationId)?.owner?.name ?? null) : null,
    }));
  } catch (err) {
    reportActionError('readRuns', err);
    return null;
  }
}

/** „Rulează din nou” (o execuție eșuată; auditat). */
export async function retryRun(organizationId: string, executionId: string): Promise<ActionResult> {
  try {
    await retryExecution({ founderHeaders: await headers(), organizationId, executionId });
    return { ok: true };
  } catch (err) {
    return fail('retryRun', err);
  }
}
