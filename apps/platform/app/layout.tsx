import '@ventora/tokens/business/fonts.css';
import '@ventora/tokens/business/tokens.css';
import '@ventora/tokens/business/typography.css';
import './globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeScript, VentoraProvider } from '@ventora/ui';
import { getLocale } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Hub · Ventora Systems',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <VentoraProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </VentoraProvider>
      </body>
    </html>
  );
}
