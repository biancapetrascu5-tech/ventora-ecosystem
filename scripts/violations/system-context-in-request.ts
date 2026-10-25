// Violation: withSystemContext used inside a request handler.
// Expected: no-restricted-syntax [no-system-context-in-request] error.
declare function withSystemContext<T>(fn: () => T): T;

export async function handler(_req: unknown) {
  return withSystemContext(() => ({ ok: true }));
}
