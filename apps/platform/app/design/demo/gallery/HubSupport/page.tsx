/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { HubSupportFrame, SupportFrames } from '../_shared/support';

// Lotul 4.6: cadrele light / dark pe toată lățimea ferestrei (1280 sau 390), ca preview.html.
export default function HubSupportGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <SupportFrames
      title="HubSupport — Solicitările mele și Solicitare nouă (Lotul 4.6)"
      height={900}
    >
      <HubSupportFrame />
    </SupportFrames>
  );
}
