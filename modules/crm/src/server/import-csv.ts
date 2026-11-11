import { InvalidInput } from '@ventora/errors';
import {
  LIMITS,
  normalizeBirthday,
  normalizeEmail,
  normalizeLocale,
  normalizePhone,
  optionalText,
} from './validation';

/*
 * Lot CR.11b (part 1) — reading an import file (plans/CRM.md CR.11; design S132 ClientDeskImport):
 * the CSV, the column mapping, the validation of every row and the preview. Pure functions, no
 * database: the job that writes the contacts (quota checked before the start, duplicates skipped /
 * updated / created, the error report, the cancel) waits for the file's path through core/files,
 * which accepts only PNG / JPEG / PDF today (NECESITĂ DECIZIE: a Core PR for text/csv, then .xlsx
 * with exceljs from main).
 *
 * - UTF-8, a BOM is dropped; the delimiter is `,` or `;` (Excel in Romanian writes `;`), detected
 *   on the header line; RFC 4180 quotes ("" inside a quoted cell), line breaks inside quotes kept.
 * - At most 10 000 rows and 50 columns per file.
 * - The mapping: a file column → a contact field (name, phone, phoneAlt, email, emailAlt, locale,
 *   birthday, address, note, companyRole), or nothing. `name` is required.
 * - Every row is checked with the same rules as „Contact nou”; a bad cell makes the row an error
 *   (row, field, reason), the others go on.
 * - Duplicates inside the file (same phone or e-mail as an earlier row) are reported; against the
 *   existing contacts the job applies the person's choice (skip / update / create).
 */

export const IMPORT_LIMITS = { rows: 10_000, columns: 50, cell: 2000, preview: 20 } as const;
export const IMPORT_FIELDS = [
  'name',
  'phone',
  'phoneAlt',
  'email',
  'emailAlt',
  'locale',
  'birthday',
  'address',
  'note',
  'companyRole',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMapping = Record<string, ImportField | null>;

export type ParsedCsv = { header: string[]; rows: string[][]; delimiter: ',' | ';' };

function detectDelimiter(firstLine: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

/** RFC 4180 with `,` or `;`; empty lines are skipped. */
export function parseCsv(text: string): ParsedCsv {
  if (typeof text !== 'string') throw new InvalidInput('file', 'invalid');
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) records.push(row);
      row = [];
      if (records.length > IMPORT_LIMITS.rows + 1) throw new InvalidInput('file', 'too_many_rows');
    } else cell += ch;
  }
  if (quoted) throw new InvalidInput('file', 'unclosed_quote');
  row.push(cell);
  if (row.some((c) => c !== '')) records.push(row);
  const [header, ...rows] = records;
  if (!header) throw new InvalidInput('file', 'empty');
  if (header.length > IMPORT_LIMITS.columns) throw new InvalidInput('file', 'too_many_columns');
  if (rows.length > IMPORT_LIMITS.rows) throw new InvalidInput('file', 'too_many_rows');
  return { header: header.map((h) => h.trim()), rows, delimiter };
}

const GUESS: Record<string, ImportField> = {
  nume: 'name',
  name: 'name',
  'nume complet': 'name',
  telefon: 'phone',
  phone: 'phone',
  mobil: 'phone',
  'telefon 2': 'phoneAlt',
  email: 'email',
  'e-mail': 'email',
  'email 2': 'emailAlt',
  limba: 'locale',
  language: 'locale',
  'data nasterii': 'birthday',
  'ziua de nastere': 'birthday',
  birthday: 'birthday',
  adresa: 'address',
  address: 'address',
  nota: 'note',
  note: 'note',
  rol: 'companyRole',
};

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** The suggested mapping from the header (the person changes it before the import). */
export function suggestMapping(header: string[]): ImportMapping {
  const used = new Set<ImportField>();
  const out: ImportMapping = {};
  for (const h of header) {
    const f = GUESS[fold(h)];
    out[h] = f && !used.has(f) ? f : null;
    if (f) used.add(f);
  }
  return out;
}

/** The mapping the person chose: known columns, known fields, each field once, `name` present. */
export function checkMapping(header: string[], mapping: unknown): ImportMapping {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new InvalidInput('mapping', 'invalid');
  }
  const out: ImportMapping = {};
  const used = new Set<string>();
  for (const [col, field] of Object.entries(mapping as Record<string, unknown>)) {
    if (!header.includes(col)) throw new InvalidInput('mapping', 'unknown_column');
    if (field === null) {
      out[col] = null;
      continue;
    }
    if (!(IMPORT_FIELDS as readonly unknown[]).includes(field))
      throw new InvalidInput('mapping', 'invalid');
    if (used.has(field as string)) throw new InvalidInput('mapping', 'duplicate_field');
    used.add(field as string);
    out[col] = field as ImportField;
  }
  if (!used.has('name')) throw new InvalidInput('mapping', 'name_required');
  return out;
}

