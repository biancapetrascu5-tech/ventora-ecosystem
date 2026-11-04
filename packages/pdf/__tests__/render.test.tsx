import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractText } from 'unpdf';
import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import { PdfPage, PdfText, renderPdf } from '../src';
import { generate } from '../scripts/generate-tokens.mjs';
import { TestDocument } from './test-document';
import { TEST_DOCUMENT_TEXT } from './test-document.text';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

async function renderTestDocument(locale: Locale) {
  const text = TEST_DOCUMENT_TEXT[locale];
  const pdf = await renderPdf(<TestDocument text={text} />, { locale, title: text.title });
  // unpdf preia buffer-ul; îi dăm o copie, ca să putem citi și octeții bruți.
  const extracted = await extractText(new Uint8Array(pdf), { mergePages: true });
  return { pdf, text, extracted: normalize(extracted.text) };
}

describe('renderPdf — documentul de test în cele 6 limbi', () => {
  it.each(SUPPORTED_LOCALES)(
    '%s: textul extras din PDF e identic cu cel randat',
    async (locale) => {
      const { text, extracted } = await renderTestDocument(locale);

      for (const value of Object.values(text)) {
        expect(extracted).toContain(normalize(value));
      }
    },
  );

  it.each(SUPPORTED_LOCALES)('%s: limba destinatarului e în metadatele PDF', async (locale) => {
    const { pdf } = await renderTestDocument(locale);

    expect(pdf.toString('latin1')).toContain(`/Lang (${locale})`);
  });

  it('încorporează DM Sans și Syne, fără fonturile standard PDF', async () => {
    const { pdf } = await renderTestDocument('ro');
    const baseFonts = [...pdf.toString('latin1').matchAll(/\/BaseFont \/(\S+)/g)].map((m) => m[1]);

    // Instanțele statice Google Fonts ale DM Sans sunt pe axa opsz 9pt (numele PostScript).
    expect(baseFonts.some((f) => /\+DMSans9pt-Regular$/.test(f!))).toBe(true);
    expect(baseFonts.some((f) => /\+DMSans9pt-Medium$/.test(f!))).toBe(true);
    expect(baseFonts.some((f) => /\+DMSans9pt-SemiBold$/.test(f!))).toBe(true);
    expect(baseFonts.some((f) => /\+Syne-Bold$/.test(f!))).toBe(true);
    expect(baseFonts.filter((f) => !/\+(DMSans9pt|Syne)-/.test(f!))).toEqual([]);
  });

  it('un „ă” înaintea lui „a” în același font nu strică textul extras (fontkit, glife compuse)', async () => {
    const pdf = await renderPdf(
      <PdfPage>
        <PdfText variant="display-l">ă Ă ș ț î â</PdfText>
        <PdfText variant="display-l">a A s t i</PdfText>
      </PdfPage>,
      { locale: 'ro', title: 'ă a' },
    );
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });

    expect(normalize(text)).toBe('ă Ă ș ț î â a A s t i');
  });

  it('refuză o limbă din afara celor 6', async () => {
    await expect(
      renderPdf(<TestDocument text={TEST_DOCUMENT_TEXT.ro} />, {
        locale: 'pl' as Locale,
        title: 'x',
      }),
    ).rejects.toThrow('Limbă nesuportată');
  });
});

describe('tokens.generated.ts', () => {
  it('e la zi cu docs/design/system/tokens.json', () => {
    const committed = readFileSync(new URL('../src/tokens.generated.ts', import.meta.url), 'utf-8');

    expect(committed).toBe(generate());
  });
});
