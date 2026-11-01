/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderDiscountsFrame } from '../_shared/founderCommercial';

// preview.html → primul cadru: Desktop · 1280, H 760 (Lotul 3.4). Vederile sunt cele din
// @ventora/screens, ca în aplicația Founder; datele sunt exemplele din preview.
export default function FounderDiscountsGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="FounderDiscounts"
      height={760}
      render={() => <FounderDiscountsFrame />}
    />
  );
}
