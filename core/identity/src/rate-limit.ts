import { getIdentityDb } from './db';

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  key: string,
  maxAttempts = MAX_ATTEMPTS,
  windowSeconds = WINDOW_SECONDS,
  opts: { increment?: boolean } = { increment: true },
): Promise<RateLimitResult> {
  const db = getIdentityDb();
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  const record = await db.rateLimit.upsert({
    where: { key },
    update: {
      attempts: opts.increment ? { increment: 1 } : undefined,
    },
    create: {
      key,
      attempts: 1,
      resetAt,
    },
  });

  if (record.resetAt < now) {
    await db.rateLimit.update({
      where: { key },
      data: { attempts: 1, resetAt },
    });
    return { allowed: true };
  }

  if (record.attempts > maxAttempts) {
    const retryAfter = Math.ceil((record.resetAt.getTime() - now.getTime()) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}
