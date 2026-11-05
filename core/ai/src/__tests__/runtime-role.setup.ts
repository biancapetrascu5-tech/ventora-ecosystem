import { beforeAll } from 'vitest';
import { Client } from 'pg';
import { assertRuntimeRole } from '@ventora/db-kit';

// The checks run on the production runtime roles (NOINHERIT, no superuser): a connection with
// more rights would hide a missing SET LOCAL ROLE. Fixtures use DIRECT_URL (postgres).
async function check(url: string | undefined, role: 'app_runtime' | 'founder_runtime') {
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await assertRuntimeRole(client, role);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await check(process.env.DATABASE_URL, 'app_runtime');
  await check(process.env.DATABASE_URL_FOUNDER, 'founder_runtime');
});
