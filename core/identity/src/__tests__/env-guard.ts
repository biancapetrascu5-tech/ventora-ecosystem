// Tests that depend on an optional connection string use `itWithEnv`.
// Locally a missing variable shows up as "skipped" in the Vitest report (never as a green
// test without assertions). In CI (CI=true) the test is never skipped: `requireTestEnv`
// throws, so a missing variable fails the run.

export function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === 'true';
}

/** true → the test must be skipped (variable missing and not in CI). */
export function shouldSkipForEnv(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return !env[name] && !isCi(env);
}

/** Returns the variable; throws when it is missing (reached only in CI or when misused). */
export function requireTestEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`[env-guard] ${name} lipsește${isCi(env) ? ' în CI (eșec, nu skip)' : ''}`);
  }
  return value;
}
