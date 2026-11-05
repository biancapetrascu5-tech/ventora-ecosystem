/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBillingProfileFrame } from '../_shared/founderLifecycle';

// preview.html → „1 · Datele de facturare, în tabul „Plăți și facturi”” → Desktop · 1280, H 1100 (Lotul 3.8, S121). `?w=390`: cadrul de telefon.
export default async function FounderBillingProfileGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="FounderBillingProfile"
      height={1100}
      width={phone ? 390 : undefined}
      render={() => <FounderBillingProfileFrame phone={phone} />}
    />
  );
}
