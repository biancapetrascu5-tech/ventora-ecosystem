/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Combobox, FormField, type ComboboxLabels } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro", first: true })
const NAMES = [
  'Ana Popescu',
  'Andrei Ionescu',
  'Bianca Marin',
  'Cristina Dobre',
  'Dan Stoica',
  'Elena Georgescu',
  'Ioana Pavel',
  'Ștefan Țăranu',
];
const OPTS = NAMES.map((n, i) => ({ value: i, label: n, description: `07${40 + i} 123 45${i}` }));
const T = {
  l: [
    'Deschis · filtrat după „an”',
    'Fără rezultate',
    'Mai multe valori (chips)',
    'Valoare aleasă',
    'Eroare',
    'Dezactivat',
    'Se încarcă (căutare pe măsură ce scrii)',
  ],
  client: 'Client',
  helper: 'Caută după nume sau telefon.',
  ph: 'Caută clientul',
  part: 'Participanți',
  chosen: 'Client ales',
  err: 'Alege un client din listă.',
  dis: 'Client (dezactivat)',
  load: 'Client',
  q0: 'Țăranu Ș',
  closed:
    'Lista se deschide la focus; deschisă e arătată doar în cadrul Light (stă deasupra paginii).',
};
// S.remove, S.clearChoice, S.loading, S.noResults, S.noResultsFor (ro)
const LABELS: ComboboxLabels = {
  remove: 'Elimină',
  clearChoice: 'Șterge alegerea',
  loading: 'Se încarcă…',
  noResults: 'Niciun rezultat',
  noResultsFor: (q) => `Niciun rezultat pentru „${q}”`,
};
const noop = () => {};

function Board({ first }: { first: boolean }) {
  const L = T.l;
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <div className={f.pvGrid2} style={{ minHeight: first ? 380 : 0 }}>
        <PvCell label={L[0]!}>
          <FormField label={T.client} hint={T.helper}>
            <Combobox
              labels={LABELS}
              options={OPTS}
              defaultOpen={first}
              defaultQuery="an"
              placeholder={T.ph}
            />
          </FormField>
        </PvCell>
        <PvCell label={L[1]!}>
          <FormField label={T.client}>
            <Combobox
              labels={LABELS}
              options={OPTS}
              defaultOpen={first}
              defaultQuery={T.q0}
              placeholder={T.ph}
            />
          </FormField>
        </PvCell>
      </div>
      {!first && <p className={`caption ${f.pvNote}`}>{T.closed}</p>}
      <div className={f.pvGrid}>
        <PvCell label={L[2]!}>
          <FormField label={T.part}>
            <Combobox
              labels={LABELS}
              multiple
              options={OPTS}
              defaultValue={[0, 2, 7]}
              icon="users"
            />
          </FormField>
        </PvCell>
        <PvCell label={L[3]!}>
          <FormField label={T.chosen}>
            <Combobox labels={LABELS} options={OPTS} defaultValue={3} />
          </FormField>
        </PvCell>
        <PvCell label={L[4]!}>
          <FormField label={T.client} isRequired error={T.err}>
            <Combobox labels={LABELS} options={OPTS} isInvalid placeholder={T.ph} />
          </FormField>
        </PvCell>
        <PvCell label={L[5]!}>
          <FormField label={T.dis}>
            <Combobox labels={LABELS} options={OPTS} isDisabled placeholder={T.ph} />
          </FormField>
        </PvCell>
        <PvCell label={L[6]!}>
          <FormField label={T.load}>
            <Combobox
              labels={LABELS}
              options={OPTS}
              isLoading
              filter={false}
              onQueryChange={noop}
              defaultQuery="Io"
              placeholder={T.ph}
            />
          </FormField>
        </PvCell>
      </div>
    </div>
  );
}

export default function ComboboxGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={(th) => <Board first={th === 'light'} />} />;
}
