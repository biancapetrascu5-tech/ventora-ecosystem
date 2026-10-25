// Manifestul modulului lab-catalog (ARCHITECTURE §8.4)
// placements și growthSignals sunt goale: Growth Engine nu este implementat încă.
// Acesta este pattern-ul corect de start pentru un modul nou.

export const manifest = {
  id: 'lab-catalog',
  permissions: [
    'catalog.item.read',
    'catalog.item.create',
    'catalog.item.update',
    'catalog.item.archive',
  ],
  features: ['catalog.items'],
  quotas: [
    {
      key: 'catalog.items',
      kind: 'stock' as const,
      unit: 'item',
    },
  ],
  events: {
    emits: ['lab-catalog.item.created.v1'],
    consumes: ['lab-booking.appointment.created.v1'],
  },
  placements: [],
  growthSignals: [],
} as const;
