import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient as AccessBaseClient } from '../generated/access-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const _inRoleTx = new AsyncLocalStorage<boolean>();

export function makeAccessClient(connectionString: string): AccessBaseClient {
  const safeRole = 'access_rw';
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  const base = new AccessBaseClient({ adapter: new PrismaPg(pool) });

  return new Proxy(base, {
    get(target, prop) {
      if (prop !== '$transaction') return (target as any)[prop];

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
