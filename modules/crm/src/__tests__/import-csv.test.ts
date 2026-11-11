import { describe, it, expect } from 'vitest';
import { checkMapping, parseCsv, previewImport, suggestMapping } from '../server/import-csv';

// Lot CR.11b (part 1): reading the CSV, the mapping, the row checks, the preview.
describe('CR.11b — the CSV file', () => {
  it('BOM, `;` from a Romanian Excel, quotes with commas, "" and line breaks', () => {
    const csv = parseCsv(
      '﻿Nume;Telefon;Notă\r\n"Pop; Ana";0722 111 222;"spune ""da""\nși pleacă"\r\n\r\n',
    );
    expect(csv.delimiter).toBe(';');
    expect(csv.header).toEqual(['Nume', 'Telefon', 'Notă']);
    expect(csv.rows).toEqual([['Pop; Ana', '0722 111 222', 'spune "da"\nși pleacă']]);
  });

  it('a comma file; an unclosed quote and an empty file are refused', () => {
    expect(parseCsv('a,b\n1,2').delimiter).toBe(',');
    expect(() => parseCsv('a,b\n"1,2')).toThrow('unclosed_quote');
    expect(() => parseCsv('\n\n')).toThrow('empty');
  });

  it('the suggested mapping from the header (diacritics and case ignored, each field once)', () => {
    expect(
      suggestMapping(['Nume', 'Telefon', 'E-mail', 'Data nașterii', 'Telefon', 'Altceva']),
    ).toEqual({
      Nume: 'name',
      Telefon: null,
      'E-mail': 'email',
      'Data nașterii': 'birthday',
      Altceva: null,
    });
  });

  it('the chosen mapping: known columns and fields, each field once, the name required', () => {
    const header = ['A', 'B'];
    expect(checkMapping(header, { A: 'name', B: 'phone' })).toEqual({ A: 'name', B: 'phone' });
    expect(() => checkMapping(header, { A: 'phone' })).toThrow('name_required');
    expect(() => checkMapping(header, { A: 'name', B: 'name' })).toThrow('duplicate_field');
    expect(() => checkMapping(header, { C: 'name' })).toThrow('unknown_column');
    expect(() => checkMapping(header, { A: 'name', B: 'salary' })).toThrow('invalid');
  });
});

describe('CR.11b — the preview', () => {
  const file = [
    'Nume,Telefon,Email,Limba',
    'Ana Pop,0722111222,ana@x.ro,ro',
    ',0722000000,,',
    'Ion,12,ion@x,xx',
    'Ana P.,+40722111222,,en',
  ].join('\n');

  it('every row checked with the contact rules; errors with row and field; duplicates in the file', () => {
    const p = previewImport(file);
    expect(p.mapping).toEqual({ Nume: 'name', Telefon: 'phone', Email: 'email', Limba: 'locale' });
    expect(p.total).toBe(4);
    expect(p.valid).toBe(2);
    expect(p.sample[0]!.contact).toEqual({
      name: 'Ana Pop',
      phone: '+40722111222',
      email: 'ana@x.ro',
      locale: 'ro',
    });
    expect(p.errors).toEqual([
      { row: 3, field: 'name', reason: 'required' },
      { row: 4, field: 'phone', reason: 'invalid' },
      { row: 4, field: 'email', reason: 'invalid' },
      { row: 4, field: 'locale', reason: 'invalid' },
    ]);
    expect(p.errorCount).toBe(4);
    expect(p.duplicatesInFile).toEqual([{ row: 5, sameAs: 2 }]);
  });

  it('without a name column every row says so', () => {
    // a chosen mapping without the name is refused; the suggested one marks every row
    expect(() => previewImport('Telefon\n0722111222', { Telefon: 'phone' })).toThrow(
      'name_required',
    );
    const p = previewImport('Telefon\n0722111222');
    expect(p.valid).toBe(0);
    expect(p.errors).toEqual([{ row: 2, field: 'name', reason: 'not_mapped' }]);
  });
});
