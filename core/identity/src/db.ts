import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient as IdentityBaseClient } from '../generated/identity-client';
import { PrismaClient as FounderBaseClient } from '../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function validateRole(role: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(`[identity] Invalid role: "${role}"`);
  }
  return role;
}

// Prevents double-wrapping when we're already inside our own $transaction
const _inRoleTx = new AsyncLocalStorage<boolean>();

export function makeIdentityClient(connectionString: string): IdentityBaseClient {
  const safeRole = validateRole('identity_rw');
  // max: 1 because connection_limit in the URL controls pgbouncer, not this pool.
  // On Vercel each function invocation is its own process; a small cap keeps
  // concurrent connections within Supabase staging limits (60 direct / 200 pooler).
  const pool = new Pool({ connectionString, max: 1 });
  const base = new IdentityBaseClient({ adapter: new PrismaPg(pool) });
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (_inRoleTx.getStore()) return query(args);
          return _inRoleTx.run(true, () =>
            base.$transaction(async (tx) => {
              // SET LOCAL ROLE scopes the role to this transaction only — safe for PgBouncer transaction pooler
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (tx as any).$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (tx as any)[model][operation](args);
            }),
          );
        },
      },
    },
  });
  // Proxy intercepts $transaction so Better Auth's multi-step writes (user+account)
  // run with SET LOCAL ROLE inside one atomic transaction instead of separate ones.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(extended as any, {
    get(target: any, prop: PropertyKey) {
      if (prop === '$transaction') {
        return function (fn: unknown, opts?: unknown) {
          if (typeof fn !== 'function') {
            return target.$transaction(fn, opts);
          }
          return target.$transaction(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tx: any) =>
              _inRoleTx.run(true, async () => {
                await tx.$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
                return (fn as (tx: unknown) => unknown)(tx);
              }),
            opts,
          );
        };
      }
      return target[prop];
    },
  }) as unknown as IdentityBaseClient;
}

export function makeFounderClient(connectionString: string): FounderBaseClient {
  const safeRole = validateRole('founder_identity_rw');
  const pool = new Pool({ connectionString, max: 1 });
  const base = new FounderBaseClient({ adapter: new PrismaPg(pool) });
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (_inRoleTx.getStore()) return query(args);
          return _inRoleTx.run(true, () =>
            base.$transaction(async (tx) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (tx as any).$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (tx as any)[model][operation](args);
            }),
          );
        },
      },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(extended as any, {
    get(target: any, prop: PropertyKey) {
      if (prop === '$transaction') {
        return function (fn: unknown, opts?: unknown) {
          if (typeof fn !== 'function') {
            return target.$transaction(fn, opts);
          }
          return target.$transaction(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tx: any) =>
              _inRoleTx.run(true, async () => {
                await tx.$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
                return (fn as (tx: unknown) => unknown)(tx);
              }),
            opts,
          );
        };
      }
      return target[prop];
    },
  }) as unknown as FounderBaseClient;
}

let _identityDb: IdentityBaseClient | undefined;
let _founderDb: FounderBaseClient | undefined;

export function getIdentityDb(): IdentityBaseClient {
  if (!_identityDb) {
    _identityDb = makeIdentityClient(process.env.DATABASE_URL!);
  }
  return _identityDb;
}

export function getFounderDb(): FounderBaseClient {
  if (!_founderDb) {
    _founderDb = makeFounderClient(process.env.DATABASE_URL_FOUNDER!);
  }
  return _founderDb;
}
