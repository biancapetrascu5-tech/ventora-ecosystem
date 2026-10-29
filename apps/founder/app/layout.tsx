import '@ventora/tokens/business/fonts.css';
import '@ventora/tokens/business/tokens.css';
import '@ventora/tokens/business/typography.css';
import './globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';

export const metadata: Metadata = {
  title: 'Ventora Founder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
