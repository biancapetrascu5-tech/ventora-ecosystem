import {
  sendNotification,
  type SendNotificationResult,
  type SqlClient,
} from '@ventora/notifications';

/*
 * Notifications to a business's managers (Lot 4.3). The outbox consumers run in the dispatcher's
 * transaction, in the organization's context from the envelope (Lot 4.1); the owner and the
 * admins are read here, under org_rw, then the notification is written by core/notifications.
 */

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

/** The active owners and admins of the organization in context, read as org_rw. */
export async function listManagersInTx(
  tx: SqlClient,
  organizationId: string,
): Promise<{ userId: string; role: 'owner' | 'admin' }[]> {
  const { rows: who } = await tx.query('SELECT current_user::text AS role');
  const previous = (who[0] as { role: string }).role;
  if (!ROLE_RE.test(previous)) throw new Error(`[organizations] unexpected role "${previous}"`);
  if (previous !== 'org_rw') await tx.query('SET LOCAL ROLE org_rw');
  try {
    const { rows } = await tx.query(
      `SELECT user_id::text AS user_id, role::text AS role FROM organizations.membership
        WHERE organization_id = $1::uuid AND status = 'active' AND role IN ('owner', 'admin')
        ORDER BY role, user_id`,
      [organizationId],
    );
    return (rows as { user_id: string; role: 'owner' | 'admin' }[]).map((r) => ({
      userId: r.user_id,
      role: r.role,
    }));
  } finally {
    if (previous !== 'org_rw') await tx.query(`SET LOCAL ROLE ${previous}`);
  }
}

/** One operational notification for the owner and each admin; members get none. */
export async function notifyManagersInTx(
  tx: SqlClient,
  input: {
    organizationId: string;
    type: string;
    version: number;
    idempotencyKey: string;
    params: Readonly<Record<string, string>>;
  },
): Promise<SendNotificationResult> {
  const managers = await listManagersInTx(tx, input.organizationId);
  return sendNotification(tx, {
    category: 'operational',
    type: input.type,
    version: input.version,
    organizationId: input.organizationId,
    recipientUserIds: managers.map((m) => m.userId),
    ownerUserIds: managers.filter((m) => m.role === 'owner').map((m) => m.userId),
    idempotencyKey: input.idempotencyKey,
    params: input.params,
  });
}

type Envelope = {
  eventId: string;
  organizationId: string;
  payload: unknown;
};

/**
 * The first real consumer (ARCHITECTURE §15.1): someone asked for a new invitation from an
 * expired one → the owner and the admins get „{name} a cerut o invitație nouă pentru
 * {businessName}.” in the Hub, with the action to the invitations list (HubAdminTeam). `{name}`
 * is the invited address. No email, and nothing to the inviter beyond this (FAZA-4, Lot 4.3).
 * Delivered twice → one notification (the event id is the idempotency key).
 */
export const invitationNewLinkRequestedConsumer = {
  name: 'notifications.invitation-new-link-requested',
  handles: [{ type: 'invitation.new_link_requested', version: 1 }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const { invitationId } = envelope.payload as { invitationId: string };
    const { rows } = await tx.query(
      `SELECT email, organization_name FROM organizations.invitation
        WHERE id = $1::uuid AND organization_id = $2::uuid`,
      [invitationId, envelope.organizationId],
    );
    const invitation = rows[0] as { email: string; organization_name: string } | undefined;
    if (!invitation) throw new Error('[organizations] invitation not found for the event');
    await notifyManagersInTx(tx, {
      organizationId: envelope.organizationId,
      type: 'invitation.new_link_requested',
      version: 1,
      idempotencyKey: envelope.eventId,
      params: { name: invitation.email, businessName: invitation.organization_name },
    });
  },
};
