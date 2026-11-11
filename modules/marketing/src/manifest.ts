import type { ApplicationManifest } from '@ventora/contracts';

/*
 * Lot MK.0 — the CampaignKit manifest (plans/CAMPAIGNKIT.md). The permissions are checked by
 * authorize() in every contract (from MK.1); the defaults follow CampaignKitSettings · „Cine ce
 * poate face” (S139):
 *   owner, admin  → everything; schedule without approval; approve members' campaigns; settings;
 *   member        → prepares campaigns and posts as drafts, makes audiences, sees the reports of
 *                   their own campaigns (filtered in the contracts); no import, export, approval,
 *                   automations, settings or purchases (D-CK-14: members' campaigns are approved);
 *   application_manager → as admin, without buying (billing.purchase stays the owner's, D3-8).
 *
 * Quotas: CampaignKit takes `marketing.campaigns` over from the platform manifest (the registry
 * sync moves the owner, the key stays) and makes it a STOCK quota (D-CK-3 = a): every scheduled or
 * active campaign holds one unit, released when it ends or is stopped; 20 at a time, plus the
 * „+10 campanii” pack (price: D-CK-18). `messaging.email` (D-CK-4 = a: one key shared with
 * ClientDesk, the limits of the active applications add up in core/commercial entitlements) and
 * `messaging.sms` stay in the platform manifest: they are Core messaging, not CampaignKit's.
 *
 * Growth (D-GRW-3): one card slot on the dashboard aside (owner and admins only — the slot reader
 * filters by role, CampaignKitDashboard), none in the sending, approval, import or unsubscribe
 * flows (critical). No growth signal yet: A/B is not a plan feature (D-CK-18 still open).
 */
export const manifest = {
  applicationId: 'marketing',
  permissions: [
    { name: 'marketing:read', description: 'See campaigns, audiences, contacts and reports' },
    {
      name: 'marketing:write',
      description: 'Prepare campaigns, posts and audiences (as drafts, for approval)',
    },
    { name: 'marketing:send', description: 'Schedule and send without approval' },
    { name: 'marketing:approve', description: "Approve or reject members' campaigns" },
    { name: 'marketing:import', description: 'Import marketing contacts' },
    { name: 'marketing:export', description: 'Export contacts and reports' },
    { name: 'marketing:automations', description: 'Turn the predefined automations on and off' },
    {
      name: 'marketing:settings',
      description: 'Change the sending settings, the sender, the frequency cap and the roles',
    },
  ],
  defaultGrants: {
    owner: '*',
    admin: '*',
    member: ['marketing:read', 'marketing:write'],
    external_collaborator: [],
    application_manager: [
      'marketing:read',
      'marketing:write',
      'marketing:send',
      'marketing:approve',
      'marketing:import',
      'marketing:export',
      'marketing:automations',
      'marketing:settings',
    ],
  },
  quotas: [
    {
      key: 'marketing.campaigns',
      kind: 'stock',
      unit: 'campaign',
      period: null,
      overflow: 'block',
      // a stock unit is released when the campaign ends or stops; nothing to refund
      refundable: false,
      description: 'Campaigns scheduled or active at the same time (D-CK-3)',
    },
  ],
  placements: [
    { id: 'marketing.dashboard.aside', kind: 'card', critical: false, userInitiated: false },
  ],
  growthSignals: [],
} as const satisfies ApplicationManifest;

export type MarketingPermission = (typeof manifest.permissions)[number]['name'];
