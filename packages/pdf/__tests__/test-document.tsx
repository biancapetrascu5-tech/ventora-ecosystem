import { PdfPage, PdfStack, PdfText } from '../src';
import type { TestDocumentText } from './test-document.text';

/** Documentul de test din Lot 4.8: un titlu Syne și paragrafe DM Sans în toate greutățile. */
export function TestDocument({ text }: { text: TestDocumentText }) {
  return (
    <PdfPage>
      <PdfStack gap="space-6">
        <PdfText variant="eyebrow" color="ink-muted">
          {text.eyebrow}
        </PdfText>
        <PdfText variant="display-l">{text.title}</PdfText>
        <PdfText variant="heading">{text.heading}</PdfText>
        <PdfText>{text.body}</PdfText>
        <PdfText variant="body-strong">{text.characters}</PdfText>
        <PdfText variant="caption" color="ink-secondary">
          {text.caption}
        </PdfText>
      </PdfStack>
    </PdfPage>
  );
}
