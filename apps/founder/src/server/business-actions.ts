'use server';

import { headers } from 'next/headers';
import {
  createBusinessAsFounder,
  getBusinessPageForFounder,
  listBusinessesForFounder,
  reactivateBusiness,
  suspendBusiness,
  type FounderBusiness,
} from '@ventora/access';

/* Afacerile în Founder (Lot 2.8). Sesiunea Founder vine din cookie (requireFounderSession în
   core/access, cu 2FA); erorile tipizate devin rezultate simple pentru ecrane. */

export type BusinessData = {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  owner: { userId: string; name: string; email: string } | null;
  ownerInvitation: { email: string; state: string } | null;
  memberCount: number;
};

const serialize = (b: FounderBusiness): BusinessData => ({
  id: b.id,
  name: b.name,
  status: b.status,
  createdAt: b.createdAt.toISOString(),
  owner: b.owner,
  ownerInvitation: b.ownerInvitation,
  memberCount: b.memberCount,
});

export async function readBusinesses(): Promise<BusinessData[] | null> {
  try {
    return (await listBusinessesForFounder({ founderHeaders: await headers() })).map(serialize);
  } catch {
    return null;
  }
}

export type BusinessPageData = {
  business: BusinessData;
  recent: { id: string; action: string; createdAt: string }[];
};

export async function readBusinessPage(organizationId: string): Promise<BusinessPageData | null> {
  try {
    const page = await getBusinessPageForFounder({
      founderHeaders: await headers(),
      organizationId,
    });
    return {
      business: serialize(page.business),
      recent: page.recent.map((r) => ({
        id: String(r.id),
        action: r.action,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  } catch {
    return null;
  }
}

export async function suspend(organizationId: string, confirmName: string): Promise<boolean> {
  try {
    await suspendBusiness({ founderHeaders: await headers(), organizationId, confirmName });
    return true;
  } catch {
    return false;
  }
}

export async function reactivate(organizationId: string): Promise<boolean> {
  try {
    await reactivateBusiness({ founderHeaders: await headers(), organizationId });
    return true;
  } catch {
    return false;
  }
}

export type CreateResult = { ok: true; organizationId: string } | { ok: false; field?: 'email' };

export async function createBusiness(name: string, ownerEmail: string): Promise<CreateResult> {
  try {
    const { organizationId } = await createBusinessAsFounder({
      founderHeaders: await headers(),
      name,
      ownerEmail,
    });
    return { ok: true, organizationId };
  } catch (err) {
    const e = err as { code?: string; field?: string };
    if (e.code === 'INVALID_INPUT' && e.field === 'ownerEmail')
      return { ok: false, field: 'email' };
    return { ok: false };
  }
}
