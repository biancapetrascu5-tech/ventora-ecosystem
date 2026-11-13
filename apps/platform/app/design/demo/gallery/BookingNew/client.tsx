/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import type { SlotItem } from '@ventora/ui';
import {
  BookingNewBar,
  BookingNewView,
  type NewForm,
  type NewService,
  type ScreenMode,
} from '@ventora/booking/ui';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import bookingRo from '@ventora/booking/messages/ro.json';
import bookingDe from '@ventora/booking/messages/de.json';
import bookingIt from '@ventora/booking/messages/it.json';
import { noop } from '../_shared/shell';
import { LxApp, RoApp } from '../_shared/easybook-shell';
import f from '../_shared/frames.module.css';

/* BookingNew (B.6c) in the gallery: the frames of preview.html, in its order — the screens
   (Desktop 1280 · Tabletă 820 · Telefon 390, light and dark), „pornită din profilul clientului, cu
   «Oricine e liber»” (RO desktop light, RO phone dark) and the DE / IT label test (DE desktop light,
   IT phone light, IT desktop dark, DE phone dark). The screen is the component of the application
   (modules/booking/src/ui) with the texts of its keys; only the example data is fixed here (Salon
   Aurora, Tuesday 27 Oct 2026, today Friday 23 Oct). */

type Lang = 'ro' | 'de' | 'it';
type Theme = 'light' | 'dark';
const MESSAGES: Record<Lang, Record<string, unknown>> = {
  ro: { ...ro, booking: bookingRo },
  de: { ...de, booking: bookingDe },
  it: { ...it, booking: bookingIt },
};

// preview.html LX_MAP: the example data in the label test
const LX: Record<string, [string, string]> = {
  'Tratament facial': ['Gesichtsbehandlung', 'Trattamento viso'],
  Tuns: ['Haarschnitt', 'Taglio'],
  Cosmetică: ['Kosmetik', 'Estetica'],
  Coafor: ['Friseur', 'Parrucchiere'],
  'Ioana Pavel': ['Lena Wolf', 'Chiara Bruno'],
  'Mara Enache': ['Mara Klein', 'Sara Conti'],
  'Radu Matei': ['Jonas Weber', 'Luca Ferri'],
  Manichiură: ['Maniküre', 'Manicure'],
  Frizerie: ['Barbier', 'Barbiere'],
  'Cristina Dobre': ['Christina Bauer', 'Cristina Greco'],
  'Ana Popescu': ['Anna Schmidt', 'Anna Russo'],
  'Elena Georgescu': ['Elena Hoffmann', 'Elena Ricci'],
};
const lx = (s: string, lang: Lang) => (lang !== 'ro' && LX[s] ? LX[s][lang === 'de' ? 0 : 1] : s);
// the staff's sub-line in the label test (LX_MAP: Coafor → Friseurin / Parrucchiera)
const ROLE: Record<string, [string, string]> = {
  Coafor: ['Friseurin', 'Parrucchiera'],
  Manichiură: ['Maniküre', 'Manicure'],
  Frizerie: ['Barbier', 'Barbiere'],
};
const role = (s: string, lang: Lang) =>
  lang !== 'ro' && ROLE[s] ? ROLE[s][lang === 'de' ? 0 : 1] : s;
const phone = (p: string, lang: Lang) =>
  lang === 'de' ? `0151 ${p.slice(5)}` : lang === 'it' ? `347 ${p.slice(5)}` : p;

const ALL = ['ioana', 'mara', 'radu'];
function servicesOf(lang: Lang): NewService[] {
  const eur = lang !== 'ro';
  return [
    {
      id: 'facial',
      name: lx('Tratament facial', lang),
      category: lx('Cosmetică', lang),
      durationMinutes: 45,
      durationMaxMinutes: null,
      priceKind: 'fixed',
      priceMinor: eur ? 4500 : 22000,
      priceMaxMinor: null,
      currency: eur ? 'EUR' : 'RON',
      staffIds: ALL,
    },
    {
      id: 'tuns',
      name: lx('Tuns', lang),
      category: lx('Coafor', lang),
      durationMinutes: 45,
      durationMaxMinutes: null,
      priceKind: 'fixed',
      priceMinor: eur ? 2500 : 12000,
      priceMaxMinor: null,
      currency: eur ? 'EUR' : 'RON',
      staffIds: ALL,
    },
  ];
}
const staffOf = (lang: Lang) =>
  (
    [
      ['ioana', 'Ioana Pavel', 'Coafor'],
      ['mara', 'Mara Enache', 'Manichiură'],
      ['radu', 'Radu Matei', 'Frizerie'],
    ] as const
  ).map(([id, name, r]) => ({ id, name: lx(name, lang), role: role(r, lang) }));
const clientsOf = (lang: Lang) =>
  (
    [
      ['1', 'Cristina Dobre', '0742 220 118', 5],
      ['2', 'Ana Popescu', '0740 123 450', 0],
      ['3', 'Elena Georgescu', '0746 412 980', 0],
    ] as const
  ).map(([id, name, p, visits]) => ({
    id,
    name: lx(name, lang),
    phone: phone(p, lang),
    visits: visits || undefined,
  }));

