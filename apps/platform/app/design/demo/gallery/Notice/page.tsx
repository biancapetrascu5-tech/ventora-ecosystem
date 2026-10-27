'use client';
import { notFound } from 'next/navigation';
import { Notice, Button } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function NoticeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Notice">
      <GallerySection label="Tones — cu titlu si continut" column>
        <Notice tone="danger" title="Eroare la procesare">
          Campul telefon lipseste. Verifica datele si incearca din nou.
        </Notice>
        <Notice tone="attention" title="Nu a confirmat inca">
          I-am trimis reamintirea ieri la 12:30. Poti suna sau retrimite.
        </Notice>
        <Notice tone="done" title="Export finalizat">
          Fisierul a fost generat si trimis pe e-mail.
        </Notice>
        <Notice tone="neutral" title="Informatie">
          Modificarile vor fi aplicate la urmatoarea sincronizare.
        </Notice>
      </GallerySection>
      <GallerySection label="Fara titlu" column>
        <Notice tone="attention">Abonamentul expira in 3 zile.</Notice>
        <Notice tone="danger">Conexiunea la baza de date a fost pierduta.</Notice>
      </GallerySection>
      <GallerySection label="Cu actiuni" column>
        <Notice
          tone="attention"
          title="Invitatie in asteptare"
          actions={[
            <Button key="accept" size="sm">
              Accepta
            </Button>,
            <Button key="decline" size="sm" variant="quiet">
              Refuza
            </Button>,
          ]}
        >
          Ana Popescu te-a invitat sa te alaturezi echipei Salon Aurora.
        </Notice>
      </GallerySection>
    </GalleryShell>
  );
}
