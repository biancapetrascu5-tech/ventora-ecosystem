import { createInterface } from 'readline';
import { Writable } from 'stream';
import { makeFounderClient } from '../src/db';
import { bootstrapFounderAccount } from '../src/bootstrap-founder';

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

  // founder_runtime (NOINHERIT) has no rights of its own: like the Founder app, every query runs
  // under SET LOCAL ROLE founder_identity_rw (ARCHITECTURE §12.3).
  const db = makeFounderClient(dbUrl);

  try {
    if ((await db.user.count({ where: { revokedAt: null } })) > 0) {
      console.error('Aborted: an active Founder account already exists.');
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

    const created = await bootstrapFounderAccount(db, secret, { name, email, password });
    if ('refused' in created) {
      console.error('Aborted: an active Founder account already exists.');
      process.exit(1);
    }

    console.log(`Founder account created: ${email}`);
    console.log('Enable 2FA on first login.');
  } finally {
    await db.$disconnect();
  }
}

// makeFounderClient keeps its pool private: exit explicitly instead of waiting for idle sockets.
main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : 'Unexpected error');
    process.exit(1);
  },
);