// preview.html NEW_SLOTS / NW_ANY_SLOTS
const slots = (times: string[], taken: number[]): SlotItem[] =>
  times.map((time, i) => ({ time, available: !taken.includes(i) }));
const NEW_SLOTS = slots(
  [
    '09:00',
    '09:45',
    '10:30',
    '11:15',
    '12:00',
    '13:15',
    '14:00',
    '15:15',
    '16:00',
    '16:45',
    '17:30',
    '18:15',
  ],
  [0, 3, 4, 8],
);
const ANY_SLOTS = slots(
  [
    '09:00',
    '09:30',
    '09:45',
    '10:30',
    '11:00',
    '11:15',
    '12:00',
    '12:30',
    '13:15',
    '14:00',
    '14:30',
    '15:15',
    '16:00',
    '16:45',
    '17:30',
    '18:15',
  ],
  [0, 5],
);

function New({ mode, lang, any }: { mode: ScreenMode; lang: Lang; any?: boolean }) {
  const [form, setForm] = useState<NewForm>({
    serviceId: 'facial',
    staffId: any ? 'any' : 'ioana',
    date: '2026-10-27',
    time: '13:15',
    clientId: '1',
    newClient: null,
    note: '',
  });
  const [notify, setNotify] = useState({ confirm: true, remind: true });
  const submit = noop;
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Shell lang={lang} active={any ? 'clienti' : 'programari'}>
        <BookingNewView
          mode={mode}
          start={any ? 'client' : 'service'}
          listHref="#"
          fromClient={any ? { name: 'Cristina Dobre', href: '#', clientsHref: '#' } : undefined}
          services={servicesOf(lang)}
          staff={staffOf(lang)}
          terms={[]}
          form={form}
          onChange={(patch) => setForm((x) => ({ ...x, ...patch }))}
          today="2026-10-23"
          closedWeekdays={[7]}
          slots={any ? ANY_SLOTS : NEW_SLOTS}
          clients={clientsOf(lang)}
          notify={{ ...notify, onChange: setNotify }}
          onSubmit={submit}
          onCancel={noop}
        />
      </Shell>
      {mode === 'mobile' && <BookingNewBar time={form.time} onSubmit={submit} onCancel={noop} />}
    </div>
  );
}

const TITLE: Record<Lang, string> = {
  ro: 'Programare nouă',
  de: 'Neuer Termin',
  it: 'Nuovo appuntamento',
};

function Shell({ lang, active, children }: { lang: Lang; active: string; children: ReactNode }) {
  if (lang === 'ro') {
    return (
      <RoApp active={active} title={TITLE.ro}>
        {children}
      </RoApp>
    );
  }
  return (
    <LxApp lang={lang} active={active} title={TITLE[lang]}>
      {children}
    </LxApp>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};
// preview.html Screens: desktopH 1280, tabletH 1700, mobileH 1600
const HEIGHT: Record<ScreenMode, number> = { desktop: 1280, tablet: 1700, mobile: 1600 };

function Frame({
  lang,
  mode,
  theme,
  any,
  height,
  label,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  any?: boolean;
  height?: number;
  label?: string;
}) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>
        {label ?? ''}
        {SIZE_LABEL[mode]} · {theme === 'light' ? 'Light' : 'Dark'}
      </p>
      <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Europe/Bucharest">
        <div
          className={`${f.scr} ${f.scrD}`}
          data-gallery-frame
          data-theme={theme}
          lang={lang}
          style={{
            width: WIDTH[mode],
            height: height ?? HEIGHT[mode],
            position: 'relative',
            overflow: 'hidden',
            ...(mode === 'desktop' ? {} : { borderRadius: 'var(--radius-xl)' }),
          }}
        >
          <New mode={mode} lang={lang} any={any} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingNewGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">EasyBook — Formularul de creare a unei programări</p>
        {(['light', 'dark'] as const).map((th) => (
          <div className={f.scrRow} key={th}>
            {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
              <Frame key={m} lang="ro" mode={m} theme={th} />
            ))}
          </div>
        ))}
        <p className="heading">
          Stare: programare pornită din profilul clientului, cu „Oricine e liber”
        </p>
        <div className={f.scrRow}>
          <Frame lang="ro" mode="desktop" theme="light" any height={1340} label="Română · " />
          <Frame lang="ro" mode="mobile" theme="dark" any height={1700} label="Română · " />
        </div>
        <p className="heading">DE / IT — test de lungime a textelor: programare nouă</p>
        <div className={f.scrRow}>
          <Frame lang="de" mode="desktop" theme="light" label="Deutsch · " />
          <Frame lang="it" mode="mobile" theme="light" label="Italiano · " />
        </div>
        <div className={f.scrRow}>
          <Frame lang="it" mode="desktop" theme="dark" label="Italiano · " />
          <Frame lang="de" mode="mobile" theme="dark" label="Deutsch · " />
        </div>
      </div>
    </div>
  );
}
