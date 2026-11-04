/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { HubSupportThreadFrame, SupportFrames } from '../_shared/support';

// Lotul 4.6: cadrele light / dark pe toată lățimea ferestrei (1280 sau 390), ca preview.html.
export default function HubSupportThreadGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <SupportFrames title="HubSupportThread — Răspuns nou de la echipă (Lotul 4.6)" height={1150}>
      <HubSupportThreadFrame />
    </SupportFrames>
  );
}
