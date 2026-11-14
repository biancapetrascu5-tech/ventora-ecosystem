import { describe, it, expect } from 'vitest';
import { maskEmail } from '../server/public-contact.js';

// Lot B.11c: „V-am trimis un e-mail la …” — the e-mail the client typed, masked.
describe('maskEmail', () => {
  it('two characters of the name, ***, the domain', () => {
    expect(maskEmail('cristina.dobre@gmail.com')).toBe('cr***@gmail.com');
    expect(maskEmail('ab@x.ro')).toBe('a***@x.ro');
    expect(maskEmail('a@x.ro')).toBe('a***@x.ro');
  });

  it('no name before @, or not an address: only ***', () => {
    expect(maskEmail('@x.ro')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});
