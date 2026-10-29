/* Datele de exemplu din preview.html, comune galeriilor și panourilor de stări. */
import type { InviteData } from '@/screens/auth/InviteView';

export const DEMO_INVITE: InviteData = {
  inviterName: 'Bianca Petrașcu',
  businessName: 'Salon Aurora',
  roleName: 'Recepție',
  apps: ['booking', 'crm', 'shifts'],
  email: 'ioana.pavel@salonaurora.ro',
  expires: '31 octombrie 2026',
};

// Cheia din preview („JBSW Y3DP EHPK 3PXP Q2NM 7K4R WX5T LA6C”), într-un URI otpauth de test.
export const DEMO_TOTP_URI =
  'otpauth://totp/Ventora%20Hub:bianca%40salonaurora.ro?secret=JBSWY3DPEHPK3PXPQ2NM7K4RWX5TLA6C&issuer=Ventora%20Hub';

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
