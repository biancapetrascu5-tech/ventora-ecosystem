import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import {
  ATTACHMENT_RETENTION_DAYS,
  MAX_FILE_BYTES,
  checkDeclaredFile,
  cleanFileName,
  sniffContentType,
} from '../index';
import { checkOwner, checkStoredFile, mayKeepCsv } from '../policy';

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

describe('C.4e: a CSV, only for the ClientDesk import', () => {
  const IMPORT = { module: 'crm', resourceType: 'import' };
  const enc = (text: string) => new TextEncoder().encode(text);

  it('text/csv is declared only with the crm / import owner', () => {
    expect(() =>
      checkDeclaredFile({ contentType: 'text/csv', sizeBytes: 10, owner: IMPORT }),
    ).not.toThrow();
    expect(() => checkDeclaredFile({ contentType: 'text/csv', sizeBytes: 10 })).toThrow(
      InvalidInput,
    );
    for (const owner of [
      { module: 'support', resourceType: 'ticket' },
      { module: 'crm', resourceType: 'contact' },
      { module: 'booking', resourceType: 'import' },
    ]) {
      expect(() => checkDeclaredFile({ contentType: 'text/csv', sizeBytes: 10, owner })).toThrow(
        /ClientDesk import/,
      );
    }
    expect(() =>
      checkDeclaredFile({ contentType: 'text/csv', sizeBytes: MAX_FILE_BYTES + 1, owner: IMPORT }),
    ).toThrow(/10 MB/);
    // the other types stay as they were, whatever the owner
    expect(() =>
      checkDeclaredFile({ contentType: 'image/png', sizeBytes: 10, owner: IMPORT }),
    ).not.toThrow();
    expect(mayKeepCsv(IMPORT)).toBe(true);
    expect(mayKeepCsv({ module: 'crm', resourceType: 'imports' })).toBe(false);
  });

  it('the first bytes of a CSV are UTF-8 text, with or without a BOM', () => {
    expect(sniffContentType(enc('nume,telefon,email\r\n'))).toBe('text/csv');
    expect(sniffContentType(enc('\uFEFFNume;Telefon\n'))).toBe('text/csv');
    expect(sniffContentType(enc('"Ștefan"\t"0722'))).toBe('text/csv');
    // the head may cut the last character in two
    expect(sniffContentType(enc('nume,Ș').subarray(0, 6))).toBe('text/csv');
  });

  it('markup, binaries, UTF-16 and control characters are not a CSV', () => {
    expect(sniffContentType(enc('<html><script>'))).toBeNull();
    expect(sniffContentType(enc('  \n<svg onload=x>'))).toBeNull();
    expect(sniffContentType(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0]))).toBeNull(); // .xlsx
    expect(sniffContentType(Uint8Array.from([0x1f, 0x8b, 0x08, 0]))).toBeNull(); // gzip
    expect(sniffContentType(Uint8Array.from([0xff, 0xfe, 0x6e, 0x00, 0x75, 0x00]))).toBeNull();
    expect(sniffContentType(enc('nume\u0000,x'))).toBeNull();
    expect(sniffContentType(enc('nume\u001b[31m'))).toBeNull();
    expect(sniffContentType(Uint8Array.from([0xef, 0xbb, 0xbf]))).toBeNull(); // only a BOM
    expect(sniffContentType(enc(' '.repeat(16)))).toBeNull(); // only blanks
    expect(sniffContentType(Uint8Array.from([0x6e, 0xc3, 0x28]))).toBeNull(); // invalid UTF-8
  });

  it('a text file declared as an image or a PDF is still refused, and the reverse', () => {
    const csv = enc('nume,telefon\n');
    expect(
      checkStoredFile(
        { contentType: 'text/csv', sizeBytes: csv.length },
        { sizeBytes: csv.length, head: csv },
      ),
    ).toBeNull();
    expect(
      checkStoredFile(
        { contentType: 'image/png', sizeBytes: csv.length },
        { sizeBytes: csv.length, head: csv },
      ),
    ).toBe('type_mismatch');
    expect(
      checkStoredFile(
        { contentType: 'text/csv', sizeBytes: PNG.length },
        { sizeBytes: PNG.length, head: PNG },
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
