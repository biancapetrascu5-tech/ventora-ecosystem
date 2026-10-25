import { PrismaClient as IdentityClient } from '../generated/identity-client';
import { PrismaClient as FounderClient } from '../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let _identityDb: IdentityClient | undefined;
let _founderDb: FounderClient | undefined;

export function getIdentityDb(): IdentityClient {
  if (!_identityDb) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    _identityDb = new IdentityClient({ adapter });
  }
  return _identityDb;
}

export function getFounderDb(): FounderClient {
  if (!_founderDb) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_FOUNDER });
    const adapter = new PrismaPg(pool);
    _founderDb = new FounderClient({ adapter });
  }
  return _founderDb;
}
