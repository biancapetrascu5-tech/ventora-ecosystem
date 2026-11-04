/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { FounderThreadFrame, SupportFrames } from '../_shared/support';

// Lotul 4.6: cadrele light / dark pe toată lățimea ferestrei (1280 sau 390), ca preview.html.
export default function FounderSupportInboxThreadGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <SupportFrames
      title="FounderSupportInbox — Solicitarea și răspunsul echipei (Lotul 4.6)"
      height={1000}
      founder
    >
      <FounderThreadFrame />
    </SupportFrames>
  );
}
