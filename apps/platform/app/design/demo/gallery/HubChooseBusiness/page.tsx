import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubChooseBusinessFrame } from './client';

// preview.html → Screens „Alegerea afacerii” → Desktop · 1280, H 860
export default function HubChooseBusinessGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Alegerea afacerii"
      height={860}
      render={() => <HubChooseBusinessFrame />}
    />
  );
}
