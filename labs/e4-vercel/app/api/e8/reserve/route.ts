import { reserveQuota } from '../_quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    orgId: string;
    metric: string;
    amount: number;
    operationId: string;
    ttlSeconds?: number;
  };

  const t0 = performance.now();
  const result = await reserveQuota(
    body.orgId,
    body.metric,
    body.amount,
    body.operationId,
    body.ttlSeconds ?? 300,
  );
  const ms = performance.now() - t0;

  const status = result.ok ? 200 : 409;
  return Response.json({ ...result, ms }, { status });
}
