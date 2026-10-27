/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function UsageMeterGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="UsageMeter">
      <GallerySection label="RO" column>
        <UsageMeter label="Programări luna aceasta" used={312} limit={1000} onUpgrade={() => {}} />
        <UsageMeter label="SMS-uri" used={862} limit={1000} onUpgrade={() => {}} />
        <UsageMeter label="Angajați" used={10} limit={10} onUpgrade={() => {}} />
        <UsageMeter
          label="Spațiu documente"
          used={2.4}
          limit={5}
          unit="GB"
          format={(n) => n.toLocaleString('ro-RO')}
        />
        <UsageMeter label="Clienți" used={4210} />
      </GallerySection>
      <GallerySection label="Compact">
        <UsageMeter compact label="Programări" used={980} limit={1000} onUpgrade={() => {}} />
      </GallerySection>
      <GallerySection label="DE" column>
        <UsageMeter
          label="SMS-Kontingent diesen Monat"
          used={1000}
          limit={1000}
          onUpgrade={() => {}}
          atLimitLabel="Planlimit erreicht"
          atLimitHint="Was Sie bereits haben, bleibt erhalten. Um mehr hinzuzufügen, upgraden Sie Ihren Plan."
          upgradeLabel="Plan upgraden"
        />
      </GallerySection>
    </GalleryShell>
  );
}
