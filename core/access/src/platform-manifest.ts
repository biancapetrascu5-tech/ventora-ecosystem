// Platform-level permissions (not tied to a purchasable application).
// authorize() skips the entitlement check for this application id: the Hub itself is
// always enabled for an organization. Synced by scripts/sync-permissions.ts like any manifest.
export const PLATFORM_APPLICATION_ID = 'platform';

export const platformManifest = {
  applicationId: PLATFORM_APPLICATION_ID,
  permissions: [{ name: 'audit.log.read', description: "Read the organization's audit log" }],
  // D4: only owner and admin read the organization's audit log
  defaultGrants: {
    owner: ['audit.log.read'],
    admin: ['audit.log.read'],
  },
} as const;
