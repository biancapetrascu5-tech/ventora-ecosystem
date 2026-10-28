import { isAPIError } from 'better-auth/api';
import {
  AuditActions,
  founderAction,
  hashEmail,
  writeAuditEvent,
  type AuditEvent,
  type AuditOutcome,
} from '@ventora/audit';

// Audit for the Better Auth endpoints (plan Lot 2.5 §2.1, §2.2, E30). Mode: best_effort (D2) —
// a failed audit write never blocks sign-in; the error is logged by writeAuditEvent.
//
// Hook order (better-auth dispatch.mjs): the user `hooks.after` runs BEFORE the plugin
// after-hooks, so on /sign-in/email we still see `newSession` with `user.twoFactorEnabled`
// before the two-factor plugin replaces it with `twoFactorRedirect`.
// `ctx.context` is one object per dispatched request, shared by the before and after hooks;
// state captured in `before` (session about to be deleted, reset token about to be consumed)
// is keyed on it.

export type AuthKind = 'hub' | 'founder';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HookCtx = any;
type AuthDb = any;

type PreState = { userId?: string | null; sessionId?: string | null };

const VERIFY_PATHS = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);
const REVOKE_SCOPES: Record<string, 'one' | 'others' | 'all'> = {
  '/revoke-session': 'one',
  '/revoke-other-sessions': 'others',
  '/revoke-sessions': 'all',
};

