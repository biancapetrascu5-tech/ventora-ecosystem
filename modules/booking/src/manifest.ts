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
} as const;

export type BookingPermission = (typeof manifest.permissions)[number]['name'];
