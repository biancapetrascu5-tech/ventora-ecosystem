import type { ReactNode } from 'react';
import { Page, Text, View } from '@react-pdf/renderer';
import { pdfTokens, type PdfColorToken, type PdfTypeStyle } from './tokens.generated';

/** O pagină A4 pe suprafața `sheet`, cu textul implicit în stilul `body`. */
export function PdfPage({ children }: { children: ReactNode }) {
  return (
    <Page
      size="A4"
      style={{
        ...pdfTokens.type.body,
        color: pdfTokens.color.ink,
        backgroundColor: pdfTokens.color.sheet,
        padding: pdfTokens.space['space-10'],
      }}
    >
      {children}
    </Page>
  );
}

export interface PdfTextProps {
  variant?: PdfTypeStyle;
  color?: PdfColorToken;
  children: ReactNode;
}

/** Text într-un stil din scara tipografică a sistemului. */
export function PdfText({ variant = 'body', color = 'ink', children }: PdfTextProps) {
  return (
    <Text style={{ ...pdfTokens.type[variant], color: pdfTokens.color[color] }}>{children}</Text>
  );
}

/** Spațiu vertical între blocuri, pe pasul de spațiere al sistemului. */
export function PdfStack({
  gap = 'space-4',
  children,
}: {
  gap?: keyof typeof pdfTokens.space;
  children: ReactNode;
}) {
  return <View style={{ flexDirection: 'column', gap: pdfTokens.space[gap] }}>{children}</View>;
}
