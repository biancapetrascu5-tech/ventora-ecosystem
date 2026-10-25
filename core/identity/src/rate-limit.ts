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
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = await db.rateLimit.findUnique({ where: { key } });

  if (!existing) {
    await db.rateLimit.create({
      data: { key, count: 1, lastRequest: new Date(now) },
    });
    return { allowed: true };
  }

  const lastRequestMs = Number(existing.lastRequest);

  if (lastRequestMs + windowMs < now) {
    await db.rateLimit.update({
      where: { key },
      data: { count: 1, lastRequest: new Date(now) },
    });
    return { allowed: true };
  }

  if (existing.count >= maxAttempts) {
    const retryAfter = Math.ceil((lastRequestMs + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  if (opts.increment !== false) {
    await db.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 }, lastRequest: new Date(now) },
    });
  }

  return { allowed: true };
}
