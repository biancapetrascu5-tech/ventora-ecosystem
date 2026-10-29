/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { PortalPresence } from '@ventora/ui';
import { PORTAL_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → .d → Theme({ th: "light" }) / Theme({ th: "dark" })  (div.d.thf)
const noop = () => {};
const L = PORTAL_RO;
const Lab = ({ children }: { children: React.ReactNode }) => (
  <p className={`caption ${f.lab}`}>{children}</p>
);

function Theme({ th }: { th: 'light' | 'dark' }) {
  return (
    <div className={`${f.d} ${f.thf}`} data-gallery-frame data-theme={th}>
      <p className="heading">{th === 'light' ? 'Light' : 'Dark'}</p>
      <Lab>Publicată · proprietar, admin sau managerul aplicației Portal</Lab>
      <PortalPresence status="published" onManage={noop} previewHref="#" labels={L} />
      <Lab>Ascunsă de afacere</Lab>
      <PortalPresence status="hidden" onManage={noop} previewHref="#" labels={L} />
      <Lab>Nu e publicată încă: acțiunea principală devine „Termină pagina”, fără link public</Lab>
      <PortalPresence status="draft" onManage={noop} labels={L} />
      <div className={f.ppTwo}>
        <div>
          <Lab>Membru: vede pagina, nu o poate schimba</Lab>
          <PortalPresence status="published" canManage={false} previewHref="#" labels={L} />
        </div>
        <div>
          <Lab>Telefon și tabletă (compact)</Lab>
          <PortalPresence status="published" compact onManage={noop} previewHref="#" labels={L} />
        </div>
      </div>
    </div>
  );
}

export default function PortalPresenceGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.dockd}>
        <Theme th="light" />
        <Theme th="dark" />
      </div>
    </div>
  );
}
