import { describe, expect, it } from 'vitest';
import { SUPPORT_APPLICATIONS, supportApplicationFor } from '../apps';

describe('aplicația precompletată după pagina de pornire (S111, S-3)', () => {
  it('din pagina unei aplicații, aplicația ei', () => {
    expect(supportApplicationFor('/applications/booking')).toBe('booking');
    expect(supportApplicationFor('/applications/finance?x=1')).toBe('finance');
    expect(supportApplicationFor('/booking/calendar')).toBe('booking');
    expect(supportApplicationFor('/crm')).toBe('crm');
  });

  it('din launcher, „Contul tău”, Administrare sau catalog: Hub (platform)', () => {
    for (const p of [
      '/',
      '/account',
      '/account/notifications',
      '/admin/team',
      '/catalog',
      '/applications',
      '/support',
    ]) {
      expect(supportApplicationFor(p)).toBe('platform');
    }
  });

  it('o adresă necunoscută nu ajunge niciodată în formular', () => {
    expect(supportApplicationFor('/applications/nu-exista')).toBe('platform');
    expect(supportApplicationFor('/platform')).toBe('platform');
  });

  it('platform și cele 15 aplicații', () => {
    expect(SUPPORT_APPLICATIONS).toHaveLength(16);
    expect(SUPPORT_APPLICATIONS[0]).toBe('platform');
  });
});
