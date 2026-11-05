/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderSetupRequestsFrame } from '../_shared/founderLifecycle';

// preview.html → „1 · Lista: toate stările” → Desktop · 1280, H 900 (Lotul 3.8, S121). `?w=390`: cadrul de telefon.
export default async function FounderSetupRequestsGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="FounderSetupRequests"
      height={900}
      width={phone ? 390 : undefined}
      render={() => <FounderSetupRequestsFrame phone={phone} />}
    />
  );
}