export function createAuthAuditHooks(kind: AuthKind, db: AuthDb) {
  const pre = new WeakMap<object, PreState>();
  const targetType = kind === 'founder' ? 'founder_user' : 'user';

  async function write(
    ctx: HookCtx,
    e: {
      action: string;
      outcome: AuditOutcome;
      actorId?: string | null;
      system?: boolean;
      targetType?: AuditEvent['targetType'];
      targetId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const actorId = e.actorId ?? null;
    await writeAuditEvent(
      {
        category: kind === 'founder' ? 'founder' : 'identity',
        action: kind === 'founder' ? founderAction(e.action) : e.action,
        outcome: e.outcome,
        actorType: e.system
          ? 'system'
          : actorId
            ? kind === 'founder'
              ? 'founder'
              : 'user'
            : 'anonymous',
        actorId: e.system ? null : actorId,
        founderId: kind === 'founder' && !e.system ? actorId : null,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        metadata: e.metadata,
        ...requestInfo(ctx),
      },
      { mode: 'best_effort', connection: kind === 'founder' ? 'founder' : 'app' },
    );
  }

  /** Session (id + user) for the request: bearer header (Hub) or signed session cookie. */
  async function resolveSession(ctx: HookCtx): Promise<PreState> {
    let token: string | null = null;
    const auth: string | null = ctx.headers?.get?.('authorization') ?? null;
    if (auth?.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim().split('.')[0] || null;
    }
    if (!token) {
      const name = ctx.context.authCookies?.sessionToken?.name;
      const signed = name ? await ctx.getSignedCookie(name, ctx.context.secret) : null;
      token = typeof signed === 'string' ? signed : null;
    }
    if (!token) return {};
    const session = await db.session.findFirst({
      where: { token },
      select: { id: true, userId: true },
    });
    return session ? { userId: session.userId, sessionId: session.id } : {};
  }

  /** User behind a pending 2FA challenge (signed two_factor cookie → verification row). */
  async function resolveChallengeUser(ctx: HookCtx): Promise<string | null> {
    const cookie = ctx.context.createAuthCookie?.('two_factor');
    if (!cookie?.name) return null;
    const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (typeof identifier !== 'string') return null;
    const row = await db.verification.findFirst({ where: { identifier }, select: { value: true } });
    return row?.value ?? null;
  }

  async function before(ctx: HookCtx): Promise<void> {
    if (ctx.path === '/sign-out') {
      pre.set(ctx.context, await resolveSession(ctx));
    } else if (ctx.path === '/reset-password') {
      const token = ctx.body?.token ?? ctx.query?.token;
      if (typeof token === 'string' && token) {
        const row = await db.verification.findFirst({
          where: { identifier: `reset-password:${token}` },
          select: { value: true },
        });
        pre.set(ctx.context, { userId: row?.value ?? null });
      }
    }
  }

  /** E15 — called by the before hook right before it rejects trustDevice. */
  async function trustDeviceRejected(ctx: HookCtx): Promise<void> {
    const userId = (await resolveSession(ctx)).userId ?? (await resolveChallengeUser(ctx));
    await write(ctx, {
      action: AuditActions.twoFactorTrustDeviceRejected,
      outcome: 'denied',
      actorId: userId,
      targetType,
      targetId: userId,
      metadata: { path: ctx.path },
    });
  }

  /**
   * E6 — called by the after hook once the other sessions are deleted.
   * `failureReason` set → nothing was revoked (outcome failure, decision E6-a).
   */
  async function sessionsRevokedOn2faEnroll(
    ctx: HookCtx,
    userId: string,
    count: number,
    failureReason?: string,
  ): Promise<void> {
    await write(ctx, {
      action: AuditActions.sessionsRevokedOn2faEnroll,
      outcome: failureReason ? 'failure' : 'success',
      actorId: userId,
      targetType,
      targetId: userId,
      metadata: failureReason ? { count, reason: failureReason } : { count },
    });
  }

  async function after(ctx: HookCtx): Promise<void> {
    const path: string = ctx.path;
    const returned = ctx.context.returned;
    const failed = isAPIError(returned);
    const sessionUserId: string | null = ctx.context.session?.session?.userId ?? null;

    if (path === '/sign-in/email') {
      if (failed) {
        // E3 / TA.15: same row whether the email exists or not — no target, hashed email only
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        await write(ctx, {
          action: AuditActions.loginFailed,
          outcome: 'failure',
          metadata: { emailHash: email ? hashEmail(email) : null, errorCode: errorCode(returned) },
        });
        return;
      }
      const data = ctx.context.newSession;
      if (!data?.user?.id) return;
      if (data.user.twoFactorEnabled === true) {
        // E2: the two-factor plugin (runs after this hook) replaces the session with a challenge
        await write(ctx, {
          action: AuditActions.login2faRequired,
          outcome: 'success',
          actorId: data.user.id,
          targetType,
          targetId: data.user.id,
        });
      } else {
        await write(ctx, {
          action: AuditActions.loginSucceeded,
          outcome: 'success',
          actorId: data.user.id,
          targetType: 'session',
          targetId: data.session?.id ?? null,
          metadata: { method: 'password' },
        });
      }
      return;
    }

    if (path === '/sign-out') {
      const state = pre.get(ctx.context);
      if (failed || !state?.userId) return;
      await write(ctx, {
        action: AuditActions.logout,
        outcome: 'success',
        actorId: state.userId,
        targetType: 'session',
        targetId: state.sessionId ?? null,
      });
      return;
    }

    if (path in REVOKE_SCOPES) {
      if (failed || !sessionUserId) return;
      await write(ctx, {
        action: AuditActions.sessionRevoked,
        outcome: 'success',
        actorId: sessionUserId,
        targetType: path === '/revoke-session' ? 'session' : targetType,
        targetId: path === '/revoke-session' ? null : sessionUserId,
        metadata: { scope: REVOKE_SCOPES[path] },
      });
      return;
    }

    if (path === '/two-factor/enable') {
      if (failed || !sessionUserId) return;
      await write(ctx, {
        action: AuditActions.twoFactorEnrollStarted,
        outcome: 'success',
        actorId: sessionUserId,
        targetType,
        targetId: sessionUserId,
      });
      return;
    }

    if (VERIFY_PATHS.has(path)) {
      await afterVerify(ctx, path, returned, failed, sessionUserId);
      return;
    }

    if (path === '/two-factor/generate-backup-codes') {
      if (failed || !sessionUserId) return;
      await write(ctx, {
        action: AuditActions.twoFactorBackupCodesRegenerated,
        outcome: 'success',
        actorId: sessionUserId,
        targetType,
        targetId: sessionUserId,
      });
      return;
    }

    if (path === '/request-password-reset') {
      if (failed) return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
      const user = email
        ? await db.user.findFirst({
            where: { email: email.trim().toLowerCase() },
            select: { id: true },
          })
        : null;
      // E16: always anonymous; the target is recorded internally only (the response does not leak it)
      await write(ctx, {
        action: AuditActions.passwordResetRequested,
        outcome: 'success',
        targetType: user ? targetType : null,
        targetId: user?.id ?? null,
        metadata: { emailHash: email ? hashEmail(email) : null },
      });
      return;
    }

    if (path === '/reset-password') {
      const userId = pre.get(ctx.context)?.userId ?? null;
      if (failed) {
        await write(ctx, {
          action: AuditActions.passwordResetFailed,
          outcome: 'failure',
          metadata: { errorCode: errorCode(returned) },
        });
      } else {
        await write(ctx, {
          action: AuditActions.passwordResetCompleted,
          outcome: 'success',
          actorId: userId,
          targetType,
          targetId: userId,
        });
      }
      return;
    }

    if (path === '/change-password') {
      if (failed || !sessionUserId) return;
      await write(ctx, {
        action: AuditActions.passwordChanged,
        outcome: 'success',
        actorId: sessionUserId,
        targetType,
        targetId: sessionUserId,
        metadata: { revokeOtherSessions: ctx.body?.revokeOtherSessions === true },
      });
    }
  }

  async function afterVerify(
    ctx: HookCtx,
    path: string,
    returned: unknown,
    failed: boolean,
    sessionUserId: string | null,
  ): Promise<void> {
    const method = path === '/two-factor/verify-backup-code' ? 'backup' : 'totp';

    if (failed) {
      const userId = sessionUserId ?? (await resolveChallengeUser(ctx));
      if ((returned as { statusCode?: number }).statusCode === 429) {
        await write(ctx, {
          action: AuditActions.twoFactorAttemptWhileLocked,
          outcome: 'denied',
          actorId: userId,
          targetType,
          targetId: userId,
          metadata: { method },
        });
        return;
      }
      await write(ctx, {
        action: AuditActions.twoFactorVerifyFailed,
        outcome: 'failure',
        actorId: userId,
        targetType,
        targetId: userId,
        metadata: { method, errorCode: errorCode(returned) },
      });
      // E11: this failure spent the budget (accountLockout.maxFailedAttempts) and locked the account
      if (userId) {
        const row = await db.twoFactor.findFirst({
          where: { userId },
          select: { lockedUntil: true, failedVerificationCount: true },
        });
        if (row?.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
          await write(ctx, {
            action: AuditActions.twoFactorAccountLocked,
            outcome: 'success',
            system: true,
            targetType,
            targetId: userId,
            metadata: {
              lockedUntil: new Date(row.lockedUntil).toISOString(),
              failedAttempts: row.failedVerificationCount ?? null,
            },
          });
        }
      }
      return;
    }

    if (sessionUserId) {
      // Bearer / cookie session present: enrollment (verify-totp while 2FA not yet enabled)
      const sessionUser = ctx.context.session?.user;
      if (method === 'totp' && sessionUser?.twoFactorEnabled !== true) {
        await write(ctx, {
          action: AuditActions.twoFactorEnabled,
          outcome: 'success',
          actorId: sessionUserId,
          targetType,
          targetId: sessionUserId,
        });
      } else if (method === 'backup') {
        await write(ctx, {
          action: AuditActions.twoFactorBackupCodeUsed,
          outcome: 'success',
          actorId: sessionUserId,
          targetType,
          targetId: sessionUserId,
        });
      }
      return;
    }

    // Sign-in challenge completed: a session now exists (E1, plus E13 for a backup code)
    const userId: string | null = (returned as { user?: { id?: string } })?.user?.id ?? null;
    if (!userId) return;
    if (method === 'backup') {
      await write(ctx, {
        action: AuditActions.twoFactorBackupCodeUsed,
        outcome: 'success',
        actorId: userId,
        targetType,
        targetId: userId,
      });
    }
    await write(ctx, {
      action: AuditActions.loginSucceeded,
      outcome: 'success',
      actorId: userId,
      targetType,
      targetId: userId,
      metadata: { method },
    });
  }

  return { before, after, trustDeviceRejected, sessionsRevokedOn2faEnroll };
}

function errorCode(err: unknown): string | null {
  const body = (err as { body?: { code?: unknown } })?.body;
  return typeof body?.code === 'string' ? body.code : null;
}

/** Only fields present on the request; missing ones fall back to runWithRequestContext(). */
function requestInfo(ctx: HookCtx): Pick<AuditEvent, 'ip' | 'userAgent' | 'requestId'> {
  const headers: Headers | undefined = ctx.headers ?? ctx.request?.headers;
  const out: Pick<AuditEvent, 'ip' | 'userAgent' | 'requestId'> = {};
  const ip = headers?.get('x-forwarded-for');
  const userAgent = headers?.get('user-agent');
  const requestId = headers?.get('x-request-id');
  if (ip) out.ip = ip;
  if (userAgent) out.userAgent = userAgent;
  if (requestId) out.requestId = requestId;
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
