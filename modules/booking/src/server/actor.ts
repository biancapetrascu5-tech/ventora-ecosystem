import type { TenantContext } from '@ventora/access';

/*
 * Lot B.11a — who writes: a Hub user (authorize()) or the client on the public page. The public
 * context is made only by server/public.ts (publicContextFor) and remembered here, so a context from
 * the outside can never claim to be public. In a public context nothing carries a user id: the
 * audit actor is 'anonymous', the history actor 'client', created_by_user_id null, source 'public'.
 */

const publicContexts = new WeakSet<TenantContext>();

/**
 * `askAsUserId`: the business's active owner. core/access answers whether a member may take
 * appointments only for a caller who is a member, so the public context asks as the owner; it is
 * never written anywhere (actorUserId gives null for a public context).
 */
export function makePublicContext(organizationId: string, askAsUserId: string): TenantContext {
  const ctx: TenantContext = {
    userId: askAsUserId,
    organizationId,
    membershipId: null,
    role: 'member',
    applicationId: 'booking',
    actor: 'system',
  };
  publicContexts.add(ctx);
  return ctx;
}

export function isPublicContext(ctx: TenantContext): boolean {
  return publicContexts.has(ctx);
}

/** The user id to store (created_by_user_id, actor_user_id): null for the public page. */
export function actorUserId(ctx: TenantContext): string | null {
  return isPublicContext(ctx) ? null : ctx.userId;
}
