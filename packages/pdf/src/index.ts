/**
 * Generarea PDF-urilor comune (Lot 4.8, D4-19 = a): componente React → PDF, pe server, fără browser.
 * Șabloanele de domeniu (exporturi, rapoarte) vin cu modulele.
 * @see docs/plans/FAZA-4.md (Lot 4.8), docs/ARCHITECTURE.md §10.6
 */
export { renderPdf, type RenderPdfOptions } from './render';
export { PdfPage, PdfStack, PdfText, type PdfTextProps } from './components';
export { pdfTokens, type PdfColorToken, type PdfTypeStyle } from './tokens.generated';
