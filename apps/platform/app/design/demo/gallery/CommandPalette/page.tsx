/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import {
  CommandPalette,
  type CommandGroup,
  type CommandPaletteLabels,
  type IconName,
} from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro" })
const L = [
  'Deschis · primul rând activ (săgețile mută, Enter rulează)',
  'Se încarcă (rezultate de pe server)',
  'Fără rezultate',
];
const noop = () => {};
type Raw = [string, IconName, string[] | null, string?];
const G: [string, Raw[]][] = [
  [
    'Pagini',
    [
      ['Azi', 'house', ['G', 'A']],
      ['Calendar', 'calendar', ['G', 'C']],
      ['Programări', 'list', null],
    ],
  ],
  [
    'Persoane',
    [
      ['Ana Popescu', 'user', null, 'Client · 0740 123 450'],
      ['Ștefan Țăranu', 'user', null, 'Client · 0741 123 451'],
    ],
  ],
  [
    'Comenzi',
    [
      ['Creează programare', 'plus', ['N']],
      ['Schimbă afacerea', 'building-2', null],
      ['Temă întunecată', 'moon', null],
    ],
  ],
];
const GROUPS: CommandGroup[] = G.map(([label, items]) => ({
  label,
  items: items.map(([l, icon, shortcut, description]) => ({
    id: l,
    label: l,
    icon,
    shortcut: shortcut ?? undefined,
    description,
    onSelect: noop,
  })),
}));
// S.commandPlaceholder, S.loading, S.noResults, S.noResultsFor, S.navigate, S.choose, S.dismiss (ro)
const LABELS: CommandPaletteLabels = {
  placeholder: 'Caută o pagină, o persoană sau o comandă…',
  loading: 'Se încarcă…',
  noResults: 'Niciun rezultat',
  noResultsFor: (q) => `Niciun rezultat pentru „${q}”`,
  navigate: 'navighează',
  choose: 'alege',
  dismiss: 'închide',
};

function Board() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)',
        gap: 'var(--space-5)',
        alignItems: 'start',
      }}
    >
      <PvCell label={L[0]!}>
        <CommandPalette inline isOpen groups={GROUPS} labels={LABELS} />
      </PvCell>
      <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
        <PvCell label={L[1]!}>
          <CommandPalette
            inline
            isOpen
            onQueryChange={noop}
            isLoading
            groups={[]}
            labels={LABELS}
          />
        </PvCell>
        <PvCell label={L[2]!}>
          <CommandPalette inline isOpen groups={[]} labels={LABELS} />
        </PvCell>
      </div>
    </div>
  );
}

export default function CommandPaletteGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
