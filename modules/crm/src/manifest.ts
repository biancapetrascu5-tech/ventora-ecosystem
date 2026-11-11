import type { ApplicationManifest } from '@ventora/contracts';

/*
 * Lot CR.0 — the ClientDesk manifest (plans/CRM.md). The permissions are checked by authorize() in
 * every contract (T3 generated from here); the quota keys are synced into the commercial registry
 * at deploy (scripts/sync-commercial-registry.ts). The Growth placements and signals (§8.7) are
 * not declared: ApplicationManifest has no such fields yet (D-GRW-3); they come with Growth v1.
 *
 * D-CRM-15 = a: owner, admin and the application manager see everything; a member works on the
 * contacts, leads and deals assigned to them and the unassigned ones (filtered in the contracts,
 * from CR.2); only crm:export exports, only crm:import imports. An external collaborator gets
 * nothing: the commercial relationship is private to the business.
 *
 * Decision of 11.11.2026 (S130): exporting is for the owner and the admin only — the application
 * manager runs ClientDesk but does not take its data out of it.
 */
export const manifest = {
  applicationId: 'crm',
  permissions: [
    { name: 'crm:read', description: 'View contacts, companies, leads, deals and activities' },
    { name: 'crm:write', description: 'Create and update contacts, leads, deals and activities' },
    { name: 'crm:admin', description: 'See and change every record, reassign, merge' },
    {
      name: 'crm:settings',
      description: 'Manage pipelines, stages, custom fields, tags, sources and automations',
    },
    { name: 'crm:import', description: 'Import contacts from CSV / Excel' },
    { name: 'crm:export', description: 'Export contacts, leads, deals and reports' },
  ],
  defaultGrants: {
    owner: '*',
    admin: '*',
    member: ['crm:read', 'crm:write'],
    external_collaborator: [],
    application_manager: ['crm:read', 'crm:write', 'crm:admin', 'crm:settings', 'crm:import'],
  },
  quotas: [
    {
      // D-CRM-4 = a: only the contacts created in ClientDesk (by hand, import, form, conversion);
      // the ones linked from EasyBook do not count. Archiving releases the unit.
      key: 'crm.contacts',
      kind: 'stock',
      unit: 'contact',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Contacts created in ClientDesk',
    },
    {
      key: 'crm.pipelines',
      kind: 'stock',
      unit: 'pipeline',
      period: null,
      overflow: 'block',
      refundable: false,
      description: 'Sales pipelines',
    },
  ],
} as const satisfies ApplicationManifest;

export type CrmPermission = (typeof manifest.permissions)[number]['name'];
