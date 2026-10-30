import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBusinessesFrame } from './client';

// preview.html → „Founder — Afaceri: toate afacerile, cu abonamentul, consumul și ce cere atenție”
// → Desktop · 1280, H 1000
export default function FounderBusinessesGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — Afaceri: toate afacerile, cu abonamentul, consumul și ce cere atenție"
      height={1000}
      render={() => <FounderBusinessesFrame />}
    />
  );
}
