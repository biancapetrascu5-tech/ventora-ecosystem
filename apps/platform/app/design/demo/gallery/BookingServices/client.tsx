/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html (S123) */
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import {
  ArchiveServiceDialog,
  BookingServicesView,
  BookingSettingsHeader,
  CategoryBlockedDialog,
  CategoryDialog,
  CategoryOrderDialog,
  FrameOverlay,
  ServiceFormDrawer,
  ServicesToast,
  servicesStyles,
  useServiceTexts,
  type ArchivedServiceRow,
  type CategoryGroup,
  type FormErrors,
  type ScreenMode,
  type ServiceForm,
  type ServiceRow,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-shell';
import f from '../_shared/frames.module.css';

/* BookingServices (S123) in the gallery: the 15 frames of preview.html, each at 1280 / 820 / 390,
   light and dark, with the same example data (Salon Aurora). The screen is the component of the
   application (modules/booking/src/ui); only the data and the open dialogs are fixed here. */

const MESSAGES = { ...ro, booking: bookingRo };

// preview.html svc(id, name, d, dmax, pk, p, pmax, cur, cap, online) — prices in lei, here in bani
let seq = 0;
function svc(
  name: string,
  d: number,
  dmax: number,
  pk: ServiceRow['priceKind'],
  p: number,
  pmax: number,
  cur: ServiceRow['currency'],
  cap: number,
  online: boolean,
  categoryId: string | null,
  description: string | null = null,
): ServiceRow {
  seq += 1;
  return {
    id: `s${seq}`,
    name,
    categoryId,
    description,
    durationMinutes: d,
    durationMaxMinutes: dmax || null,
    priceKind: pk,
    priceMinor: p * 100,
    priceMaxMinor: pmax ? pmax * 100 : null,
    currency: cur,
    capacity: cap,
    bookableOnline: online,
  };
}

const CATS: CategoryGroup[] = [
  {
    id: 'par',
    name: 'Păr',
    services: [
      svc('Tuns damă', 45, 0, 'fixed', 120, 0, 'RON', 1, true, 'par'),
      svc('Tuns bărbați', 30, 0, 'fixed', 70, 0, 'RON', 1, true, 'par'),
      svc('Vopsit rădăcină', 90, 0, 'from', 220, 0, 'RON', 1, true, 'par'),
      svc('Coafat de ocazie', 60, 90, 'range', 150, 250, 'RON', 1, true, 'par'),
      svc('Tratament cu keratină', 120, 180, 'from', 400, 0, 'RON', 1, false, 'par'),
    ],
  },
  {
    id: 'unghii',
    name: 'Unghii',
    services: [
      svc('Manichiură semipermanentă', 60, 0, 'fixed', 130, 0, 'RON', 2, true, 'unghii'),
      svc('Pedichiură', 60, 0, 'fixed', 150, 0, 'RON', 1, true, 'unghii'),
      svc('Întreținere gel', 75, 0, 'fixed', 160, 0, 'RON', 2, true, 'unghii'),
    ],
  },
  {
    id: 'cosm',
    name: 'Cosmetică',
    services: [
      svc('Tratament facial', 45, 0, 'fixed', 220, 0, 'RON', 1, true, 'cosm'),
      svc('Pensat', 15, 0, 'fixed', 40, 0, 'RON', 1, true, 'cosm'),
    ],
  },
  {
    id: 'masaj',
    name: 'Masaj',
    services: [
      svc('Masaj de relaxare', 60, 0, 'fixed', 200, 0, 'RON', 1, true, 'masaj'),
      svc('Masaj terapeutic', 30, 90, 'range', 150, 300, 'RON', 1, true, 'masaj'),
    ],
  },
];
const NOCAT: ServiceRow[] = [
  svc(
    'Pachet mireasă',
    120,
    240,
    'from',
    250,
    0,
    'EUR',
    1,
    false,
    null,
    'Probă, coafură și machiaj în ziua evenimentului, la salon.',
  ),
  svc('Curs de automachiaj', 90, 0, 'fixed', 180, 0, 'RON', 6, true, null),
];
const ARCH: ArchivedServiceRow[] = [
  {
    ...svc('Masaj cu pietre calde', 75, 0, 'fixed', 240, 0, 'RON', 1, true, 'masaj'),
    categoryName: 'Masaj',
    categoryArchived: false,
    archivedAt: '12 oct.',
  },
  {
    ...svc('Extensii de gene', 120, 0, 'fixed', 260, 0, 'RON', 1, true, 'cosm'),
    categoryName: 'Cosmetică',
    categoryArchived: false,
    archivedAt: '3 sept.',
  },
  {
    ...svc('Împletituri de vară', 45, 0, 'fixed', 90, 0, 'RON', 1, true, 'vara'),
    categoryName: 'Pachete de vară',
    categoryArchived: true,
    archivedAt: '1 sept.',
  },
];
const ACTIVE_N = CATS.reduce((n, c) => n + c.services.length, 0) + NOCAT.length;
const CAT_OPTIONS = CATS.map((c) => ({ id: c.id, name: c.name }));

const formOf = (s: ServiceRow): ServiceForm => ({
  name: s.name,
  categoryId: s.categoryId,
  description: s.description ?? '',
  durationKind: s.durationMaxMinutes ? 'variable' : 'fixed',
  duration: String(s.durationMinutes),
  durationMax: s.durationMaxMinutes ? String(s.durationMaxMinutes) : '',
  priceKind: s.priceKind,
  price: String(s.priceMinor / 100),
  priceMax: s.priceMaxMinor ? String(s.priceMaxMinor / 100) : '',
  currency: s.currency,
  capacity: String(s.capacity),
  bookableOnline: s.bookableOnline,
});
// preview.html NEW_S
const NEW_FORM = formOf(
  svc(
    'Balayage',
    150,
    0,
    'fixed',
    450,
    0,
    'RON',
    1,
    true,
    'par',
    'Decolorare în tehnica balayage, tonare și coafat.',
  ),
);

type PageProps = {
  mode: ScreenMode;
  archived?: boolean;
  restored?: boolean;
  empty?: boolean;
  emptyArchived?: boolean;
  drawer?: ReactNode;
  overlay?: ReactNode;
  toast?: { title: string; description?: string };
};

function Page(p: PageProps) {
  const archivedServices = p.emptyArchived
    ? []
    : p.restored
      ? ARCH.filter((r) => !r.categoryArchived)
      : ARCH;
  const archivedCategories = p.emptyArchived
    ? []
    : [
        {
          id: 'vara',
          name: 'Pachete de vară',
          archivedCount: p.restored ? 0 : 1,
          archivedAt: '1 sept.',
        },
      ];
  return (
    <div className={servicesStyles.frame}>
      <BookingApp>
        <BookingSettingsHeader mode={p.mode} />
        <BookingServicesView
          mode={p.mode}
          view={p.archived ? 'archived' : 'active'}
          categories={CATS}
          uncategorized={NOCAT}
          activeCount={ACTIVE_N}
          archivedServices={archivedServices}
          archivedCategories={archivedCategories}
          empty={p.empty}
        />
      </BookingApp>
      {p.drawer}
      {p.overlay ? <FrameOverlay mode={p.mode}>{p.overlay}</FrameOverlay> : null}
      {p.toast ? (
        <ServicesToast
          mode={p.mode}
          framed
          title={p.toast.title}
          description={p.toast.description}
          onDismiss={noop}
          dismissLabel="Închide"
        />
      ) : null}
    </div>
  );
}

function Drawer({
  mode,
  form,
  isNew,
  errors,
}: {
  mode: ScreenMode;
  form: ServiceForm;
  isNew?: boolean;
  errors?: FormErrors;
}) {
  return (
    <ServiceFormDrawer
      framed
      mode={mode}
      isNew={!!isNew}
      editingName={form.name}
      form={form}
      onChange={noop}
      categories={CAT_OPTIONS}
      errors={errors}
      duplicateCategory="Păr"
    />
  );
}

/** The frames whose texts come from the keys (toasts, the dialogs' examples). */
function useFrames(): [string, (m: ScreenMode) => ReactNode, number, number, number][] {
  const { t } = useServiceTexts();
  const bride = formOf(NOCAT[0] as ServiceRow);
  const errForm: ServiceForm = {
    ...formOf(CATS[0]?.services[3] as ServiceRow),
    name: 'Tuns damă',
    duration: '47',
    durationMax: '40',
  };
  const errors: FormErrors = {
    name: { field: 'name', code: 'duplicate' },
    duration: { field: 'duration', code: 'step', a: 45, b: 50 },
    durationMax: { field: 'durationMax', code: 'order' },
  };
  const order = [
    { id: 'par', name: 'Păr', count: 5 },
    { id: 'masaj', name: 'Masaj', count: 2 },
    { id: 'unghii', name: 'Unghii', count: 3 },
    { id: 'cosm', name: 'Cosmetică', count: 2 },
  ];
  return [
    [
      '1 · Lista: categoriile în ordinea lor și „Fără categorie”',
      (m) => <Page mode={m} />,
      1660,
      1730,
      1920,
    ],
    [
      '2 · Serviciu nou: durată fixă, preț fix',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={NEW_FORM} isNew />} />,
      1100,
      1100,
      1400,
    ],
    [
      '3 · Editare: durată variabilă, preț „de la”, în euro, doar de echipă',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={bride} />} />,
      1150,
      1150,
      1450,
    ],
    [
      '4 · Erori: nume duplicat, durată invalidă',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={errForm} errors={errors} />} />,
      1250,
      1250,
      1550,
    ],
    [
      '5 · Salvat',
      (m) => <Page mode={m} toast={{ title: t('saved', { name: 'Masaj terapeutic' }) }} />,
      1100,
      1250,
      1400,
    ],
    [
      '6 · Categorie nouă',
      (m) => (
        <Page mode={m} overlay={<CategoryDialog framed mode={m} name="" onNameChange={noop} />} />
      ),
      1000,
      1150,
      1300,
    ],
    [
      '7 · Redenumește categoria',
      (m) => (
        <Page
          mode={m}
          overlay={
            <CategoryDialog framed mode={m} rename name="Coafură și culoare" onNameChange={noop} />
          }
        />
      ),
      1000,
      1150,
      1300,
    ],
    [
      '8 · Categorie cu nume care există deja',
      (m) => (
        <Page
          mode={m}
          overlay={
            <CategoryDialog framed mode={m} name="Unghii" error="duplicate" onNameChange={noop} />
          }
        />
      ),
      1000,
      1150,
      1300,
    ],
    [
      '9 · Ordinea categoriilor („Masaj” mutată mai sus)',
      (m) => (
        <Page
          mode={m}
          overlay={
            <CategoryOrderDialog
              framed
              mode={m}
              items={order}
              uncategorizedCount={2}
              movedId="masaj"
            />
          }
        />
      ),
      1000,
      1150,
      1300,
    ],
    [
      '10 · Arhivezi un serviciu',
      (m) => (
        <Page
          mode={m}
          overlay={<ArchiveServiceDialog framed mode={m} name="Vopsit rădăcină" futureCount={3} />}
        />
      ),
      1000,
      1150,
      1300,
    ],
    [
      '11 · O categorie cu servicii active nu se poate arhiva',
      (m) => (
        <Page
          mode={m}
          overlay={<CategoryBlockedDialog framed mode={m} name="Păr" activeCount={5} />}
        />
      ),
      1000,
      1150,
      1300,
    ],
    ['12 · Filtrul „Arhivate”', (m) => <Page mode={m} archived />, 850, 900, 1050],
    [
      '13 · Restaurat: categoria lui e arhivată, merge în „Fără categorie”',
      (m) => (
        <Page
          mode={m}
          archived
          restored
          toast={{
            title: t('restore.done', { name: 'Împletituri de vară' }),
            description: t('restore.toUncategorized', { category: 'Pachete de vară' }),
          }}
        />
      ),
      850,
      900,
      1050,
    ],
    ['14 · „Arhivate” gol', (m) => <Page mode={m} archived emptyArchived />, 700, 800, 900],
    ['15 · Starea goală: niciun serviciu', (m) => <Page mode={m} empty />, 700, 800, 900],
  ];
}

