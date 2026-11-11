import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from '../server/export';

// Lot CR.11a: the CSV of the export — quoting (RFC 4180), formulas neutralised, the BOM.
describe('CR.11a — the CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Pop, Ana')).toBe('"Pop, Ana"');
    expect(csvCell('spune "da"')).toBe('"spune ""da"""');
    expect(csvCell('rând 1\nrând 2')).toBe('"rând 1\nrând 2"');
    expect(csvCell('simplu')).toBe('simplu');
  });

  it('neutralises formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+40722')).toBe("'+40722");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('dates, lists, empty values', () => {
    expect(csvCell(new Date('2026-11-11T10:00:00Z'))).toBe('2026-11-11T10:00:00.000Z');
    expect(csvCell(['a', 'b'])).toBe('a;b');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('a file: BOM, header, CRLF', () => {
    const csv = toCsv(
      ['id', 'name'],
      [
        { id: '1', name: 'Ștefan' },
        { id: '2', name: null },
      ],
    );
    expect(csv).toBe('﻿id,name\r\n1,Ștefan\r\n2,\r\n');
  });
});
