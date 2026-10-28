// Platform-level permissions (not tied to a purchasable application).
// authorize() skips the entitlement check for this application id: the Hub itself is
// always enabled for an organization. Synced by scripts/sync-permissions.ts like any manifest.
export const PLATFORM_APPLICATION_ID = 'platform';

export const platformManifest = {
  applicationId: PLATFORM_APPLICATION_ID,
  permissions: [
    { name: 'audit.log.read', description: "Read the organization's audit log" },
    {
      name: 'support.session.read',
      description: 'See support sessions opened by the Ventora team, with reason and request',
    },
    { name: 'support.session.close', description: 'Close a support session (D11)' },
  ],
  // D4: only owner and admin read the organization's audit log.
  // Lot 2.5c: owner and admin see the support sessions in detail; only the owner closes one
  // (D11). Every member sees the banner (no permission, see getSupportSessionBanner).
  defaultGrants: {
    owner: ['audit.log.read', 'support.session.read', 'support.session.close'],
    admin: ['audit.log.read', 'support.session.read'],
  },
} as const;
