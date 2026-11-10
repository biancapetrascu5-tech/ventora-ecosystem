import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Lotul 5.11 — „Growth oprit = aplicațiile identice” (ARCHITECTURE §8.7). Cu oprirea globală
 * pornită (getSlotContent dă null) sau cu core/growth care aruncă, fiecare slot al Hub-ului dă
 * null: ecranul nu desenează nimic (GrowthRecommendation / GrowthSlot fără conținut = nimic),
 * fără spațiu gol, iar citirea paginii merge mai departe.
 */

// un înlocuitor simplu (nu vi.fn): eroarea aruncată trebuie să ajungă doar la readGrowthSlot
let impl: (req: Record<string, unknown>) => Promise<unknown> = async () => null;
const calls: Record<string, unknown>[] = [];
vi.mock('@ventora/growth', () => ({
  getSlotContent: (req: Record<string, unknown>) => {
    calls.push(req);
    return impl(req);
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'ro' }));

const { readGrowthSlot } = await import('../growth-slot');

const who = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  role: 'owner',
};
const SLOTS = [
  'hub.launcher.other',
  'hub.notifications.recommendations',
  'hub.plan.packs',
  'hub.catalog.apps',
];

describe('Growth oprit sau în eroare: sloturile sunt goale', () => {
  beforeEach(() => {
    calls.length = 0;
    impl = async () => null;
  });

  it.each(SLOTS)('%s: oprirea globală (null) → null', async (slot) => {
    await expect(readGrowthSlot(who, slot)).resolves.toBeNull();
  });

  it.each(SLOTS)('%s: core/growth aruncă → null, fără eroare spre pagină', async (slot) => {
    impl = async () => {
      throw new Error('growth down');
    };
    await expect(readGrowthSlot(who, slot)).resolves.toBeNull();
  });

  it('rolurile: owner / admin decid, oricine altcineva e member pentru Growth', async () => {
    await readGrowthSlot({ ...who, role: 'manager' }, 'hub.launcher.other');
    expect(calls[0]).toMatchObject({ role: 'member', locale: 'ro' });
  });
});
