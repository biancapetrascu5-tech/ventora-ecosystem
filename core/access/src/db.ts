import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient as AccessBaseClient } from '../generated/access-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const _inRoleTx = new AsyncLocalStorage<boolean>();

// Raw queries called on the client itself (not on a transaction) would run as the login role
// (app_runtime, NOINHERIT), which has no rights of its own: they get the same one-statement
// transaction with SET LOCAL ROLE as the model operations.
const RAW_METHODS = new Set<PropertyKey>([
  '$queryRaw',
  '$executeRaw',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
]);

export function makeAccessClient(connectionString: string): AccessBaseClient {
  const safeRole = 'access_rw';
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  const base = new AccessBaseClient({ adapter: new PrismaPg(pool) });
  // Model operations outside a transaction run under access_rw too, like the other modules.
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (_inRoleTx.getStore()) return query(args);
          return _inRoleTx.run(true, () =>
            base.$transaction(async (tx) => {
              await (tx as any).$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
              return (tx as any)[model][operation](args);
            }),
          );
        },
      },
    },
  });

  return new Proxy(extended as any, {
    get(target: any, prop: PropertyKey) {
      if (RAW_METHODS.has(prop) && !_inRoleTx.getStore()) {
        return (...args: unknown[]) =>
          _inRoleTx.run(true, () =>
            target.$transaction(async (tx: any) => {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
              return tx[prop](...args);
            }),
          );
      }
      if (prop !== '$transaction') return target[prop];

      return async (fn: (tx: any) => Promise<any>, opts?: any) => {
        if (_inRoleTx.getStore()) return target.$transaction(fn, opts);
        return _inRoleTx.run(true, () =>
          target.$transaction(async (tx: any) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${safeRole}`);
            return fn(tx);
          }, opts),
        );
      };
    },
  }) as AccessBaseClient;
}

let _accessDb: AccessBaseClient | undefined;
export function getAccessDb(): AccessBaseClient {
  if (!_accessDb) _accessDb = makeAccessClient(process.env.DATABASE_URL!);
  return _accessDb;
}
