import { describe, expect, it, vi } from 'vitest';
import { revokeOtherSessionsOn2faEnroll } from '../auth-options';

// E6-a (Lot 2.5b): the branches the HTTP tests cannot reach — Better Auth always sets
// newSession on enrollment, so its absence is simulated here.
function setup(newSession: unknown) {
  const deleteMany = vi.fn(async () => ({ count: 3 }));
  const sessionsRevokedOn2faEnroll = vi.fn(async () => {});
  const ctx = {
    path: '/two-factor/verify-totp',
    context: {
      returned: { status: true },
      session: { session: { id: 'old', userId: 'u1' }, user: { twoFactorEnabled: false } },
      newSession,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audit = { sessionsRevokedOn2faEnroll } as any;
  return { ctx, db: { session: { deleteMany } }, audit, deleteMany, sessionsRevokedOn2faEnroll };
}

describe('revokeOtherSessionsOn2faEnroll', () => {
  it('keeps the new session and revokes the rest', async () => {
    const s = setup({ session: { id: 'new' }, user: { id: 'u1' } });
    await revokeOtherSessionsOn2faEnroll(s.ctx, s.db, s.audit);
    expect(s.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 'new' } } });
    expect(s.sessionsRevokedOn2faEnroll).toHaveBeenCalledWith(s.ctx, 'u1', 3);
  });

  it('without a new session: revokes nothing and audits a failure', async () => {
    const s = setup(null);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await revokeOtherSessionsOn2faEnroll(s.ctx, s.db, s.audit);
    spy.mockRestore();
    expect(s.deleteMany).not.toHaveBeenCalled();
    expect(s.sessionsRevokedOn2faEnroll).toHaveBeenCalledWith(s.ctx, 'u1', 0, 'no_new_session');
  });

  it('a new session for another user is not trusted', async () => {
    const s = setup({ session: { id: 'new' }, user: { id: 'someone-else' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await revokeOtherSessionsOn2faEnroll(s.ctx, s.db, s.audit);
    spy.mockRestore();
    expect(s.deleteMany).not.toHaveBeenCalled();
  });

  it('does nothing outside enrollment (2FA already on, or failed verify)', async () => {
    const already = setup({ session: { id: 'new' }, user: { id: 'u1' } });
    already.ctx.context.session.user.twoFactorEnabled = true;
    await revokeOtherSessionsOn2faEnroll(already.ctx, already.db, already.audit);
    expect(already.deleteMany).not.toHaveBeenCalled();

    const otherPath = setup({ session: { id: 'new' }, user: { id: 'u1' } });
    otherPath.ctx.path = '/two-factor/verify-backup-code';
    await revokeOtherSessionsOn2faEnroll(otherPath.ctx, otherPath.db, otherPath.audit);
    expect(otherPath.deleteMany).not.toHaveBeenCalled();
  });
});
