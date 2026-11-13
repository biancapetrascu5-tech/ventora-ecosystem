/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html (S123, S129, S137–S138) */
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
  termsForm,
  type FormErrors,
  type MemberTermsForm,
  type ScreenMode,
  type ServiceForm,
  type ServiceRow,
  type TeamMember,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import { noop } from '../_shared/shell';
import { BookingApp } from '../_shared/booking-shell';
import f from '../_shared/frames.module.css';

/* BookingServices in the gallery: the frames of preview.html that draw this screen (S123 1–15,
   S129 16–17, S137–S138 21–24), each at 1280 / 820 / 390, light and dark, with the same example
   data (Salon Aurora). Frames 18–20 and 25–32 draw the effect in BookingNew and BookingPublic and
   come with those screens. The screen is the component of the application
   (modules/booking/src/ui); only the data and the open dialogs are fixed here. */

const MESSAGES = { ...ro, booking: bookingRo };

// preview.html TEAM (S129)
const TEAM: TeamMember[] = [
  { id: 'ioana', name: 'Ioana Pavel', role: 'Stilist' },
  { id: 'mara', name: 'Mara Enache', role: 'Manichiuristă' },
  { id: 'radu', name: 'Radu Matei', role: 'Stilist' },
  { id: 'diana', name: 'Diana Ilie', role: 'Cosmeticiană' },
  { id: 'sorin', name: 'Sorin Vlad', role: 'Maseur' },
];
// preview.html WHO, by the services' order (s1 … s14)
const WHO: Record<string, string[]> = {
  s1: ['ioana', 'radu'],
  s2: ['ioana', 'radu'],
  s3: ['ioana', 'radu'],
  s4: ['ioana', 'radu'],
  s5: ['ioana'],
  s6: ['mara'],
  s7: ['mara'],
  s8: ['mara'],
  s9: ['diana'],
  s10: ['diana', 'mara'],
  s11: ['sorin'],
  s12: ['sorin'],
  s13: ['ioana', 'diana'],
  s14: [],
};
// preview.html OVR (S137–S138): the members' own duration and price; prices in lei
type Ovr = { d: number; dmax?: number; pk: ServiceRow['priceKind']; p: number; pmax?: number };
const OVR: Record<string, Record<string, Ovr>> = {
  s1: { ioana: { d: 60, pk: 'fixed', p: 150 } },
  s3: { ioana: { d: 90, dmax: 120, pk: 'from', p: 260 } },
  s4: { ioana: { d: 75, dmax: 120, pk: 'range', p: 200, pmax: 300 } },
};
// preview.html DEP: the deposit of „Tratament facial” (BookingDeposit), in bani
const DEP: Record<string, number> = { s9: 10000 };

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
  const id = `s${seq}`;
  return {
    id,
    doneBy: WHO[id] ?? [],
    varies: !!OVR[id],
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

const termsOf = (s: ServiceRow, ovr: Record<string, Ovr>): Record<string, MemberTermsForm> =>
  Object.fromEntries(
    Object.entries(ovr).map(([id, o]) => [
      id,
      termsForm(s, {
        durationMinutes: o.d,
        durationMaxMinutes: o.dmax ?? o.d,
        price: { kind: o.pk, minor: o.p * 100, maxMinor: o.pmax ? o.pmax * 100 : null },
      }),
    ]),
  );

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

const formOf = (
  s: ServiceRow,
  who: ServiceForm['who'] = s.doneBy,
  ovr: Record<string, Ovr> = OVR[s.id] ?? {},
): ServiceForm => ({
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
  who,
  terms: termsOf(s, ovr),
});
// preview.html NEW_S (who: ioana, radu — the members who already do „Păr”)
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
  ['ioana', 'radu'],
  {},
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
          team={TEAM}
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
  fromCategory,
  open,
  deposit,
}: {
  mode: ScreenMode;
  form: ServiceForm;
  isNew?: boolean;
  errors?: FormErrors;
  fromCategory?: string;
  open?: string;
  deposit?: number;
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
      team={TEAM}
      fromCategory={fromCategory}
      openMember={open}
      depositMinor={deposit}
    />
  );
}

