/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';

// Lotul 4.6: HubSupport, HubSupportThread, FounderSupportInbox — vederile din @ventora/screens,
// ca în aplicații, cu exemplele din preview.html (S111 / S116). Pe telefon (useIsPhone) aceleași
// vederi trec în aranjamentul de telefon, ca în cadrele de 390 din preview.
import type { ReactNode } from 'react';
import {
  FounderSupportInboxView,
  FounderSupportThreadView,
  HubSupportThreadView,
  HubSupportView,
  NewRequestForm,
  useIsPhone,
  type FounderInboxRow,
  type HubSupportRow,
  type SupportMessageData,
} from '@ventora/screens';
import { HubSettings } from './hubSettings';
import { FX_NAV_SUPPORT, FounderShellDemo } from './founderShell';
import { noop } from './shell';
import f from './frames.module.css';
import { RoIntl } from './ScreenFrames';

const HUB_ROWS: HubSupportRow[] = [
  {
    id: '1',
    ref: 'VS-2026-0142',
    subject: 'Reamintirile SMS nu pleacă la clienții noi',
    app: 'booking',
    appName: 'EasyBook',
    updated: 'acum 20 min',
    status: 'newReply',
  },
  {
    id: '2',
    ref: 'VS-2026-0118',
    subject: 'Cum export facturile pentru contabil?',
    app: 'finance',
    appName: 'MoneyDesk',
    updated: 'ieri',
    status: 'inProgress',
  },
  {
    id: '3',
    ref: 'VS-2026-0097',
    subject: 'Vreau să activez CampaignKit',
    app: 'marketing',
    appName: 'CampaignKit',
    updated: '12 oct.',
    status: 'resolved',
  },
  {
    id: '4',
    ref: 'VS-2026-0081',
    subject: 'Eroare la importul clienților din Excel',
    app: 'crm',
    appName: 'ClientDesk',
    updated: '3 oct.',
    status: 'resolved',
  },
];

const APP_OPTIONS = [
  { value: 'platform', label: 'Hub (cont, abonament, echipă)' },
  { value: 'booking', label: 'EasyBook' },
  { value: 'finance', label: 'MoneyDesk' },
  { value: 'crm', label: 'ClientDesk' },
];

function Form() {
  return (
    <NewRequestForm
      apps={APP_OPTIONS}
      values={{ applicationId: 'booking', subject: '', description: '', urgency: 'normal' }}
      onChange={noop}
      files={[]}
      onFiles={noop}
      onRemoveFile={noop}
      onRetryFile={noop}
      onSubmit={noop}
      locale="ro"
    />
  );
}

export function HubSupportFrame() {
  const phone = useIsPhone();
  return (
    <HubSettings active="suport" title="Suport">
      <HubSupportView
        layout={phone ? 'phone-list' : 'desktop'}
        rows={HUB_ROWS}
        form={<Form />}
        onOpen={noop}
        onNew={noop}
      />
    </HubSettings>
  );
}

const THREAD: SupportMessageData[] = [
  {
    id: 'm1',
    team: false,
    name: 'Tu',
    avatarName: 'Bianca Petrașcu',
    time: '27 oct., 09:14',
    body: 'Clienții adăugați de ieri nu primesc reamintirea cu o zi înainte. Cei vechi o primesc.',
    files: [{ id: 'f1', name: 'captura-programari.png', size: '1,2 MB', icon: 'image', href: '#' }],
  },
  {
    id: 'm2',
    team: true,
    name: 'Mihai Ionescu',
    avatarName: 'Mihai Ionescu',
    badge: 'Echipa Ventora Systems',
    time: '27 oct., 11:02',
    body: 'Mulțumim pentru captură. Verificăm setările de trimitere pentru clienții noi.',
    files: [],
  },
  {
    id: 'm3',
    team: true,
    name: 'Mihai Ionescu',
    avatarName: 'Mihai Ionescu',
    badge: 'Echipa Ventora Systems',
    time: 'azi, 09:40',
    body: 'Clienții noi au fost importați fără acordul pentru SMS bifat, așa că reamintirea nu pleacă. Bifează „Acceptă SMS” în fișa lor sau la import și reamintirile pornesc de la următoarea programare.',
    files: [{ id: 'f2', name: 'pasii-import.pdf', size: '220 KB', icon: 'file-text', href: '#' }],
  },
];

export function HubSupportThreadFrame() {
  const phone = useIsPhone();
  return (
    <HubSettings active="suport" title="Suport">
      <HubSupportThreadView
        mob={phone}
        subject="Reamintirile SMS nu pleacă la clienții noi"
        status="newReply"
        meta="EasyBook · deschisă pe 27 oct. · VS-2026-0142"
        messages={THREAD}
        history={[
          { icon: 'message-square', text: 'Răspuns nou de la Mihai Ionescu', time: 'azi, 09:40' },
          { icon: 'clock', text: 'În lucru · Mihai Ionescu', time: '27 oct., 11:02' },
          { icon: 'circle-dot', text: 'Ai deschis solicitarea', time: '27 oct., 09:14' },
        ]}
        composer={{ text: '', files: [] }}
        handlers={{
          onText: noop,
          onFiles: noop,
          onRemoveFile: noop,
          onRetryFile: noop,
          onSend: noop,
        }}
        onReopen={noop}
        onCancelReopen={noop}
        onBack={noop}
        locale="ro"
      />
    </HubSettings>
  );
}

