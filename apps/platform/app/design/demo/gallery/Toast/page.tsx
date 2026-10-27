'use client';
import { notFound } from 'next/navigation';
import { Toast } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';

export default function ToastGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="Toast">
      <GallerySection label="Tones — cu descriere" column>
        <Toast
          tone="neutral"
          title="Modificarile au fost salvate"
          description="Versiunea curenta a fost actualizata."
        />
        <Toast
          tone="done"
          title="Operatia a reusit"
          description="Toate campurile au fost procesate."
        />
        <Toast
          tone="attention"
          title="Verifica setarile"
          description="Un camp optional nu a fost completat."
        />
        <Toast
          tone="danger"
          title="Eroare la salvare"
          description="Conexiunea a fost intrerupta."
        />
      </GallerySection>
      <GallerySection label="Fara descriere" column>
        <Toast tone="neutral" title="Clipboard copiat" />
        <Toast tone="done" title="Salvat cu succes" />
        <Toast tone="attention" title="Verifica datele" />
        <Toast tone="danger" title="Operatia a esuat" />
      </GallerySection>
      <GallerySection label="Cu actiune" column>
        <Toast
          tone="neutral"
          title="Programarea a fost mutata"
          description="De la 11:00 la 12:30."
          action={{ label: 'Deschide' }}
          onUndo={() => {}}
        />
        <Toast
          tone="danger"
          title="3 programari anulate"
          description="Bianca Marin, Oana Dinu, Dan Stoica."
          action={{ label: 'Restaureaza' }}
        />
      </GallerySection>
      <GallerySection label="Se incarca" column>
        <Toast tone="neutral" title="Se exporta raportul..." loading />
      </GallerySection>
    </GalleryShell>
  );
}
