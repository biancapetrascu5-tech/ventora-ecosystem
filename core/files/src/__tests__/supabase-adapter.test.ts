import { describe, expect, it } from 'vitest';
import { StorageNotConfiguredError, SupabaseStorageAdapter } from '../index';

/*
 * The Supabase adapter speaks the Storage HTTP API with fetch (no SDK, rule 3). Without a bucket
 * (the founder creates it, see the report), these tests check the requests it sends and how it
 * reads the answers; the real bucket is checked on staging, after it exists.
 */

const KEY = 'service-key-for-tests';
type Call = { url: string; init: RequestInit };

function adapter(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  const a = new SupabaseStorageAdapter(
    { url: 'https://proj.supabase.co', serviceKey: KEY, bucket: 'ventora-files' },
    async (url, init = {}) => {
      const call = { url, init };
      calls.push(call);
      return answer(call);
    },
  );
  return { a, calls };
}

const header = (call: Call, name: string) => new Headers(call.init.headers).get(name);

describe('SupabaseStorageAdapter', () => {
  it('reads its configuration only from server variables', () => {
    expect(() => SupabaseStorageAdapter.fromEnv({})).toThrow(StorageNotConfiguredError);
    expect(() =>
      SupabaseStorageAdapter.fromEnv({ SUPABASE_URL: 'https://p.supabase.co', FILES_BUCKET: 'b' }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(
      SupabaseStorageAdapter.fromEnv({
        SUPABASE_URL: 'https://p.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: KEY,
        FILES_BUCKET: 'b',
      }),
    ).toBeInstanceOf(SupabaseStorageAdapter);
  });

  it('a signed upload URL: POST upload/sign, the service key in the headers only', async () => {
    const { a, calls } = adapter(() =>
      Response.json({ url: '/object/upload/sign/ventora-files/org/file?token=abc' }),
    );
    const { url } = await a.signUpload('org/file', 'image/png');
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/upload/sign/ventora-files/org/file?token=abc',
    );
    expect(url).not.toContain(KEY);
    expect(calls[0]!.url).toBe(
      'https://proj.supabase.co/storage/v1/object/upload/sign/ventora-files/org/file',
    );
    expect(calls[0]!.init.method).toBe('POST');
    expect(header(calls[0]!, 'authorization')).toBe(`Bearer ${KEY}`);
    expect(header(calls[0]!, 'x-upsert')).toBe('false');
  });

  it('a signed download URL: POST sign with the expiry, the name as the download name', async () => {
    const { a, calls } = adapter(() =>
      Response.json({ signedURL: '/object/sign/ventora-files/org/file?token=xyz' }),
    );
    const url = await a.signDownload('org/file', 60, 'factură 1.pdf');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ expiresIn: 60 });
    expect(new URL(url).searchParams.get('download')).toBe('factură 1.pdf');
    expect(new URL(url).searchParams.get('token')).toBe('xyz');
    expect(url).not.toContain(KEY);
  });

  it('stat: the size from Content-Range and the first bytes, without reading the whole file', async () => {
    const head = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { a, calls } = adapter(
      () =>
        new Response(head, {
          status: 206,
          headers: { 'content-range': 'bytes 0-7/123456', 'content-length': '8' },
        }),
    );
    expect(await a.stat('org/file')).toEqual({ sizeBytes: 123456, head });
    expect(header(calls[0]!, 'range')).toBe('bytes=0-15');
    expect(calls[0]!.url).toContain('/object/authenticated/ventora-files/org/file');
  });

  it('stat: a missing object is null; a 200 without range support uses Content-Length', async () => {
    expect(await adapter(() => new Response('{}', { status: 404 })).a.stat('x/y')).toBeNull();
    const body = new Uint8Array(40).fill(7);
    const full = await adapter(
      () => new Response(body, { status: 200, headers: { 'content-length': '40' } }),
    ).a.stat('x/y');
    expect(full?.sizeBytes).toBe(40);
    expect(full?.head).toHaveLength(16);
  });

  it('read (C.4f): the whole object; missing → null; over the limit → refused', async () => {
    const body = new TextEncoder().encode('nume,telefon\nIon,0722\n');
    const { a, calls } = adapter(
      () => new Response(body, { status: 200, headers: { 'content-length': String(body.length) } }),
    );
    expect(await a.read('org/file', 1000)).toEqual(body);
    expect(calls[0]!.url).toContain('/object/authenticated/ventora-files/org/file');
    expect(header(calls[0]!, 'range')).toBeNull();
    expect(header(calls[0]!, 'authorization')).toBe(`Bearer ${KEY}`);
    expect(await adapter(() => new Response('{}', { status: 404 })).a.read('x/y', 10)).toBeNull();
    // a declared length over the limit, and a body that grows past it without one
    await expect(
      adapter(() => new Response(body, { headers: { 'content-length': '999999' } })).a.read(
        'x/y',
        100,
      ),
    ).rejects.toThrow(/too large/);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(60));
        c.enqueue(new Uint8Array(60));
        c.close();
      },
    });
    await expect(adapter(() => new Response(stream)).a.read('x/y', 100)).rejects.toThrow(
      /too large/,
    );
    await expect(
      adapter(() => new Response('boom', { status: 500 })).a.read('x/y', 100),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('remove: DELETE on the bucket with the key; a provider error is not swallowed', async () => {
    const { a, calls } = adapter(() => Response.json([]));
    await a.remove('org/file');
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ prefixes: ['org/file'] });
    const failing = adapter(() => new Response('boom', { status: 500 })).a;
    await expect(failing.remove('org/file')).rejects.toThrow(/HTTP 500/);
    await expect(failing.signUpload('org/file', 'image/png')).rejects.toThrow(/HTTP 500/);
  });
});
