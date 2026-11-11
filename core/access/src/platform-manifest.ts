import type { ApplicationManifest } from '@ventora/contracts';

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
    {
      name: 'billing.purchase',
      description: 'Save the card and buy packs or applications with it (D-COM-6)',
    },
  ],
  // D4: only owner and admin read the organization's audit log.
  // Lot 2.5c: owner and admin see the support sessions in detail; only the owner closes one
  // (D11). Every member sees the banner (no permission, see getSupportSessionBanner).
  // Lot 3.5 (D3-8 a): only the owner buys; granting `billing.purchase` to admin later needs no
  // migration (the permission sync).
  defaultGrants: {
    owner: ['audit.log.read', 'support.session.read', 'support.session.close', 'billing.purchase'],
    admin: ['audit.log.read', 'support.session.read'],
  },
  features: [],
  // Lot 3.1 (D3-14): the initial quotas that no module of this repo owns yet — the platform's
  // own (members, locations), the Core services (messaging, workflows, funnel, ai) and the
  // applications without a module (documents, events). When a module arrives, its manifest takes
  // the key over; the registry sync moves the owner, the key stays (MK.0: marketing.campaigns
  // moved to modules/marketing, as a stock quota, D-CK-3 = a).
  // Synced by scripts/sync-commercial-registry.ts.
  quotas: [
    {
      key: 'platform.members',
      kind: 'stock',
      unit: 'member',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Team seats with an account (active memberships, C-F3-3)',
    },
    {
      key: 'platform.locations',
      kind: 'stock',
      unit: 'location',
      period: null,
      overflow: 'block',
      refundable: false,
      description: "The business's locations",
    },
    {
      key: 'messaging.sms',
      kind: 'flow',
      unit: 'sms',
      period: 'month',
      overflow: 'block',
      refundable: false,
      description: 'SMS sent by Ventora (not from the own SIM, D-SMS-4)',
    },
    {
      key: 'messaging.email',
      kind: 'flow',
      unit: 'email',
      period: 'month',
      overflow: 'block',
      refundable: false,
      description: "Emails to the business's customers",
    },
    {
      key: 'documents.storage',
      kind: 'stock',
      unit: 'gb',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Space taken by documents, in GB',
    },
    {
      key: 'workflows.active',
      kind: 'stock',
      unit: 'workflow',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Workflow automations active at the same time (D-WF-4)',
    },
    {
      key: 'funnel.pages.published',
      kind: 'stock',
      unit: 'page',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Published pages (D-FUN-4)',
    },
    {
      key: 'ai.analyses',
      kind: 'flow',
      unit: 'analysis',
      period: 'month',
      overflow: 'block',
      refundable: false,
      description: 'AI analyses (D4-21)',
    },
    {
      key: 'events.active',
      kind: 'stock',
      unit: 'event',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Published events that have not taken place yet',
    },
    {
      key: 'events.created',
      kind: 'flow',
      unit: 'event',
      period: 'month',
      overflow: 'block',
      refundable: false,
      description: 'Events created',
    },
  ],
} as const satisfies ApplicationManifest;
