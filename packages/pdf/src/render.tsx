import type { ReactNode } from 'react';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import { loadPdfFonts } from './fonts';

export interface RenderPdfOptions {
  /** Limba destinatarului (§10.6), nu a celui care declanșează generarea. */
  locale: Locale;
  /** Titlul din metadatele PDF, deja tradus în `locale`. */
  title: string;
}

/**
 * Randează pe server un PDF din pagini `PdfPage`, cu fonturile și tokenii sistemului.
 * Fără browser (D4-19 = a). Textele vin traduse de apelant; pachetul nu are șabloane de domeniu.
 */
export async function renderPdf(
  pages: ReactNode,
  { locale, title }: RenderPdfOptions,
): Promise<Buffer> {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    throw new Error(`Limbă nesuportată pentru PDF: ${String(locale)}`);
  }
  await loadPdfFonts();

  return renderToBuffer(
    <Document language={locale} title={title} creator="Ventora" producer="Ventora">
      {pages}
    </Document>,
  );
}
