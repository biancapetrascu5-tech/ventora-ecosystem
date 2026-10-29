import '@ventora/tokens/business/fonts.css';
import '@ventora/tokens/business/tokens.css';
import '@ventora/tokens/business/typography.css';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ventora Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
