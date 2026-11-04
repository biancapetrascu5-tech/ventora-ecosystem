'use server';

import { headers } from 'next/headers';
import { listBusinessesForFounder } from '@ventora/access';
import { getBusinessCommercialForFounder } from '@ventora/commercial';
import {
  closeSupportRequestAsTeam,
  countSupportRequestsForFounder,
  finishTeamUpload,
  getSupportThreadForFounder,
  listSupportRequestsForFounder,
  markSupportRequestInProgress,
  replyAsTeam,
  startTeamUpload,
  type FounderSupportGroup,
} from '@ventora/support';
import { reportActionError } from './report-error';

/* Lotul 4.6 — Founder · Suport (FounderSupportInbox, D4-14 b). Sesiunea Founder (cu 2FA) vine din
   cookie; core/support o cere la fiecare apel și scrie auditul în aceeași tranzacție. Numele
   afacerilor, proprietarul și numărul de membri vin din core/access, abonamentul din
   core/commercial. Datele trec spre ecrane fără Date (ISO). */

export type InboxItemData = {
  id: string;
  organizationId: string;
  business: string;
  ref: string;
  applicationId: string;
  subject: string;
  urgency: 'normal' | 'blocking';
  status: 'open' | 'in_progress' | 'awaiting_business' | 'closed';
  overdue: boolean;
  lastMessageAt: string;
  lastMessageBy: 'business' | 'team';
  lastMessageName: string;
};

export type InboxData = {
  items: InboxItemData[];
  counts: { open: number; progress: number; overdue: number };
  businesses: { id: string; name: string }[];
};

export async function readSupportInbox(filters: {
  group: FounderSupportGroup;
  applicationId?: string | null;
  organizationId?: string | null;
  search?: string | null;
}): Promise<InboxData | null> {
  try {
    const founderHeaders = await headers();
    const [items, counts, businesses] = await Promise.all([
      listSupportRequestsForFounder({ founderHeaders, ...filters }),
      countSupportRequestsForFounder({ founderHeaders }),
      listBusinessesForFounder({ founderHeaders }),
    ]);
    const name = new Map(businesses.map((b) => [b.id, b.name]));
    return {
      items: items.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        business: name.get(r.organizationId) ?? '',
        ref: r.ref,
        applicationId: r.applicationId,
        subject: r.subject,
        urgency: r.urgency,
        status: r.status,
        overdue: r.overdue,
        lastMessageAt: r.lastMessageAt.toISOString(),
        lastMessageBy: r.lastMessageBy,
        lastMessageName: r.lastMessageName,
      })),
      counts,
      businesses: businesses.map((b) => ({ id: b.id, name: b.name })),
    };
  } catch (err) {
    reportActionError('readSupportInbox', err);
    return null;
  }
}

/** Spine · „Suport” cu numărul solicitărilor deschise. */
export async function readSupportOpenCount(): Promise<number> {
  try {
    return (await countSupportRequestsForFounder({ founderHeaders: await headers() })).open;
  } catch (err) {
    reportActionError('readSupportOpenCount', err, { quietIfExpected: true });
    return 0;
  }
}

export type FounderThreadData = {
  request: {
    id: string;
    organizationId: string;
    ref: string;
    applicationId: string;
    subject: string;
    urgency: 'normal' | 'blocking';
    status: 'open' | 'in_progress' | 'awaiting_business' | 'closed';
    closedByType: 'team' | 'system' | null;
    requesterUserId: string;
    requesterName: string;
    createdAt: string;
  };
  messages: {
    id: string;
    authorType: 'business' | 'team';
    authorId: string;
    authorName: string;
    body: string;
    createdAt: string;
    attachments: {
      fileId: string;
      name: string;
      sizeBytes: number;
      contentType: string;
      href?: string;
    }[];
  }[];
  business: {
    name: string;
    ownerUserId: string | null;
    ownerName: string | null;
    memberCount: number;
    planName: string | null;
  };
};

