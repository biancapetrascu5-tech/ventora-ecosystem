'use server';

import { headers } from 'next/headers';
import { getSession } from '@ventora/identity';
import {
  countSupportNewReplies,
  createSupportRequest,
  finishSupportUpload,
  getSupportThread,
  listSupportRequests,
  newSupportRequestId,
  reopenSupportRequest,
  replyToSupportRequest,
  resolveSupportActor,
  seesAllRequests,
  startSupportUpload,
  type HubSupportThread,
  type SupportActor,
  type SupportRequestRow,
} from '@ventora/support';
import { reportActionError } from './report-error';

/* Lotul 4.6 — Suport în Hub (HubSupport, HubSupportThread). Persoana și afacerea activă vin din
   sesiune (resolveSupportActor), niciodată din ecran; core/support decide ce vede fiecare (S-1)
   și verifică atașamentele pe server (D4-17). Datele trec spre ecrane fără Date (ISO). */

async function actor(): Promise<SupportActor | null> {
  const session = await getSession(await headers());
  if (!session?.token) return null;
  try {
    return await resolveSupportActor(session.token);
  } catch (err) {
    reportActionError('support.actor', err, { quietIfExpected: true });
    return null;
  }
}

export type SupportRequestData = {
  id: string;
  ref: string;
  applicationId: string;
  subject: string;
  urgency: 'normal' | 'blocking';
  hubStatus: 'newReply' | 'inProgress' | 'resolved';
  requesterUserId: string;
  requesterName: string;
  lastMessageAt: string;
  createdAt: string;
};

const toData = (r: SupportRequestRow): SupportRequestData => ({
  id: r.id,
  ref: r.ref,
  applicationId: r.applicationId,
  subject: r.subject,
  urgency: r.urgency,
  hubStatus: r.hubStatus,
  requesterUserId: r.requesterUserId,
  requesterName: r.requesterName,
  lastMessageAt: r.lastMessageAt.toISOString(),
  createdAt: r.createdAt.toISOString(),
});

export type SupportListData = {
  /** S-1: the owner and the admins see the business's requests. */
  manager: boolean;
  userId: string;
  requests: SupportRequestData[];
  /** The id the new request's attachments belong to (core/support newSupportRequestId). */
  draftId: string;
};

export async function readSupportList(): Promise<SupportListData | null> {
  const who = await actor();
  if (!who) return null;
  try {
    const rows = await listSupportRequests(who);
    return {
      manager: seesAllRequests(who),
      userId: who.userId,
      requests: rows.map(toData),
      draftId: newSupportRequestId(),
    };
  } catch (err) {
    reportActionError('readSupportList', err);
    return null;
  }
}

/** The Spine badge: requests with „Răspuns nou”. */
export async function readSupportBadge(): Promise<number> {
  const who = await actor();
  if (!who) return 0;
  try {
    return await countSupportNewReplies(who);
  } catch (err) {
    reportActionError('readSupportBadge', err);
    return 0;
  }
}

export type SupportResult<T = object> =
  ({ ok: true } & T) | { ok: false; field?: string; notFound?: boolean };

function fail(action: string, err: unknown): { ok: false; field?: string; notFound?: boolean } {
  reportActionError(action, err, { quietIfExpected: true });
  const e = err as { code?: string; field?: string };
  if (e.code === 'INVALID_INPUT') return { ok: false, field: e.field };
  if (e.code === 'RESOURCE_NOT_FOUND') return { ok: false, notFound: true };
  return { ok: false };
}

export async function sendSupportRequest(input: {
  id: string;
  applicationId: string;
  subject: string;
  description: string;
  urgency: string;
  fileIds: string[];
}): Promise<SupportResult<{ ref: string }>> {
  const who = await actor();
  if (!who) return { ok: false };
  try {
    const { ref } = await createSupportRequest(who, input);
    return { ok: true, ref };
  } catch (err) {
    return fail('sendSupportRequest', err);
  }
}

export type SupportThreadData = {
  userId: string;
  request: SupportRequestData;
  messages: {
    id: string;
    authorType: 'business' | 'team';
    authorId: string;
    authorName: string;
    body: string;
    kind: 'message' | 'reopen';
    createdAt: string;
    attachments: {
      fileId: string;
      name: string;
      sizeBytes: number;
      contentType: string;
      href?: string;
    }[];
  }[];
  history: {
    kind: string;
    actorType: 'business' | 'team' | 'system';
    actorId: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
  /** The id of the request (the attachments of a reply belong to it). */
  requestId: string;
};

function threadData(userId: string, t: HubSupportThread): SupportThreadData {
  return {
    userId,
    requestId: t.request.id,
    request: toData(t.request),
    messages: t.messages.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorId: m.authorId,
      authorName: m.authorName,
      body: m.body,
      kind: m.kind,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments.map((a) => ({ ...a, href: t.links[a.fileId] })),
    })),
    history: t.history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  };
}

export async function readSupportThread(ref: string): Promise<SupportThreadData | null> {
  const who = await actor();
  if (!who) return null;
  try {
    return threadData(who.userId, await getSupportThread(who, ref));
  } catch (err) {
    reportActionError('readSupportThread', err, { quietIfExpected: true });
    return null;
  }
}

export async function sendSupportReply(
  ref: string,
  input: { body: string; fileIds: string[]; reopen?: boolean },
): Promise<SupportResult> {
  const who = await actor();
  if (!who) return { ok: false };
  try {
    if (input.reopen) await reopenSupportRequest(who, ref, input);
    else await replyToSupportRequest(who, ref, input);
    return { ok: true };
  } catch (err) {
    return fail('sendSupportReply', err);
  }
}

type UploadError = { error: 'type' | 'size' | 'failed' };

function uploadError(err: unknown): UploadError {
  const e = err as { code?: string; field?: string };
  if (e.code === 'INVALID_INPUT' && e.field === 'contentType') return { error: 'type' };
  if (e.code === 'INVALID_INPUT' && e.field === 'sizeBytes') return { error: 'size' };
  return { error: 'failed' };
}

export async function startSupportAttachment(
  requestId: string,
  file: { name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string } | UploadError> {
  const who = await actor();
  if (!who) return { error: 'failed' };
  try {
    const { fileId, uploadUrl } = await startSupportUpload(who, requestId, file);
    return { fileId, uploadUrl };
  } catch (err) {
    reportActionError('startSupportAttachment', err, { quietIfExpected: true });
    return uploadError(err);
  }
}

export async function finishSupportAttachment(fileId: string): Promise<{ ok: true } | UploadError> {
  const who = await actor();
  if (!who) return { error: 'failed' };
  try {
    await finishSupportUpload(who, fileId);
    return { ok: true };
  } catch (err) {
    reportActionError('finishSupportAttachment', err, { quietIfExpected: true });
    // the stored file is not what was declared: its real type or size (core/files says which)
    const e = err as { code?: string; message?: string };
    if (e.code === 'INVALID_INPUT' && /too_large/.test(e.message ?? '')) return { error: 'size' };
    if (e.code === 'INVALID_INPUT' && /type_mismatch/.test(e.message ?? ''))
      return { error: 'type' };
    return { error: 'failed' };
  }
}
