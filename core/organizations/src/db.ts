import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient as OrgBaseClient } from '../generated/organizations-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function validateRole(role: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(`[organizations] Invalid role: "${role}"`);
  }
  return role;
}

// Prevents double-wrapping when we're already inside our own $transaction
const _inRoleTx = new AsyncLocalStorage<boolean>();

export function makeOrgClient(connectionString: string): OrgBaseClient {
  const safeRole = validateRole('org_rw');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  const base = new OrgBaseClient({ adapter: new PrismaPg(pool) });
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
  // Proxy intercepts $transaction so multi-step writes run with SET LOCAL ROLE inside one atomic transaction.
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
  }) as unknown as OrgBaseClient;
}

let _orgDb: OrgBaseClient | undefined;

export function getOrgDb(): OrgBaseClient {
  if (!_orgDb) {
    _orgDb = makeOrgClient(process.env.DATABASE_URL!);
  }
  return _orgDb;
}
