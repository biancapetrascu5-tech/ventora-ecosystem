/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { GrowthCampaignsFrame } from './client';

// preview.html (GrowthCampaigns, S136) → Desktop · 1280, H 800; `?w=390`: telefonul (H 1100).
export default async function GrowthCampaignsGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="Growth — Campanii"
      height={phone ? 1100 : 800}
      width={phone ? 390 : undefined}
      render={() => <GrowthCampaignsFrame phone={phone} />}
    />
  );
}
