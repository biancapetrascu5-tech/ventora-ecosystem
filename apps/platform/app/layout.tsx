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
