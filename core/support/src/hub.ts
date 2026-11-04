import { Forbidden, InvalidInput, NotAuthenticated, ResourceNotFound } from '@ventora/errors';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { getNotificationContactsInTx, getSession } from '@ventora/identity';
import { resolveOrgContext } from '@ventora/organizations';
import {
  attachmentLink,
  checkAttachments,
  describeAttachments,
  finishAttachmentUpload,
  startAttachmentUpload,
  type Uploader,
} from './attachments';
import { withHubTx } from './db';
import {
  BODY_MAX,
  SUBJECT_MAX,
  applyAction,
  fileIds,
  findRequest,
  insertEvent,
  insertMessage,
  isSupportApplication,
  listRequests,
  readThread,
  ref as refOf,
  text,
  urgency as urgencyOf,
  uuid,
  type SupportAttachment,
  type SupportRequestRow,
  type SupportThread,
} from './model';

/*
 * Lot 4.6 — Suport in the Hub (HubSupport, HubSupportThread). Any active member of the business
 * can write (S-2: no new permission; authorize() on `platform` stops members below admin, so the
 * membership is checked here, from the session, as for the support-session banner). What each
 * one sees (S-1): the owner and the admins — every request of the business; everyone else — only
 * their own. RLS keeps everything inside the organization (T1 / T2).
 */

export interface SupportActor {
  organizationId: string;
  userId: string;
  role: string;
}

const MANAGERS = new Set(['owner', 'admin']);
export const seesAllRequests = (actor: Pick<SupportActor, 'role'>) => MANAGERS.has(actor.role);

/** The person and the active business, from the session; never from client input. */
export async function resolveSupportActor(sessionToken: string): Promise<SupportActor> {
  const session = await getSession(new Headers({ authorization: `Bearer ${sessionToken}` }));
  if (!session?.userId) throw new NotAuthenticated();
  const organizationId = session.activeOrganizationId;
  if (!organizationId) throw new Forbidden('No active business');
  const ctx = await resolveOrgContext({ userId: session.userId, organizationId });
  return { organizationId, userId: session.userId, role: ctx.role };
}

const uploaderOf = (actor: SupportActor): Uploader => ({
  organizationId: actor.organizationId,
  userId: actor.userId,
  connection: 'app',
});

function visible(actor: SupportActor, request: SupportRequestRow | null): SupportRequestRow {
  // someone else's request is invisible to a member: the same answer as a missing one
  if (!request || (!seesAllRequests(actor) && request.requesterUserId !== actor.userId)) {
    throw new ResourceNotFound('Request not found');
  }
  return request;
}

async function personName(exec: AuditSqlExecutor, userId: string): Promise<string> {
  const contact = (await getNotificationContactsInTx(exec, [userId])).get(userId);
  return contact?.name || contact?.email || '';
}

/** „Solicitare nouă”: the id the attachments of the new request belong to, before it exists. */
export function newSupportRequestId(): string {
  return uuidv7();
}

/** HubSupport: „Solicitările mele” (members) / the business's requests (owner, admins). */
export async function listSupportRequests(actor: SupportActor): Promise<SupportRequestRow[]> {
  return withHubTx(
    uuid('organizationId', actor.organizationId),
    (client) =>
      listRequests(client, seesAllRequests(actor) ? {} : { requesterUserId: actor.userId }),
    true,
  );
}

/** How many requests wait for the person (Hub: „Răspuns nou”), for the Spine badge. */
export async function countSupportNewReplies(actor: SupportActor): Promise<number> {
  const rows = await listSupportRequests(actor);
  return rows.filter((r) => r.status === 'awaiting_business').length;
}

/** HubSupport → „Trimite”: the request, its first message, its history row, its attachments. */
export async function createSupportRequest(
  actor: SupportActor,
  input: {
    id: string;
    applicationId: string;
    subject: string;
    description: string;
    urgency: string;
    fileIds?: readonly string[];
  },
): Promise<{ id: string; ref: string }> {
  const organizationId = uuid('organizationId', actor.organizationId);
  const id = uuid('id', input.id);
  if (!isSupportApplication(input.applicationId)) throw new InvalidInput('applicationId');
  const subject = text('subject', input.subject, SUBJECT_MAX);
  const description = text('description', input.description, BODY_MAX);
  const urgency = urgencyOf(input.urgency);
  const files = fileIds(input.fileIds);
  await checkAttachments(uploaderOf(actor), id, files);

  return withHubTx(organizationId, async (client, exec) => {
    const name = await personName(exec, actor.userId);
    if (await findRequest(client, { id })) throw new InvalidInput('id');
    const { rows } = await client.query<{ ref: string }>(
      `INSERT INTO support.support_request
         (id, organization_id, application_id, requester_user_id, requester_name, subject,
          description, urgency, last_message_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5)
       RETURNING ref`,
      [
        id,
        organizationId,
        input.applicationId,
        actor.userId,
        name.slice(0, 255),
        subject,
        description,
        urgency,
      ],
    );
    const request = await findRequest(client, { id });
    if (!request) throw new Error('[support] the new request is not visible');
    const author = { type: 'business' as const, id: actor.userId, name };
    await insertMessage(client, request, author, description, 'message', files);
    await insertEvent(client, request, 'opened', null, 'open', author);
    await appendAuditEventInTx(exec, {
      category: 'support',
      action: AuditActions.supportRequestCreated,
      outcome: 'success',
      actorType: 'user',
      actorId: actor.userId,
      organizationId,
      targetType: 'support_request',
      targetId: id,
      metadata: {
        ref: rows[0]!.ref,
        applicationId: input.applicationId,
        urgency,
        attachments: files.length,
      },
    });
    return { id, ref: rows[0]!.ref };
  });
}

