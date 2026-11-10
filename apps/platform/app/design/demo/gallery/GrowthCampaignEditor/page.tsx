/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { GrowthCampaignEditorFrame } from './client';

// preview.html (GrowthCampaignEditor, S136) → Desktop · 1280, H 1500; `?w=390`: telefonul (H 2700).
export default async function GrowthCampaignEditorGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="Growth — Editorul unei campanii"
      height={phone ? 2700 : 1500}
      width={phone ? 390 : undefined}
      render={() => <GrowthCampaignEditorFrame phone={phone} />}
    />
  );
}
