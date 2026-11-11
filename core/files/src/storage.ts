/*
 * The storage behind the files (D4-16 = a: Supabase Storage, EU region; one private bucket per
 * environment). The modules never call the provider: they go through this adapter, like the
 * e-mail. The service key is read only here, on the server (never a NEXT_PUBLIC_ variable).
 */

export interface StoredObject {
  /** The real size in storage. */
  sizeBytes: number;
  /** The first bytes (at least 16 when the object has them), to check the real type. */
  head: Uint8Array;
}

export interface StorageAdapter {
  /** A URL the client uploads the bytes to (PUT), valid for a limited time. */
  signUpload(key: string, contentType: string): Promise<{ url: string }>;
  /** A URL that serves the object for `expiresInSeconds`. */
  signDownload(key: string, expiresInSeconds: number, downloadName: string): Promise<string>;
  /** What is really stored at `key`, or null when nothing is. */
  stat(key: string): Promise<StoredObject | null>;
  /**
   * C.4f: the whole object, for a job on the server (the ClientDesk import reads its CSV), or
   * null when nothing is stored. More than `maxBytes` is refused without reading the rest.
   */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  readonly code = 'STORAGE_NOT_CONFIGURED';
  constructor(missing: string) {
    super(`[files] the storage is not configured: ${missing}`);
    this.name = 'StorageNotConfiguredError';
  }
}

let _adapter: StorageAdapter | null = null;

/** Tests and the app set the adapter; otherwise it is built from the environment. */
export function setStorageAdapter(adapter: StorageAdapter | null): void {
  _adapter = adapter;
}

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (_adapter) return _adapter;
  const { SupabaseStorageAdapter } = await import('./adapters/supabase');
  _adapter = SupabaseStorageAdapter.fromEnv();
  return _adapter;
}
