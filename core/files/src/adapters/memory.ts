import type { StorageAdapter, StoredObject } from '../storage';

/*
 * Storage in memory, for the tests and local development without a bucket. It plays the part of
 * the provider: `put` is what the client's PUT to the signed upload URL does. The rules under
 * test (types, sizes, organizations, links) are in core/files, not here.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly removed: string[] = [];

  async signUpload(key: string): Promise<{ url: string }> {
    return { url: `memory://upload/${key}` };
  }

  async signDownload(key: string, expiresInSeconds: number): Promise<string> {
    return `memory://download/${key}?expiresIn=${expiresInSeconds}`;
  }

  /** The client's upload: whatever bytes it sends, with whatever type it claims. */
  put(key: string, bytes: Uint8Array, contentType = 'application/octet-stream'): void {
    this.objects.set(key, { bytes, contentType });
  }

  async stat(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return { sizeBytes: object.bytes.length, head: object.bytes.subarray(0, 16) };
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    if (object.bytes.length > maxBytes) throw new Error('[files] storage read: object too large');
    return object.bytes.slice();
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
    this.removed.push(key);
  }
}