const svcAt = (cat: number, i: number) => CATS[cat]?.services[i] as ServiceRow;

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
      '1 · Lista: categoriile, „Fără categorie”, cine face fiecare serviciu; un serviciu pe care nu-l face nimeni',
      (m) => <Page mode={m} />,
      1920,
      1990,
      2180,
    ],
    [
      '2 · Serviciu nou: durată fixă, preț fix; bifați cine face deja servicii din categorie',
      (m) => (
        <Page mode={m} drawer={<Drawer mode={m} form={NEW_FORM} isNew fromCategory="Păr" />} />
      ),
      1920,
      1990,
      2180,
    ],
    [
      '3 · Editare: durată variabilă, preț „de la”, în euro, doar de echipă',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={bride} />} />,
      1920,
      1990,
      2180,
    ],
    [
      '4 · Erori: nume duplicat, durată invalidă',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={errForm} errors={errors} />} />,
      1920,
      1990,
      2180,
    ],
    [
      '5 · Salvat',
      (m) => <Page mode={m} toast={{ title: t('saved', { name: 'Masaj terapeutic' }) }} />,
      1920,
      1990,
      2180,
    ],
    [
      '6 · Categorie nouă',
      (m) => (
        <Page mode={m} overlay={<CategoryDialog framed mode={m} name="" onNameChange={noop} />} />
      ),
      1920,
      1990,
      2180,
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
      1920,
      1990,
      2180,
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
      1920,
      1990,
      2180,
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
      1920,
      1990,
      2180,
    ],
    [
      '10 · Arhivezi un serviciu',
      (m) => (
        <Page
          mode={m}
          overlay={<ArchiveServiceDialog framed mode={m} name="Vopsit rădăcină" futureCount={3} />}
        />
      ),
      1920,
      1990,
      2180,
    ],
    [
      '11 · O categorie cu servicii active nu se poate arhiva',
      (m) => (
        <Page
          mode={m}
          overlay={<CategoryBlockedDialog framed mode={m} name="Păr" activeCount={5} />}
        />
      ),
      1920,
      1990,
      2180,
    ],
    ['12 · Filtrul „Arhivate”', (m) => <Page mode={m} archived />, 760, 750, 840],
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
      710,
      700,
      770,
    ],
    ['14 · „Arhivate” gol', (m) => <Page mode={m} archived emptyArchived />, 560, 560, 540],
    ['15 · Starea goală: niciun serviciu', (m) => <Page mode={m} empty />, 560, 560, 580],
    [
      '16 · „Cine îl face”: toată echipa, inclusiv cine intră de acum',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={formOf(svcAt(2, 1), 'all')} />} />,
      1920,
      1990,
      2180,
    ],
    [
      '17 · Nimeni nu face serviciul: nu se poate rezerva',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={formOf(NOCAT[1] as ServiceRow)} />} />,
      1920,
      1990,
      2180,
    ],
    [
      '21 · Durată și preț pe membru (S137): Ioana Pavel 60 min · 150 lei, Radu Matei cu valorile serviciului (45 min · 120 lei)',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={formOf(svcAt(0, 0))} open="ioana" />} />,
      1920,
      1990,
      2180,
    ],
    [
      '22 · Prețul unui membru e mai mic decât avansul: nu se poate salva',
      (m) => (
        <Page
          mode={m}
          drawer={
            <Drawer
              mode={m}
              form={formOf(svcAt(2, 0), ['diana', 'mara'], { mara: { d: 60, pk: 'fixed', p: 90 } })}
              open="mara"
              deposit={DEP.s9}
            />
          }
        />
      ),
      1920,
      1990,
      2180,
    ],
    [
      '23 · Pe membru, ca la serviciu (S138): durată variabilă și preț „Interval” — Ioana Pavel 75–120 min · 200–300 lei la „Coafat de ocazie”',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={formOf(svcAt(0, 3))} open="ioana" />} />,
      1920,
      1990,
      2180,
    ],
    [
      '24 · Pe membru: preț „De la” — Ioana Pavel 90–120 min · de la 260 lei la „Vopsit rădăcină”',
      (m) => <Page mode={m} drawer={<Drawer mode={m} form={formOf(svcAt(0, 2))} open="ioana" />} />,
      1920,
      1990,
      2180,
    ],
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
      <p className="heading">
        EasyBook — Setări · Servicii: catalogul de servicii (S123; cine îl face, S129; durată și
        preț pe membru, S137–S138)
      </p>
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
