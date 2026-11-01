import { StorageNotConfiguredError, type StorageAdapter, type StoredObject } from '../storage';

/*
 * Supabase Storage through its HTTP API (D4-16), with `fetch` only: no SDK package (rule 3). The
 * calls are the documented Storage endpoints:
 *   POST   /storage/v1/object/upload/sign/<bucket>/<key>  → a signed upload URL (PUT)
 *   POST   /storage/v1/object/sign/<bucket>/<key>         → a signed download URL
 *   GET    /storage/v1/object/authenticated/<bucket>/<key> with Range → size and first bytes
 *   DELETE /storage/v1/object/<bucket>                      → remove
 * Server side, with the service key (SUPABASE_SERVICE_ROLE_KEY). The bucket is private and is
 * created by the founder (see the Lot 4.7 report); this code never creates buckets.
 */

const HEAD_BYTES = 16;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(
    private readonly config: { url: string; serviceKey: string; bucket: string },
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env): SupabaseStorageAdapter {
    const url = env.SUPABASE_URL?.trim();
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const bucket = env.FILES_BUCKET?.trim();
    if (!url) throw new StorageNotConfiguredError('SUPABASE_URL');
    if (!serviceKey) throw new StorageNotConfiguredError('SUPABASE_SERVICE_ROLE_KEY');
    if (!bucket) throw new StorageNotConfiguredError('FILES_BUCKET');
    return new SupabaseStorageAdapter({ url: url.replace(/\/+$/, ''), serviceKey, bucket });
  }

  private api(path: string): string {
    return `${this.config.url}/storage/v1${path}`;
  }

  private object(key: string): string {
    return `${encodeURIComponent(this.config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.serviceKey}`,
      apikey: this.config.serviceKey,
      ...extra,
    };
  }

  private async fail(what: string, res: Response): Promise<never> {
    // the provider's message, never the key or the URL with its token
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`[files] storage ${what} failed: HTTP ${res.status} ${detail}`);
  }

  async signUpload(key: string, contentType: string): Promise<{ url: string }> {
    const res = await this.fetchImpl(this.api(`/object/upload/sign/${this.object(key)}`), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', 'x-upsert': 'false' }),
      body: JSON.stringify({ contentType }),
    });
    if (!res.ok) return this.fail('signUpload', res);
    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new Error('[files] storage signUpload: no url in the answer');
    return { url: this.api(body.url) };
  }

  async signDownload(key: string, expiresInSeconds: number, downloadName: string): Promise<string> {
    const res = await this.fetchImpl(this.api(`/object/sign/${this.object(key)}`), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) return this.fail('signDownload', res);
    const body = (await res.json()) as { signedURL?: string };
    if (!body.signedURL)
      throw new Error('[files] storage signDownload: no signedURL in the answer');
    const url = new URL(this.api(body.signedURL));
    url.searchParams.set('download', downloadName);
    return url.toString();
  }

  async stat(key: string): Promise<StoredObject | null> {
    const res = await this.fetchImpl(this.api(`/object/authenticated/${this.object(key)}`), {
      method: 'GET',
      headers: this.headers({ range: `bytes=0-${HEAD_BYTES - 1}` }),
    });
    if (res.status === 400 || res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) return this.fail('stat', res);
    // 206: „bytes 0-15/<total>”; 200 (no range support): the whole object, its length
    const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    const length = Number(res.headers.get('content-length') ?? NaN);
    const sizeBytes = range ? Number(range[1]) : length;
    if (!Number.isFinite(sizeBytes)) {
      await res.body?.cancel();
      throw new Error('[files] storage stat: no size in the answer');
    }
    const head = await readHead(res, HEAD_BYTES);
    return { sizeBytes, head };
  }

  async remove(key: string): Promise<void> {
    const res = await this.fetchImpl(
      this.api(`/object/${encodeURIComponent(this.config.bucket)}`),
      {
        method: 'DELETE',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefixes: [key] }),
      },
    );
    if (!res.ok) return this.fail('remove', res);
  }
}

/** The first `n` bytes of the body, without reading the rest (a 200 may be the whole file). */
async function readHead(res: Response, n: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const out = new Uint8Array(n);
  let filled = 0;
  try {
    while (filled < n) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, n - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out.subarray(0, filled);
}
