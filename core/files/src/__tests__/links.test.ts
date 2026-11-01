import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileLinkRefused, signDownloadToken, verifyDownloadToken } from '../index';

const FILE = '0193a4b0-7c1e-7b3a-9f00-0000000000f1';
const ORG_A = '0193a4b0-7c1e-7b3a-9f00-00000000000a';
const ORG_B = '0193a4b0-7c1e-7b3a-9f00-00000000000b';
const NOW = new Date('2026-11-01T12:00:00Z');
const at = (seconds: number) => Math.floor(NOW.getTime() / 1000) + seconds;

describe('download links: signed, bound to the file and its organization, expiring (§12.4)', () => {
  beforeEach(() => {
    process.env.FILES_LINK_SECRET = 'test-files-link-secret-0123456789abcdef';
  });
  afterEach(() => {
    delete process.env.FILES_LINK_SECRET;
  });

  it('a valid link gives back its file and organization', () => {
    const token = signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(600) });
    expect(verifyDownloadToken(token, NOW)).toEqual({
      fileId: FILE,
      organizationId: ORG_A,
      expiresAt: at(600),
    });
  });

  it('an expired link is refused (410)', () => {
    const token = signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(-1) });
    const err = (() => {
      try {
        verifyDownloadToken(token, NOW);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(FileLinkRefused);
    expect(err).toMatchObject({ reason: 'expired', status: 410 });
    // the second it expires
    const edge = signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(0) });
    expect(() => verifyDownloadToken(edge, NOW)).toThrow(/expired/);
  });

  it('a link changed to another organization (or file, or expiry) is refused', () => {
    const token = signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(600) });
    const [, signature] = token.split('.');
    const forged = (claims: object) =>
      `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    for (const claims of [
      { f: FILE, o: ORG_B, e: at(600) },
      { f: ORG_B, o: ORG_A, e: at(600) },
      { f: FILE, o: ORG_A, e: at(60_000) },
    ]) {
      expect(() => verifyDownloadToken(forged(claims), NOW)).toThrow(FileLinkRefused);
    }
    for (const bad of ['', 'abc', `${token}.x`, token.slice(0, -2), 'a.b']) {
      expect(() => verifyDownloadToken(bad, NOW)).toThrow(FileLinkRefused);
    }
  });

  it('a link signed with another secret is refused; without a secret nothing is signed', () => {
    const token = signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(600) });
    process.env.FILES_LINK_SECRET = 'another-files-link-secret-0123456789abcd';
    expect(() => verifyDownloadToken(token, NOW)).toThrow(FileLinkRefused);
    process.env.FILES_LINK_SECRET = 'short';
    expect(() =>
      signDownloadToken({ fileId: FILE, organizationId: ORG_A, expiresAt: at(600) }),
    ).toThrow(/FILES_LINK_SECRET/);
  });
});
