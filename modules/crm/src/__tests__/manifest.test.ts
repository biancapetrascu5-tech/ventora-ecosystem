import { describe, expect, it } from 'vitest';
import { manifest } from '../manifest';

// Lot CR.0 (plans/CRM.md): the permissions (D-CRM-15 = a) and the quota keys (D-CRM-4 = a,
// PRETURI-2027.md: 3.000 contacts, 2 pipelines).
describe('crm manifest', () => {
  const grants = manifest.defaultGrants as Record<string, '*' | readonly string[]>;
  const names = manifest.permissions.map((p) => p.name);

  it('declares the six crm permissions, each with the crm: prefix', () => {
    expect(names).toEqual([
      'crm:read',
      'crm:write',
      'crm:admin',
      'crm:settings',
      'crm:import',
      'crm:export',
    ]);
  });

  it('D-CRM-15: owner and admin everything; the application manager all but the export (11.11, S130)', () => {
    expect(grants.owner).toBe('*');
    expect(grants.admin).toBe('*');
    expect([...(grants.application_manager as readonly string[])].sort()).toEqual(
      names.filter((n) => n !== 'crm:export').sort(),
    );
  });

  it('D-CRM-15: a member reads and writes, never exports, imports, merges or changes settings', () => {
    expect(grants.member).toEqual(['crm:read', 'crm:write']);
  });

  it('an external collaborator gets nothing: the commercial relationship is private', () => {
    expect(grants.external_collaborator).toEqual([]);
  });

  it('every granted permission is declared', () => {
    for (const g of Object.values(grants)) {
      if (g === '*') continue;
      for (const p of g) expect(names).toContain(p);
    }
  });

  it('crm.contacts and crm.pipelines are stock quotas, blocked over the limit, not refundable', () => {
    const byKey = Object.fromEntries(manifest.quotas.map((q) => [q.key, q]));
    expect(Object.keys(byKey).sort()).toEqual(['crm.contacts', 'crm.pipelines']);
    for (const q of Object.values(byKey)) {
      expect(q).toMatchObject({
        kind: 'stock',
        period: null,
        overflow: 'block',
        refundable: false,
      });
    }
  });
});
