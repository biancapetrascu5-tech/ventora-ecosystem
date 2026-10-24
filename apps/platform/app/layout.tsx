import type { Metadata } from 'next';

import '@ventora/config';

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
