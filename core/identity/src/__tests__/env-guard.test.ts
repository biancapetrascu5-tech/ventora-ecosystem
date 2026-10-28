import { describe, expect, it } from 'vitest';
import { isCi, requireTestEnv, shouldSkipForEnv } from './env-guard';

describe('env-guard — optional test variables', () => {
  it('local, variable missing → skip', () => {
    expect(shouldSkipForEnv('X_URL', {})).toBe(true);
  });

  it('local, variable present → run', () => {
    expect(shouldSkipForEnv('X_URL', { X_URL: 'postgresql://x' })).toBe(false);
  });

  it('CI, variable missing → not skipped, requireTestEnv throws (failure, not skip)', () => {
    const env = { CI: 'true' };
    expect(isCi(env)).toBe(true);
    expect(shouldSkipForEnv('X_URL', env)).toBe(false);
    expect(() => requireTestEnv('X_URL', env)).toThrow(/X_URL lipsește în CI/);
  });

  it('CI, variable present → value returned', () => {
    expect(requireTestEnv('X_URL', { CI: 'true', X_URL: 'postgresql://x' })).toBe('postgresql://x');
  });
});
