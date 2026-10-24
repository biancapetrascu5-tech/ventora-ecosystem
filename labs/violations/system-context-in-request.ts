// VIOLATION: no-restricted-syntax (withSystemContext)
// Proves the withSystemContext guard works: forbidden in request handlers.
declare function withSystemContext(reason: string): void;
export function GET() {
  withSystemContext('bypass');
  return new Response('ok');
}
