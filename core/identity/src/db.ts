import { PrismaClient as IdentityClient } from '../generated/identity-client';
import { PrismaClient as FounderClient } from '../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolClient, PoolConfig } from 'pg';

export class RoleAwarePool extends Pool {
  private readonly _role: string;

  constructor(config: PoolConfig, role: string) {
    super(config);
    this._role = role;
  }

  async connect(): Promise<PoolClient> {
    const client = await super.connect();
    try {
      await client.query(`SET ROLE ${this._role}`);
      return client;
    } catch (err) {
      client.release();
      throw err;
    }
  }
}

let _identityDb: IdentityClient | undefined;
let _founderDb: FounderClient | undefined;

export function getIdentityDb(): IdentityClient {
  if (!_identityDb) {
    const pool = new RoleAwarePool(
      { connectionString: process.env.DATABASE_URL! },
      'identity_rw',
    );
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
