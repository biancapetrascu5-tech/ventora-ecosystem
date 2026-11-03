import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import {
  ATTACHMENT_RETENTION_DAYS,
  MAX_FILE_BYTES,
  checkDeclaredFile,
  cleanFileName,
  sniffContentType,
} from '../index';
import { checkOwner, checkStoredFile } from '../policy';

export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
export const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
export const PDF = new TextEncoder().encode('%PDF-1.7\n');

describe('D4-17: PNG, JPG or PDF, up to 10 MB', () => {
  it('the declared type and size are checked before any link', () => {
    expect(() => checkDeclaredFile({ contentType: 'image/png', sizeBytes: 1 })).not.toThrow();
    expect(() =>
      checkDeclaredFile({ contentType: 'application/pdf', sizeBytes: MAX_FILE_BYTES }),
    ).not.toThrow();
    for (const contentType of ['image/gif', 'image/svg+xml', 'text/html', 'application/zip', '']) {
      expect(() => checkDeclaredFile({ contentType, sizeBytes: 10 })).toThrow(InvalidInput);
    }
    expect(() =>
      checkDeclaredFile({ contentType: 'image/png', sizeBytes: MAX_FILE_BYTES + 1 }),
    ).toThrow(/10 MB/);
    expect(() => checkDeclaredFile({ contentType: 'image/png', sizeBytes: 0 })).toThrow();
    expect(() => checkDeclaredFile({ contentType: 'image/png', sizeBytes: 1.5 })).toThrow();
  });

  it('the real type comes from the first bytes, not from the name or the declared type', () => {
    expect(sniffContentType(PNG)).toBe('image/png');
    expect(sniffContentType(JPG)).toBe('image/jpeg');
    expect(sniffContentType(PDF)).toBe('application/pdf');
    expect(sniffContentType(new TextEncoder().encode('<html><script>'))).toBeNull();
    expect(sniffContentType(new Uint8Array())).toBeNull();
  });

  it('what is stored must be what was declared', () => {
    const declared = { contentType: 'image/png', sizeBytes: PNG.length };
    expect(checkStoredFile(declared, { sizeBytes: PNG.length, head: PNG })).toBeNull();
    expect(checkStoredFile(declared, { sizeBytes: 0, head: new Uint8Array() })).toBe('missing');
    expect(checkStoredFile(declared, { sizeBytes: MAX_FILE_BYTES + 1, head: PNG })).toBe(
      'too_large',
    );
    expect(checkStoredFile(declared, { sizeBytes: PNG.length + 1, head: PNG })).toBe(
      'size_mismatch',
    );
    // an HTML page named .png, declared as a PNG
    const html = new TextEncoder().encode('<html><body>hi');
    expect(
      checkStoredFile(
        { contentType: 'image/png', sizeBytes: html.length },
        {
          sizeBytes: html.length,
          head: html,
        },
      ),
    ).toBe('type_mismatch');
  });
});

describe('names, owners, retention', () => {
  it('the name loses any path and control characters; it never builds the storage key', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\Users\\x\\factura.pdf')).toBe('factura.pdf');
    expect(cleanFileName('a\u0000b\nc.png')).toBe('abc.png');
    expect(cleanFileName('x'.repeat(300))).toHaveLength(255);
    expect(() => cleanFileName('..')).toThrow(InvalidInput);
    expect(() => cleanFileName('  ')).toThrow(InvalidInput);
  });

  it('the owner is a module, a resource type and an id', () => {
    expect(() =>
      checkOwner({ module: 'support', resourceType: 'ticket', resourceId: 'abc-1' }),
    ).not.toThrow();
    expect(() =>
      checkOwner({ module: 'Support', resourceType: 'ticket', resourceId: 'x' }),
    ).toThrow();
    expect(() =>
      checkOwner({ module: 'support', resourceType: 'ticket', resourceId: '' }),
    ).toThrow();
    expect(() =>
      checkOwner({ module: 'support', resourceType: 'ticket', resourceId: 'a/b' }),
    ).toThrow();
  });

  it('D4-18: no provisional retention for attachments, so nothing is deleted automatically', () => {
    expect(ATTACHMENT_RETENTION_DAYS).toBeNull();
  });
});
