import type { ApplicationManifest } from '@ventora/contracts';

export const manifest = {
  applicationId: 'booking',
  permissions: [
    { name: 'booking:read', description: 'View appointments' },
    { name: 'booking:write', description: 'Create and update appointments' },
    { name: 'booking:admin', description: 'Manage booking settings and all appointments' },
  ],
  defaultGrants: {
    owner: '*',
    admin: '*',
    member: ['booking:read', 'booking:write'],
    external_collaborator: ['booking:read'],
    application_manager: ['booking:read', 'booking:write', 'booking:admin'],
  },
  // Lot 3.1 (ARCHITECTURE §8.4–8.5): keys synced into the commercial registry
  features: [
    { key: 'booking.sms.ownNumber', description: 'SMS reminders from the own phone (D-SMS-4)' },
  ],
  quotas: [
    {
      key: 'booking.appointments',
      kind: 'flow',
      unit: 'appointment',
      period: 'month',
      overflow: 'block',
      refundable: false,
      description: 'Appointments',
    },
    {
      key: 'booking.sms.devices',
      kind: 'stock',
      unit: 'device',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Phones connected for SMS (D-SMS-4)',
    },
  ],
} as const satisfies ApplicationManifest;

export type BookingPermission = (typeof manifest.permissions)[number]['name'];
