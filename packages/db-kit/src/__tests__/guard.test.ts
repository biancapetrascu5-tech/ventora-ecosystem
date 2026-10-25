import { describe, expect, it } from 'vitest';
import {
  MissingBulkFilterError,
  MissingTenantContextError,
  guardBulkOp,
  guardTenant,
} from '../guard';

describe('guardTenant', () => {
  it('nu aruncă dacă ctx are organizationId', () => {
    expect(() => guardTenant({ organizationId: 'org-1' })).not.toThrow();
  });

  it('aruncă MissingTenantContextError dacă ctx e null', () => {
    expect(() => guardTenant(null)).toThrow(MissingTenantContextError);
  });

  it('aruncă MissingTenantContextError dacă ctx e undefined', () => {
    expect(() => guardTenant(undefined)).toThrow(MissingTenantContextError);
  });

  it('aruncă MissingTenantContextError dacă organizationId e șir gol', () => {
    expect(() => guardTenant({ organizationId: '' })).toThrow(MissingTenantContextError);
  });

  it('acceptă ctx cu câmpuri opționale', () => {
    expect(() =>
      guardTenant({ organizationId: 'org-1', userId: 'user-1', actor: 'user' }),
    ).not.toThrow();
  });
});

describe('guardBulkOp', () => {
  it('nu aruncă dacă filter are câmpuri', () => {
    expect(() => guardBulkOp('deleteMany', { organizationId: 'org-1' })).not.toThrow();
  });

  it('aruncă MissingBulkFilterError dacă filter e null', () => {
    expect(() => guardBulkOp('deleteMany', null)).toThrow(MissingBulkFilterError);
  });

  it('aruncă MissingBulkFilterError dacă filter e undefined', () => {
    expect(() => guardBulkOp('updateMany', undefined)).toThrow(MissingBulkFilterError);
  });

  it('aruncă MissingBulkFilterError dacă filter e obiect gol', () => {
    expect(() => guardBulkOp('updateMany', {})).toThrow(MissingBulkFilterError);
  });

  it('mesajul de eroare conține numele operației', () => {
    expect(() => guardBulkOp('updateMany', null)).toThrow(/updateMany/);
  });

  it('nu aruncă cu mai multe câmpuri în filter', () => {
    expect(() =>
      guardBulkOp('updateMany', { organizationId: 'org-1', status: 'active' }),
    ).not.toThrow();
  });
});
