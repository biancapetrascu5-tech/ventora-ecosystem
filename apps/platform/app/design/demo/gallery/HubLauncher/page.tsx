/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubLauncherFrame } from './client';

// preview.html (HubLauncher 1.1.0, S136) → „Fără Portal” și (`?board=noData`) „Nicio aplicație care
// dă date” → Desktop · 1280, H 1200; `?w=390`: cadrul de telefon (H 1760).
export default async function HubLauncherGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; board?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const phone = sp.w === '390';
  const noData = sp.board === 'noData';
  return (
    <DesktopFrames
      title={noData ? 'Nicio aplicație care dă date' : 'Fără Portal'}
      height={phone ? 1760 : 1200}
      width={phone ? 390 : undefined}
      render={() => <HubLauncherFrame noData={noData} />}
    />
  );
}
