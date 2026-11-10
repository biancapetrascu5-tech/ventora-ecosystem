/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { GrowthControlFrame } from './client';

// preview.html (GrowthControl, S136) → Desktop · 1280, H 1300; `?w=390`: telefonul (H 2200).
export default async function GrowthControlGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="Growth — Control: oprire globală, pe campanie și pe slot, plafoane, jurnal"
      height={phone ? 2200 : 1300}
      width={phone ? 390 : undefined}
      render={() => <GrowthControlFrame phone={phone} />}
    />
  );
}
