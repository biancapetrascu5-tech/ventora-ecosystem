import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
 * Lot B.8 — the encryption of the health answers (D-B-14: „criptate”), in the application, with
 * node:crypto (no new package, no database extension). AES-256-GCM: a random 12-byte IV per value,
 * the 16-byte authentication tag; the stored value is `version (1) | iv (12) | tag (16) | data`.
 * The key is BOOKING_MEDICAL_KEY: 32 bytes, base64. Without it the health fields can't be used
 * (MedicalKeyMissing) — the database never sees a value in clear.
 */

const VERSION = 1;

export class MedicalKeyMissing extends Error {
  constructor() {
    super('BOOKING_MEDICAL_KEY is not set (32 bytes, base64)');
    this.name = 'MedicalKeyMissing';
  }
}

function key(): Buffer {
  const raw = process.env.BOOKING_MEDICAL_KEY;
  if (!raw) throw new MedicalKeyMissing();
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new MedicalKeyMissing();
  return k;
}

/** The answer (text) encrypted for storage. `aad` binds it to its client and field. */
export function encryptAnswer(value: string, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), data]);
}

/** The stored value back in clear; a value moved to another client or field fails (the AAD). */
export function decryptAnswer(stored: Buffer, aad: string): string {
  if (stored.length < 29 || stored[0] !== VERSION) throw new Error('unknown medical value format');
  const iv = stored.subarray(1, 13);
  const tag = stored.subarray(13, 29);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(29)), decipher.final()]).toString('utf8');
}
