import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAccountFrame } from './client';

// preview.html → Screens „Setările contului…” → Desktop · 1280, H 1380
export default function HubAccountGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Setările contului — profil, temă, limbă, notificări, securitate"
      height={1380}
      render={() => <HubAccountFrame />}
    />
  );
}
