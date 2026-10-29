/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { NotificationsPanel, type NotificationData } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import { NOTIF_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → States()
const NP: NotificationData[] = [
  {
    id: 'o1',
    title: 'Telefonul pentru SMS s-a deconectat',
    body: 'Reamintirile nu pleacă până nu îl conectezi din nou.',
    icon: 'smartphone',
    time: 'acum 10 min',
    category: 'operational',
  },
  {
    id: 'o2',
    title: 'Abonamentul Business se reînnoiește pe 1 noiembrie',
    icon: 'credit-card',
    time: 'azi',
    category: 'operational',
    read: true,
  },
  {
    id: 1,
    title: 'Programare nouă de la Ștefan Țăranu',
    body: 'Joi, 29 oct., 14:30 · Tuns bărbați',
    app: 'EasyBook',
    time: 'acum 5 min',
    person: 'Ștefan Țăranu',
  },
  {
    id: 2,
    title: 'Factura #2026-114 e restantă de 3 zile',
    body: 'Clinica Dentis · 1.250 lei',
    app: 'MoneyDesk',
    time: 'acum 2 ore',
    icon: 'receipt',
  },
  {
    id: 3,
    title: 'Ioana a cerut concediu pe 2–6 noiembrie',
    app: 'TeamSpace',
    time: 'ieri',
    person: 'Ioana Pavel',
    read: true,
  },
];
const RECO = [
  {
    id: 'rc1',
    app: 'analytics',
    title: 'Vezi ce aduce fiecare serviciu',
    body: 'DataView îți arată venitul pe servicii, din programările pe care le ai deja.',
  },
];
const noop = () => {};
const Cap = ({ children }: { children: string }) => (
  <p className={`caption ${f.muted}`}>{children}</p>
);

function States() {
  return (
    <div className={f.d0}>
      <Cap>
        Necitite (titlu îngroșat, punct peach) și citite · grupul „Despre cont și funcționare” sus ·
        recomandări la final
      </Cap>
      <NotificationsPanel
        inline
        items={NP}
        recommendations={RECO}
        onMarkAllRead={noop}
        onSettings={noop}
        labels={NOTIF_RO}
      />
      <Cap>Gol: nicio notificare nouă</Cap>
      <NotificationsPanel inline items={[]} onSettings={noop} labels={NOTIF_RO} />
      <Cap>Clopoțelul: cu necitite / toate citite</Cap>
      <div className={f.r}>
        <NotificationsPanel items={NP} labels={NOTIF_RO} />
        <NotificationsPanel items={NP.map((n) => ({ ...n, read: true }))} labels={NOTIF_RO} />
      </div>
    </div>
  );
}

export default function NotificationsPanelGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <States />} />;
}
