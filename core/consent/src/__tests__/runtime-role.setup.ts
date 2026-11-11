import { beforeAll } from 'vitest';
import { Client } from 'pg';
import { assertRuntimeRole } from '@ventora/db-kit';

/* The contracts run on app_runtime (NOINHERIT, no superuser), as in production: a connection with
   more rights would hide a missing SET LOCAL ROLE. Checks use DIRECT_URL (postgres). */
beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await assertRuntimeRole(client, 'app_runtime');
  } finally {
    await client.end();
  }
});