const SIZES: [ScreenMode, string, string][] = [
  ['desktop', 'Desktop · 1280', 'd'],
  ['tablet', 'Tabletă portret · 820', 't'],
  ['mobile', 'Telefon · 390', 'm'],
];
const WIDTH = { d: 1280, t: 820, m: 390 } as const;

function Board() {
  const frames = useFrames();
  return (
    <div className={f.scrWrap}>
      <p className="heading">EasyBook — Setări · Servicii: catalogul de servicii (S123)</p>
      {frames.map(([label, render, D, T, M]) => (
        <div key={label} className={f.scrGroup}>
          <p className="subheading">{label}</p>
          {(['light', 'dark'] as const).map((th) => (
            <div className={f.scrRow} key={th}>
              {SIZES.map(([mode, lab, k]) => (
                <div key={mode}>
                  <p className={`caption ${f.scrLab}`}>
                    {lab} · {th === 'light' ? 'Light' : 'Dark'}
                  </p>
                  <div
                    className={`${f.scr} ${f.scrD}`}
                    data-gallery-frame
                    data-frame={k}
                    data-theme={th}
                    style={{
                      width: WIDTH[k as keyof typeof WIDTH],
                      height: k === 'd' ? D : k === 't' ? T : M,
                      position: 'relative',
                      overflow: 'hidden',
                      ...(k === 'd' ? {} : { borderRadius: 'var(--radius-xl)' }),
                    }}
                  >
                    {render(mode)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function BookingServicesGallery() {
  return (
    <NextIntlClientProvider locale="ro" messages={MESSAGES} timeZone="Europe/Bucharest">
      <div className={f.base}>
        <Board />
      </div>
    </NextIntlClientProvider>
  );
}
