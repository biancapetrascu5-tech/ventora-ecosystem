/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (HubEmpty, S146) */
'use client';

import {
  AppShell,
  BrandZone,
  NotificationsPanel,
  type AppName,
  type NotificationData,
} from '@ventora/ui';
import { LauncherScreen } from '@/screens/launcher/LauncherScreen';
import type { AccessRequestState } from '@/screens/launcher/HubEmptyBody';
import type { LauncherData } from '@/server/launcher-actions';
import { HubBarLeading } from '../_shared/hubLauncher';
import { NOTIF_RO } from '../_shared/labels';
import { Bar } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

/* HubEmpty (S146, lotul 5.1c) → planșele preview-ului:
   - „Starea goală”: light înainte de cerere, dark după „Cere acces”;
   - `?board=sent`: light „Cerere trimisă · 25 oct.”, dark „Trimite din nou” (au trecut 7 zile);
   - `?board=errors`: light cererea nu a plecat, dark afacerea suspendată între timp;
   - `?board=owner`: „Au nevoie de tine” pe launcher; dark și notificarea din clopoțel.
   Aceeași afacere ca în preview: Salon Aurora, Bianca Petrașcu proprietar, duminică 25 oct. */
const NOW = '2026-10-25T07:00:00.000Z';
const MINE = ['booking', 'crm', 'hr', 'finance', 'projects', 'shifts', 'documents'] as const;
const OTHER = [
  { app: 'inventory', state: 'unavailable' },
  { app: 'analytics', state: 'notInRole' },
  { app: 'marketing', state: 'notInPlan' },
  { app: 'network', state: 'notInPlan' },
] as const;

const base = {
  ownerName: 'Bianca Petrașcu',
  timeZone: 'Europe/Bucharest',
  recommendation: null,
  trialEnding: null,
  supportEmail: 'support@ventorasystems.com',
};

function emptyData(requested: boolean): LauncherData {
  return {
    ...base,
    apps: ([...MINE, 'inventory', 'analytics', 'marketing', 'network'] as AppName[]).map((app) => ({
      app,
      state: 'notInRole' as const,
    })),
    role: 'member',
    appointmentsToday: null,
    accessRequest: requested
      ? { requestedAt: '2026-10-25T06:30:00.000Z', canResendAt: '2026-11-01T06:30:00.000Z' }
      : null,
    needsYou: [],
  };
}

function ownerData(): LauncherData {
  return {
    ...base,
    ownerName: null,
    apps: [...MINE.map((app) => ({ app, state: 'available' as const })), ...OTHER],
    role: 'owner',
    appointmentsToday: 8,
    accessRequest: null,
    needsYou: [
      {
        userId: 'u-andrei',
        name: 'Andrei Popa',
        role: 'member',
        requestedAt: '2026-10-25T07:12:00.000Z',
        again: false,
      },
    ],
  };
}

const NOTIFS: NotificationData[] = [
  {
    id: 9,
    title: 'Andrei Popa cere acces la aplicații',
    body: 'Are rolul Membru în Salon Aurora, dar nicio aplicație. Le alegi din Echipă și invitații.',
    app: 'Hub',
    time: '09:12',
    icon: 'key-round',
  },
  {
    id: 1,
    title: 'Programare nouă de la Ana Popescu',
    body: 'Joi, 29 oct., 14:30 · Tuns',
    app: 'EasyBook',
    time: 'acum 5 min',
    person: 'Ana Popescu',
  },
  {
    id: 2,
    title: 'Factura #2026-114 e restantă de 3 zile',
    body: 'Clinica Dentis · 1.250 lei',
    app: 'MoneyDesk',
    time: 'acum 2 ore',
    icon: 'receipt',
  },
];

export type HubEmptyBoard = 'empty' | 'sent' | 'errors' | 'owner';

export function HubEmptyFrame({
  board,
  theme,
  phone,
}: {
  board: HubEmptyBoard;
  theme: 'light' | 'dark';
  phone: boolean;
}) {
  const dark = theme === 'dark';
  let data: LauncherData;
  let state: AccessRequestState | undefined;
  if (board === 'owner') data = ownerData();
  else if (board === 'sent') {
    data = emptyData(true);
    state = dark ? 'resend' : 'sent';
  } else if (board === 'errors') {
    data = emptyData(false);
    state = dark ? 'suspended' : 'error';
  } else data = emptyData(dark);
  return (
    <div className={c.xFrame} style={{ position: 'relative' }}>
      <AppShell
        height="100%"
        contextBar={
          <BrandZone>
            <Bar title="" hub leading={<HubBarLeading />} />
          </BrandZone>
        }
      >
        <LauncherScreen
          data={data}
          userName="Bianca Petrașcu"
          businessName="Salon Aurora"
          now={NOW}
          requestState={state}
        />
      </AppShell>
      {board === 'owner' && dark && (
        <div
          style={{
            position: 'absolute',
            top: phone ? 56 : 64,
            right: phone ? 8 : 16,
            left: phone ? 8 : 'auto',
            width: phone ? 'auto' : 400,
            zIndex: 5,
          }}
        >
          <NotificationsPanel inline items={NOTIFS} labels={NOTIF_RO} />
        </div>
      )}
    </div>
  );
}
