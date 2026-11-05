/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubBillingProfileFrame } from '../_shared/hubLifecycle';

// preview.html → „1 · Persoană juridică” → Desktop · 1280, H 900 (Lotul 3.8, S121). `?w=390`: cadrul de telefon.
export default async function HubBillingProfileGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      title="HubBillingProfile"
      height={900}
      width={phone ? 390 : undefined}
      render={() => <HubBillingProfileFrame phone={phone} />}
    />
  );
}
