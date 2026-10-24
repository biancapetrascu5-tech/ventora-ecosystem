import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E4 Vercel',
  description: 'Ventora Labs — E4 connection test',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
