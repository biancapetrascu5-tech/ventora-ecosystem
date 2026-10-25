import { describe, expect, it } from 'vitest';
import { cleanUrl } from '../clean-url';

describe('cleanUrl', () => {
  it('elimină pgbouncer și connection_limit', () => {
    const url = 'postgresql://user:pass@host:6543/db?pgbouncer=true&connection_limit=1';
    expect(cleanUrl(url)).toBe('postgresql://user:pass@host:6543/db');
  });

  it('lasă neschimbat un URL fără parametri de pooler', () => {
    const url = 'postgresql://user:pass@host:5432/db';
    expect(cleanUrl(url)).toBe(url);
  });

  it('returnează inputul netransformat dacă URL-ul e invalid', () => {
    expect(cleanUrl('not-a-url')).toBe('not-a-url');
  });

  it('păstrează alți parametri de query', () => {
    const url = 'postgresql://host/db?sslmode=require&pgbouncer=true';
    expect(cleanUrl(url)).toBe('postgresql://host/db?sslmode=require');
  });

  it('elimină doar connection_limit dacă pgbouncer lipsește', () => {
    const url = 'postgresql://host/db?connection_limit=5';
    expect(cleanUrl(url)).toBe('postgresql://host/db');
  });
});
