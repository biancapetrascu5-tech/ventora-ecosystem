/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderInvoiceNotIssuedFrame } from '../_shared/founderLifecycle';

// preview.html → „1 · Nu s-a emis: motivul și ce poți face” → Desktop · 1280, H 1000 (Lotul 3.8, S121). `?w=390`: cadrul de telefon.
export default async function FounderInvoiceNotIssuedGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="FounderInvoiceNotIssued"
      height={1000}
      width={phone ? 390 : undefined}
      render={() => <FounderInvoiceNotIssuedFrame phone={phone} />}
    />
  );
}
