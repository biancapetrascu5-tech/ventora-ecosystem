import { createInterface } from 'readline';
import { Writable } from 'stream';
import { PrismaClient } from '../generated/founder-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptPassword(): Promise<string> {
  const silent = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
  process.stdout.write('Password: ');
  return new Promise<string>((resolve) => {
    rl.once('line', (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_FOUNDER;
  const secret = process.env.FOUNDER_AUTH_SECRET;

  if (!dbUrl || !secret) {
    console.error('DATABASE_URL_FOUNDER and FOUNDER_AUTH_SECRET are required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const activeCount = await db.user.count({ where: { revokedAt: null } });
    if (activeCount > 0) {
      console.error(`Aborted: ${activeCount} active Founder account(s) already exist.`);
      process.exit(1);
    }

    console.log('Creating first Founder account.');
    const name = await promptLine('Name: ');
    const email = await promptLine('Email: ');
    const password = await promptPassword();

    if (!name || !email || !password) {
      console.error('All fields are required.');
      process.exit(1);
    }

    const auth = betterAuth({
      secret,
      database: prismaAdapter(db, { provider: 'postgresql' }),
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      session: { expiresIn: 8 * 60 * 60, cookieCache: { enabled: false } },
      advanced: { crossSubDomainCookies: { enabled: false } },
    });

    await auth.api.signUpEmail({ body: { name, email, password } });

    console.log(`Founder account created: ${email}`);
    console.log('Enable 2FA on first login.');
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Unexpected error');
  process.exit(1);
});