export type ImportContact = {
  name: string;
  phone?: string | null;
  phoneAlt?: string | null;
  email?: string | null;
  emailAlt?: string | null;
  locale?: string;
  birthday?: string | null;
  address?: string | null;
  note?: string | null;
  companyRole?: string | null;
};
export type RowError = { row: number; field: string; reason: string };
export type CheckedRow = { row: number; contact: ImportContact | null; errors: RowError[] };

/** One file row (1-based, the header being row 1) → the contact, or its errors. */
export function checkRow(
  header: string[],
  mapping: ImportMapping,
  cells: string[],
  row: number,
): CheckedRow {
  const errors: RowError[] = [];
  const raw: Partial<Record<ImportField, string>> = {};
  header.forEach((h, i) => {
    const f = mapping[h];
    if (!f) return;
    const v = (cells[i] ?? '').trim();
    if (v.length > IMPORT_LIMITS.cell) errors.push({ row, field: f, reason: 'too_long' });
    else raw[f] = v;
  });
  const contact: Partial<ImportContact> = {};
  const take = (field: ImportField, fn: () => unknown) => {
    try {
      const v = fn();
      if (v !== undefined) (contact as Record<string, unknown>)[field] = v;
    } catch (err) {
      errors.push({
        row,
        field,
        reason: err instanceof InvalidInput ? err.message : 'invalid',
      });
    }
  };
  take('name', () => {
    const v = optionalText('name', raw.name ?? '', LIMITS.name);
    if (!v) throw new InvalidInput('name', 'required');
    return v;
  });
  if (raw.phone !== undefined) take('phone', () => normalizePhone('phone', raw.phone));
  if (raw.phoneAlt !== undefined) take('phoneAlt', () => normalizePhone('phoneAlt', raw.phoneAlt));
  if (raw.email !== undefined) take('email', () => normalizeEmail('email', raw.email));
  if (raw.emailAlt !== undefined) take('emailAlt', () => normalizeEmail('emailAlt', raw.emailAlt));
  if (raw.locale) take('locale', () => normalizeLocale(raw.locale!.toLowerCase()));
  if (raw.birthday !== undefined) take('birthday', () => normalizeBirthday(raw.birthday));
  if (raw.address !== undefined)
    take('address', () => optionalText('address', raw.address, LIMITS.address));
  if (raw.note !== undefined) take('note', () => optionalText('note', raw.note, LIMITS.note));
  if (raw.companyRole !== undefined) {
    take('companyRole', () => optionalText('companyRole', raw.companyRole, LIMITS.companyRole));
  }
  return { row, contact: errors.length ? null : (contact as ImportContact), errors };
}

export type ImportPreview = {
  delimiter: ',' | ';';
  header: string[];
  mapping: ImportMapping;
  total: number;
  valid: number;
  /** The first rows, checked. */
  sample: CheckedRow[];
  /** Every error (at most 500 listed; `errorCount` is the full number). */
  errors: RowError[];
  errorCount: number;
  /** Rows repeating an earlier row's phone or e-mail (row → the earlier row). */
  duplicatesInFile: { row: number; sameAs: number }[];
};

/** The preview of „Importă”: the mapping (suggested unless given), every row checked. */
export function previewImport(text: string, mapping?: unknown): ImportPreview {
  const csv = parseCsv(text);
  const map =
    mapping === undefined ? suggestMapping(csv.header) : checkMapping(csv.header, mapping);
  const hasName = Object.values(map).includes('name');
  const checked = csv.rows.map((cells, i) =>
    hasName
      ? checkRow(csv.header, map, cells, i + 2)
      : {
          row: i + 2,
          contact: null,
          errors: [{ row: i + 2, field: 'name', reason: 'not_mapped' }],
        },
  );
  const seen = new Map<string, number>();
  const duplicatesInFile: { row: number; sameAs: number }[] = [];
  for (const r of checked) {
    if (!r.contact) continue;
    const keys = [r.contact.phone, r.contact.email].filter((k): k is string => !!k);
    const earlier = keys.map((k) => seen.get(k)).find((n) => n !== undefined);
    if (earlier !== undefined) duplicatesInFile.push({ row: r.row, sameAs: earlier });
    for (const k of keys) if (!seen.has(k)) seen.set(k, r.row);
  }
  const allErrors = checked.flatMap((r) => r.errors);
  return {
    delimiter: csv.delimiter,
    header: csv.header,
    mapping: map,
    total: checked.length,
    valid: checked.filter((r) => r.contact).length,
    sample: checked.slice(0, IMPORT_LIMITS.preview),
    errors: allErrors.slice(0, 500),
    errorCount: allErrors.length,
    duplicatesInFile,
  };
}
