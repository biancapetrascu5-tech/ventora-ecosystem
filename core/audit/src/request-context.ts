import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

const _requestContext = new AsyncLocalStorage<AuditRequestContext>();

/**
 * Set by the route handler around a request so contracts keep their signatures:
 * every audit row written inside `fn` gets ip / user_agent / request_id.
 * Without a context (system jobs) those columns stay NULL.
 */
export function runWithRequestContext<T>(ctx: AuditRequestContext, fn: () => T): T {
  return _requestContext.run(ctx, fn);
}

export function getRequestContext(): AuditRequestContext | undefined {
  return _requestContext.getStore();
}