const INBOX: FounderInboxRow[] = [
  {
    id: '1',
    ref: 'VS-2026-0187',
    subject: 'Avansul nu apare în fișa clientului',
    blocking: true,
    business: 'Salon Aurora',
    app: 'EasyBook',
    last: 'Bianca Petrașcu, acum 12 min',
    status: 'open',
  },
  {
    id: '2',
    ref: 'VS-2026-0185',
    subject: 'Nu pot exporta facturile din octombrie',
    blocking: false,
    business: 'Clinica Dentis Sibiu',
    app: 'MoneyDesk',
    last: 'Andrei Mureșan, azi, 09:12',
    status: 'open',
  },
  {
    id: '3',
    ref: 'VS-2026-0142',
    subject: 'Reamintirile SMS nu pleacă la clienții noi',
    blocking: false,
    business: 'Salon Aurora',
    app: 'EasyBook',
    last: 'Bianca Petrașcu, ieri, 16:05',
    status: 'open',
  },
];

const FOUNDER_BOTTOM = ['afaceri', 'cereri', 'suport'];

export function FounderInboxFrame() {
  const phone = useIsPhone();
  return (
    <FounderShellDemo
      active="suport"
      title="Suport"
      bottomItems={FOUNDER_BOTTOM}
      sections={FX_NAV_SUPPORT}
    >
      <FounderSupportInboxView
        mob={phone}
        rows={INBOX}
        group="open"
        counts={{ open: 3, progress: 2, overdue: 0 }}
        apps={[
          { value: 'booking', label: 'EasyBook' },
          { value: 'finance', label: 'MoneyDesk' },
          { value: 'shifts', label: 'ShiftPlan' },
          { value: 'platform', label: 'Hub' },
        ]}
        app={null}
        businesses={[
          { value: 'a', label: 'Salon Aurora' },
          { value: 'b', label: 'Clinica Dentis Sibiu' },
        ]}
        business={null}
        search=""
        onGroup={noop}
        onApp={noop}
        onBusiness={noop}
        onSearch={noop}
        onClear={noop}
        onOpen={noop}
        onOpenBusiness={noop}
        onClose={noop}
      />
    </FounderShellDemo>
  );
}

export function FounderThreadFrame() {
  const phone = useIsPhone();
  return (
    <FounderShellDemo
      active="suport"
      title="Suport"
      bottomItems={FOUNDER_BOTTOM}
      sections={FX_NAV_SUPPORT}
    >
      <FounderSupportThreadView
        mob={phone}
        subject="Avansul nu apare în fișa clientului"
        status="open"
        blocking
        meta="Salon Aurora · EasyBook · deschisă pe 4 nov. · VS-2026-0187"
        messages={[
          {
            id: 'm1',
            team: false,
            name: 'Bianca Petrașcu',
            avatarName: 'Bianca Petrașcu',
            badge: 'Salon Aurora · proprietar',
            time: 'azi, 10:41',
            body: 'Clienta Cristina Dobre a plătit avansul de 50 lei la rezervarea online, dar în fișa ei nu apare nimic. În Stripe plata se vede.',
            files: [
              { id: 'f1', name: 'fisa-client.png', size: '640 KB', icon: 'image', href: '#' },
            ],
          },
        ]}
        side={{
          business: 'Salon Aurora',
          owner: 'Bianca Petrașcu',
          plan: 'Business · 12 membri',
          sentBy: 'Bianca Petrașcu (proprietar)',
        }}
        requesterName="Bianca Petrașcu"
        composer={{ text: '', files: [] }}
        handlers={{
          onText: noop,
          onFiles: noop,
          onRemoveFile: noop,
          onRetryFile: noop,
          onSend: noop,
        }}
        onSendClose={noop}
        onMarkProgress={noop}
        onCloseRequest={noop}
        onOpenBusiness={noop}
        onOpenSession={noop}
        onBack={noop}
      />
    </FounderShellDemo>
  );
}

/** Light and dark, full width (1280 or 390 after the window), with the height of the preview. */
export function SupportFrames({
  title,
  height,
  phoneHeight = 2000,
  founder,
  children,
}: {
  title: string;
  height: number;
  /** On phones the whole page, as the 390 frames of the preview. */
  phoneHeight?: number;
  founder?: boolean;
  children: ReactNode;
}) {
  const phone = useIsPhone();
  return (
    <RoIntl founder={founder}>
      <div className={f.base}>
        <p className="heading">{title}</p>
        {(['light', 'dark'] as const).map((th) => (
          <div
            key={th}
            className={f.scr}
            data-gallery-frame
            data-theme={th}
            style={{ height: phone ? phoneHeight : height, width: '100%' }}
          >
            {children}
          </div>
        ))}
      </div>
    </RoIntl>
  );
}
