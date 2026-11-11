/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { GrowthOfferEditorFrame } from './client';

// preview.html (GrowthOfferEditor, S136) → Desktop · 1280, H 1250; `?w=390`: telefonul (H 2300).
export default async function GrowthOfferEditorGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const phone = (await searchParams).w === '390';
  return (
    <DesktopFrames
      founder
      title="Growth — Editorul unei oferte"
      height={phone ? 2300 : 1250}
      width={phone ? 390 : undefined}
      render={() => <GrowthOfferEditorFrame phone={phone} />}
    />
  );
}
