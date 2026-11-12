import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  blockClientInOrg,
  eraseClientInOrg,
  getClientCardInOrg,
  listBlockedClientsInOrg,
  listClientAppointmentsInOrg,
  mergeClientsInOrg,
  unblockClientInOrg,
  type BlockedClient,
  type ClientCard,
  type ClientCardAppointment,
} from '../server/clients';
import {
  getBehaviorNoteSettingsInOrg,
  removeBehaviorNoteInOrg,
  setBehaviorNoteSettingsInOrg,
  type BehaviorNoteSettings,
} from '../server/behavior';

/*
 * Lot B.7a — the public contract of the client card (plan reports/2026-11-10_1745_plan-booking-b7.md,
 * approved 10.11.2026; designs BookingClientCard, BookingBlockedClients S125, BookingClientMerge
 * S139). Reading with booking:read (the internal reason of a block only for the owner, the admins
 * and the application manager); blocking, merging and erasing with booking:admin (D-B7-3 = a).
 *
 * Errors: InvalidInput (reason: too_short / too_long, mergeClientId, fillEmpty, limit, offset);
 * Conflict (client_blocked, client_merged, client_archived, client_erased); ResourceNotFound;
 * Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const auth = (params: Session, permission: string): Promise<TenantContext> =>
  authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });

/** S125: the reason of a block is seen by the owner, the admins and the application manager. */
async function seesReasons(ctx: TenantContext): Promise<boolean> {
  return ctx.role !== 'support' && checkRolePermission(ctx.role, 'booking', 'booking:admin');
}

export type ClientIdParams = Session & { clientId: string };
export type ListClientAppointmentsParams = Session & {
  clientId: string;
  limit?: number;
  offset?: number;
};
export type BlockClientParams = Session & { clientId: string; reason: string };
export type MergeClientsParams = Session & {
  keepClientId: string;
  mergeClientId: string;
  /** „Completează câmpurile goale din fișa dublată”. */
  fillEmpty?: boolean;
};

/** BookingClientCard. */
export async function getClientCard(params: ClientIdParams): Promise<ClientCard> {
  const ctx = await auth(params, 'booking:read');
  return getClientCardInOrg(ctx, params.clientId, await seesReasons(ctx));
}

/** The client's appointments (with the clients merged into it), for the card and ClientDesk. */
export async function listClientAppointments(
  params: ListClientAppointmentsParams,
): Promise<{ items: ClientCardAppointment[]; total: number }> {
  return listClientAppointmentsInOrg(await auth(params, 'booking:read'), {
    clientId: params.clientId,
    limit: params.limit,
    offset: params.offset,
  });
}

/** BookingBlockedClients: „Blocați · n”. */
export async function listBlockedClients(params: Session): Promise<BlockedClient[]> {
  const ctx = await auth(params, 'booking:read');
  return listBlockedClientsInOrg(ctx, await seesReasons(ctx));
}

/** „Blochează clientul…”. */
export async function blockClient(params: BlockClientParams): Promise<void> {
  return blockClientInOrg(await auth(params, 'booking:admin'), {
    clientId: params.clientId,
    reason: params.reason,
  });
}

/** „Deblochează”. */
export async function unblockClient(params: ClientIdParams): Promise<void> {
  return unblockClientInOrg(await auth(params, 'booking:admin'), params.clientId);
}

/** „Îmbină cu alt client”. */
export async function mergeClients(
  params: MergeClientsParams,
): Promise<{ keptClientId: string; mergedClientId: string }> {
  return mergeClientsInOrg(await auth(params, 'booking:admin'), {
    keepClientId: params.keepClientId,
    mergeClientId: params.mergeClientId,
    fillEmpty: params.fillEmpty,
  });
}

/** The GDPR erasure of a client (D-B7-1 = a); also the module's handler for Core (§6.4 e). */
export async function eraseClient(
  params: ClientIdParams,
): Promise<{ appointmentsAnonymized: number; photosPending: number }> {
  return eraseClientInOrg(await auth(params, 'booking:admin'), params.clientId);
}

// ── B.7b: the behaviour note (S139) ─────────────────────────────────────────────────────────

export type SetBehaviorNoteSettingsParams = Session & {
  enabled?: boolean;
  noShows?: 2 | 3;
  months?: 3 | 6 | 12;
};
export type RemoveBehaviorNoteParams = Session & { clientId: string; reason: string };

/** Setări › General · „Nota de comportament” (booking:read). */
export async function getBehaviorNoteSettings(params: Session): Promise<BehaviorNoteSettings> {
  return getBehaviorNoteSettingsInOrg(await auth(params, 'booking:read'));
}

/** Turn the note on / off and set the rule (booking:settings). */
export async function setBehaviorNoteSettings(
  params: SetBehaviorNoteSettingsParams,
): Promise<BehaviorNoteSettings> {
  return setBehaviorNoteSettingsInOrg(await auth(params, 'booking:settings'), {
    enabled: params.enabled,
    noShows: params.noShows,
    months: params.months,
  });
}

/** „Șterge nota” from the card, with a reason (booking:admin). */
export async function removeBehaviorNote(params: RemoveBehaviorNoteParams): Promise<void> {
  return removeBehaviorNoteInOrg(await auth(params, 'booking:admin'), {
    clientId: params.clientId,
    reason: params.reason,
  });
}
