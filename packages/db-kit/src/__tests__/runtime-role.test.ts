import { describe, expect, it } from 'vitest';
import { assertRuntimeRole, NotARuntimeRoleError } from '../runtime-role';

const client = (row: Record<string, unknown> | undefined) => ({
  query: async () => ({ rows: row ? [row] : [] }),
});
const runtime = { role: 'app_runtime', rolsuper: false, rolinherit: false, rolbypassrls: false };

describe('assertRuntimeRole', () => {
  it('accepts the runtime role: NOINHERIT, not superuser, no BYPASSRLS', async () => {
    await expect(assertRuntimeRole(client(runtime), 'app_runtime')).resolves.toBeUndefined();
  });

  it('refuses an admin connection', async () => {
    const admin = { role: 'postgres', rolsuper: true, rolinherit: true, rolbypassrls: true };
    await expect(assertRuntimeRole(client(admin), 'app_runtime')).rejects.toThrow(
      /connected as "postgres", expected "app_runtime"; superuser; INHERIT .*; BYPASSRLS/,
    );
  });

  it('refuses the right name with INHERIT, and the wrong runtime role', async () => {
    await expect(
      assertRuntimeRole(client({ ...runtime, rolinherit: true }), 'app_runtime'),
    ).rejects.toBeInstanceOf(NotARuntimeRoleError);
    await expect(assertRuntimeRole(client(runtime), 'founder_runtime')).rejects.toThrow(
      /expected "founder_runtime"/,
    );
  });

  it('refuses when current_user is missing', async () => {
    await expect(assertRuntimeRole(client(undefined), 'app_runtime')).rejects.toThrow(/not found/);
  });
});
