import { PrismaClient as IdentityClient } from '../generated/identity-client';
import { PrismaClient as FounderClient } from '../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolClient, PoolConfig } from 'pg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DoneFn = (release?: any) => void;
type ConnectCb = (err: Error | undefined, client: PoolClient | undefined, done: DoneFn) => void;

export class RoleAwarePool extends Pool {
  private readonly _role: string;

  constructor(config: PoolConfig, role: string) {
    super(config);
    this._role = role;
  }

  connect(): Promise<PoolClient>;
  connect(callback: ConnectCb): void;
  connect(callback?: ConnectCb): Promise<PoolClient> | void {
    const role = this._role;
    if (callback) {
      // pg.Pool.query() calls this.connect(cb) — must honour the callback contract
      super.connect(function (
        err: Error | undefined,
        client: PoolClient | undefined,
        done: DoneFn,
      ) {
        if (err || !client) {
          callback(err, client, done);
          return;
        }
        client.query(`SET ROLE ${role}`, function (roleErr) {
          if (roleErr) {
            client.release();
            callback(roleErr as Error, undefined, done);
            return;
          }
          callback(undefined, client, done);
        });
      });
      return;
    }
    return (async () => {
      const client = await super.connect();
      try {
        await client.query(`SET ROLE ${role}`);
        return client;
      } catch (err) {
        client.release();
        throw err;
      }
    })();
  }
}

let _identityDb: IdentityClient | undefined;
let _founderDb: FounderClient | undefined;

export function getIdentityDb(): IdentityClient {
  if (!_identityDb) {
    const pool = new RoleAwarePool({ connectionString: process.env.DATABASE_URL! }, 'identity_rw');
    _identityDb = new IdentityClient({ adapter: new PrismaPg(pool) });
  }
  return _identityDb;
}

export function getFounderDb(): FounderClient {
  if (!_founderDb) {
    const pool = new RoleAwarePool(
      { connectionString: process.env.DATABASE_URL_FOUNDER! },
      'founder_identity_rw',
    );
    _founderDb = new FounderClient({ adapter: new PrismaPg(pool) });
  }
  return _founderDb;
}
