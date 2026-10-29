/* Datele de exemplu din preview-urile Founder. */
export const FX_MAIL = 'bianca@ventora-hub.com';
export const FX_USER = { name: 'Bianca Petrașcu', email: 'bianca@ventora.ro' };
export const DEMO_TOTP_URI =
  'otpauth://totp/Ventora%20Founder:bianca%40ventora-hub.com?secret=JBSWY3DPEHPK3PXPQ2NM7K4RWX5TLA6C&issuer=Ventora%20Founder';
export const DEMO_BACKUP_CODES = [
  '4829 1736',
  '6051 2984',
  '3317 8402',
  '9275 0618',
  '1846 5390',
  '7702 4153',
  '2569 8817',
  '8034 6271',
  '5193 0745',
  '0468 3529',
];
export const DEMO_ORG = { organizationName: 'Clinica Dentis Sibiu', expiresAt: '16:30' };
export const DEMO_OWNERS = [
  { value: 'am', label: 'Andrei Mureșan · andrei@dentis.ro' },
  { value: 'lm', label: 'Laura Mureșan · laura@dentis.ro' },
];

import type { NotificationData } from '@ventora/ui';
export const FX_NOTIFS: NotificationData[] = [
  {
    id: 1,
    title: 'Am oprit automat „Marketing pentru saloane”',
    body: 'Rata de deranjare a ajuns la 6,2% (prag: 5%).',
    app: 'Growth',
    time: 'azi, 09:41',
    icon: 'triangle-alert',
  },
  {
    id: 2,
    title: 'Plată eșuată: Fitness Atlas',
    body: '449 lei · a doua încercare mâine',
    app: 'Afaceri',
    time: 'ieri',
    icon: 'circle-x',
  },
  {
    id: 3,
    title: 'O excepție expiră pe 30 octombrie',
    body: 'Salon Aurora · 12 angajați în loc de 10',
    app: 'Afaceri',
    time: 'ieri',
    icon: 'clock',
    read: true,
  },
];
