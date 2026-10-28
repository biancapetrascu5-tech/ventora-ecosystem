/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, Menu, type MenuEntry } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → MNOpen(MN_RO, "Acțiuni programare", "Acțiuni")
const ITEMS: MenuEntry[] = [
  { heading: 'Programare' },
  { id: 'edit', label: 'Editează', icon: 'pencil', shortcut: ['E'] },
  { id: 'dup', label: 'Duplică', icon: 'copy', description: 'Aceeași oră, săptămâna viitoare' },
  { id: 'cancelled', label: 'Arată și programările anulate', checked: true },
  { id: 'export', label: 'Exportă în Excel', icon: 'download', isDisabled: true },
  {
    render: (
      <p className={`caption ${f.c3lab}`} style={{ padding: 'var(--space-1) var(--space-3)' }}>
        Modificată azi la 14:32 de Ștefan Țăranu
      </p>
    ),
  },
  { separator: true },
  { id: 'cancel', label: 'Anulează programarea', icon: 'trash-2', isDanger: true },
];

export default function MenuGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <C3Pair
      render={() => (
        <div style={{ minHeight: 330 }}>
          <Menu label="Acțiuni programare" defaultOpen placement="bottom-start" items={ITEMS}>
            <Button variant="secondary" iconEnd="chevron-down">
              Acțiuni
            </Button>
          </Menu>
        </div>
      )}
    />
  );
}