export interface HubSupportThread extends SupportThread {
  /** Each attachment's signed link (/files/<token>, 10 minutes). */
  links: Record<string, string>;
}

/** HubSupportThread, by the reference in the address (VS-2026-0142). */
export async function getSupportThread(
  actor: SupportActor,
  requestRef: string,
): Promise<HubSupportThread> {
  const organizationId = uuid('organizationId', actor.organizationId);
  const wanted = refOf(requestRef);
  const { request, thread } = await withHubTx(
    organizationId,
    async (client) => {
      const request = visible(actor, await findRequest(client, { ref: wanted }));
      return { request, thread: await readThread(client, request) };
    },
    true,
  );
  return withFiles(uploaderOf(actor), request, thread);
}

export async function withFiles(
  reader: Uploader,
  request: SupportRequestRow,
  thread: Awaited<ReturnType<typeof readThread>>,
): Promise<HubSupportThread> {
  const all = [...thread.fileIds.values()].flat();
  const described = await describeAttachments(reader, all);
  const links: Record<string, string> = {};
  for (const id of described.keys()) {
    try {
      links[id] = await attachmentLink(reader, id);
    } catch {
      // without a link the attachment still shows its name and size
    }
  }
  return {
    request,
    messages: thread.messages.map((m) => ({
      ...m,
      attachments: (thread.fileIds.get(m.id) ?? [])
        .map((id) => described.get(id))
        .filter((a): a is SupportAttachment => !!a),
    })),
    history: thread.history,
    links,
  };
}

/** „Trimite răspunsul” (business): after a team reply the request goes back to the team. */
export async function replyToSupportRequest(
  actor: SupportActor,
  requestRef: string,
  input: { body: string; fileIds?: readonly string[] },
): Promise<SupportRequestRow> {
  return businessMessage(actor, requestRef, input, 'business_reply');
}

/** „Redeschide și trimite”: a closed request, with „Ce s-a întâmplat din nou?”, back to „Deschise”. */
export async function reopenSupportRequest(
  actor: SupportActor,
  requestRef: string,
  input: { body: string; fileIds?: readonly string[] },
): Promise<SupportRequestRow> {
  return businessMessage(actor, requestRef, input, 'business_reopen');
}

async function businessMessage(
  actor: SupportActor,
  requestRef: string,
  input: { body: string; fileIds?: readonly string[] },
  action: 'business_reply' | 'business_reopen',
): Promise<SupportRequestRow> {
  const organizationId = uuid('organizationId', actor.organizationId);
  const wanted = refOf(requestRef);
  const body = text('body', input.body, BODY_MAX);
  const files = fileIds(input.fileIds);
  return withHubTx(organizationId, async (client, exec) => {
    const request = visible(actor, await findRequest(client, { ref: wanted }, true));
    await checkAttachments(uploaderOf(actor), request.id, files);
    const name = await personName(exec, actor.userId);
    const author = { type: 'business' as const, id: actor.userId, name };
    const status = await applyAction(client, request, action, author, { message: true });
    await insertMessage(
      client,
      request,
      author,
      body,
      action === 'business_reopen' ? 'reopen' : 'message',
      files,
    );
    await appendAuditEventInTx(exec, {
      category: 'support',
      action:
        action === 'business_reopen'
          ? AuditActions.supportRequestReopened
          : AuditActions.supportRequestReplied,
      outcome: 'success',
      actorType: 'user',
      actorId: actor.userId,
      organizationId,
      targetType: 'support_request',
      targetId: request.id,
      metadata: { ref: request.ref, from: request.status, to: status, attachments: files.length },
    });
    const updated = await findRequest(client, { id: request.id });
    return updated!;
  });
}

/**
 * An attachment for a request of the person (or for the new one, by the id from
 * newSupportRequestId). A request the person cannot see is refused as missing.
 */
export async function startSupportUpload(
  actor: SupportActor,
  requestId: string,
  file: { name: string; contentType: string; sizeBytes: number },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  const id = uuid('requestId', requestId);
  const existing = await withHubTx(
    uuid('organizationId', actor.organizationId),
    (client) => findRequest(client, { id }),
    true,
  );
  if (existing) visible(actor, existing);
  return startAttachmentUpload(uploaderOf(actor), id, file);
}

export async function finishSupportUpload(
  actor: SupportActor,
  fileId: string,
): Promise<SupportAttachment> {
  return finishAttachmentUpload(uploaderOf(actor), uuid('fileId', fileId));
}
