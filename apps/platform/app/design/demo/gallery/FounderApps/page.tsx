/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderAppsFrame } from '../_shared/founderCommercial';

// preview.html → primul cadru: Desktop · 1280, H 760 (Lotul 3.4). Vederile sunt cele din
// @ventora/screens, ca în aplicația Founder; datele sunt exemplele din preview.
export default function FounderAppsGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames founder title="FounderApps" height={1040} render={() => <FounderAppsFrame />} />
  );
}