export async function readSupportThreadForFounder(ref: string): Promise<FounderThreadData | null> {
  try {
    const founderHeaders = await headers();
    const t = await getSupportThreadForFounder({ founderHeaders, ref });
    const orgId = t.request.organizationId;
    const [businesses, commercial] = await Promise.all([
      listBusinessesForFounder({ founderHeaders }),
      getBusinessCommercialForFounder({ founderHeaders, organizationId: orgId }).catch((err) => {
        reportActionError('readSupportThreadForFounder.plan', err, { quietIfExpected: true });
        return null;
      }),
    ]);
    const b = businesses.find((x) => x.id === orgId);
    return {
      request: {
        id: t.request.id,
        organizationId: orgId,
        ref: t.request.ref,
        applicationId: t.request.applicationId,
        subject: t.request.subject,
        urgency: t.request.urgency,
        status: t.request.status,
        closedByType: t.request.closedByType,
        requesterUserId: t.request.requesterUserId,
        requesterName: t.request.requesterName,
        createdAt: t.request.createdAt.toISOString(),
      },
      messages: t.messages.map((m) => ({
        id: m.id,
        authorType: m.authorType,
        authorId: m.authorId,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        attachments: m.attachments.map((a) => ({ ...a, href: t.links[a.fileId] })),
      })),
      business: {
        name: b?.name ?? '',
        ownerUserId: b?.owner?.userId ?? null,
        ownerName: b?.owner?.name ?? null,
        memberCount: b?.memberCount ?? 0,
        planName: commercial?.subscription?.planName ?? null,
      },
    };
  } catch (err) {
    reportActionError('readSupportThreadForFounder', err, { quietIfExpected: true });
    return null;
  }
}

export type TeamResult = { ok: true } | { ok: false; field?: string };

async function run(action: string, fn: (h: Headers) => Promise<unknown>): Promise<TeamResult> {
  try {
    await fn(await headers());
    return { ok: true };
  } catch (err) {
    reportActionError(action, err);
    const e = err as { code?: string; field?: string };
    return e.code === 'INVALID_INPUT' ? { ok: false, field: e.field } : { ok: false };
  }
}

export async function sendTeamReply(input: {
  organizationId: string;
  requestId: string;
  body: string;
  fileIds: string[];
  close?: boolean;
}): Promise<TeamResult> {
  return run('sendTeamReply', (founderHeaders) => replyAsTeam({ founderHeaders, ...input }));
}

export async function markRequestInProgress(organizationId: string, requestId: string) {
  return run('markRequestInProgress', (founderHeaders) =>
    markSupportRequestInProgress({ founderHeaders, organizationId, requestId }),
  );
}

export async function closeRequest(organizationId: string, requestId: string) {
  return run('closeRequest', (founderHeaders) =>
    closeSupportRequestAsTeam({ founderHeaders, organizationId, requestId }),
  );
}

type UploadError = { error: 'type' | 'size' | 'failed' };

export async function startTeamAttachment(
  organizationId: string,
  requestId: string,
  file: { name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string } | UploadError> {
  try {
    const { fileId, uploadUrl } = await startTeamUpload({
      founderHeaders: await headers(),
      organizationId,
      requestId,
      file,
    });
    return { fileId, uploadUrl };
  } catch (err) {
    reportActionError('startTeamAttachment', err, { quietIfExpected: true });
    const e = err as { code?: string; field?: string };
    if (e.code === 'INVALID_INPUT' && e.field === 'contentType') return { error: 'type' };
    if (e.code === 'INVALID_INPUT' && e.field === 'sizeBytes') return { error: 'size' };
    return { error: 'failed' };
  }
}

export async function finishTeamAttachment(
  organizationId: string,
  fileId: string,
): Promise<{ ok: true } | UploadError> {
  try {
    await finishTeamUpload({ founderHeaders: await headers(), organizationId, fileId });
    return { ok: true };
  } catch (err) {
    reportActionError('finishTeamAttachment', err, { quietIfExpected: true });
    const e = err as { code?: string; message?: string };
    if (e.code === 'INVALID_INPUT' && /too_large/.test(e.message ?? '')) return { error: 'size' };
    if (e.code === 'INVALID_INPUT' && /type_mismatch/.test(e.message ?? ''))
      return { error: 'type' };
    return { error: 'failed' };
  }
}
