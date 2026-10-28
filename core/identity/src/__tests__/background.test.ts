import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFounderAuthOptions, createHubAuthOptions } from '../auth-options';
import { setAuthBackgroundTaskHandler } from '../background';

// B-6: the production options hand Better Auth's background work (the reset email) to the
// handler the app injects — Next's after() in the auth route.
afterEach(() => setAuthBackgroundTaskHandler(() => {}));

describe('auth background tasks', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = {} as any;

  for (const [name, options] of [
    ['hub', () => createHubAuthOptions(db, 'x'.repeat(32))],
    ['founder', () => createFounderAuthOptions(db, 'x'.repeat(32))],
  ] as const) {
    it(`${name}: backgroundTasks delegates to the injected handler`, () => {
      const injected = vi.fn();
      setAuthBackgroundTaskHandler(injected);
      const task = Promise.resolve('sent');
      options().advanced.backgroundTasks.handler(task);
      expect(injected).toHaveBeenCalledWith(task);
    });
  }
});
