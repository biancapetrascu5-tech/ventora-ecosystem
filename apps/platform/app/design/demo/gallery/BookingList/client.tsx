/* eslint-disable i18next/no-literal-string -- the example data and frame labels of preview.html */
'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { DataTableAction, DataTableKey, DataTableSort } from '@ventora/ui';
import { BookingListView, SettingsToast, type ListRow, type ScreenMode } from '@ventora/booking/ui';
import { noop } from '../_shared/shell';
import { LxApp, RoApp } from '../_shared/easybook-shell';
import { MESSAGES, STAFF, lx, rowsOf, type Lang, type Theme } from '../_shared/booking-rows';
import f from '../_shared/frames.module.css';

/* BookingList (Decision 7, screen 4) in the gallery: the frames of preview.html, in its order — the
   list with filters, pills, selection with the bulk bar, sorting and pagination (Desktop 1280 ·
   Tabletă 820 · Telefon 390, light and dark); the states „căutare fără rezultate în perioadă” and
   „export cu filtrele active” (RO desktop light, RO phone dark); the DE / IT label test (DE desktop
   light, IT phone light, IT desktop dark, DE phone dark). The list is the component of the
   application with the texts of its keys; „Trimite reamintire” is drawn here only (no backend for
   a reminder on demand yet). */

function Shell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const title = lang === 'ro' ? 'Programări' : lang === 'de' ? 'Termine' : 'Appuntamenti';
  if (lang === 'ro') {
    return (
      <RoApp active="programari" title={title}>
        {children}
      </RoApp>
    );
  }
  return (
    <LxApp lang={lang} active="programari" title={title}>
      {children}
    </LxApp>
  );
}

function List({ mode, lang }: { mode: ScreenMode; lang: Lang }) {
  const t = useTranslations('booking');
  const [sel, setSel] = useState<DataTableKey[]>(mode === 'mobile' ? [] : ['2', '5']);
  const [sort, setSort] = useState<DataTableSort | null>({ key: 'when', dir: 'asc' });
  const actions = (r: ListRow): DataTableAction[] => [
    { label: t('list.actions.open'), icon: 'external-link' },
    r.status === 'unconfirmed'
      ? { label: t('action.confirm'), icon: 'check' }
      : { label: t('list.actions.remind'), icon: 'send' },
    { label: t('action.move'), icon: 'calendar' },
    { label: t('action.noShow'), icon: 'circle-x' },
    { separator: true },
    { label: t('action.cancel'), icon: 'trash-2', destructive: true },
  ];
  return (
    <BookingListView
      mode={mode}
      description
      onExport={noop}
      wide={lang !== 'ro'}
      rows={rowsOf(lang)}
      onRowClick={noop}
      rowActions={actions}
      query=""
      period="today"
      staff={STAFF.map((m) => ({ id: m.id, name: lx(m.name, lang) }))}
      staffFilter="all"
      state="active"
      filterCount={2}
      pills={[
        {
          id: 'period',
          label: t('list.pill.period', { value: t('list.periodValue.today') }),
          onRemove: noop,
        },
        {
          id: 'state',
          label: t('list.pill.state', { value: t('list.stateValue.active') }),
          onRemove: noop,
        },
      ]}
      onClearFilters={noop}
      sort={sort}
      onSortChange={setSort}
      selected={sel}
      onSelectedChange={setSel}
      bulkActions={[
        { label: t('list.bulk.confirm'), icon: 'check' },
        { label: t('list.bulk.remind'), icon: 'send' },
        { label: t('list.bulk.cancel'), icon: 'trash-2', destructive: true },
      ]}
      pagination={{
        page: 1,
        pageSize: 20,
        total: 14,
        onPageChange: noop,
        onPageSizeChange: noop,
      }}
    />
  );
}

// preview.html ListNoResults: the search „Mureșan” finds nothing today, 3 results on other days
function NoResults({ mode }: { mode: ScreenMode }) {
  const t = useTranslations('booking');
  return (
    <>
      <BookingListView
        mode={mode}
        description
        onExport={noop}
        controls={false}
        rows={[]}
        query="Mureșan"
        period="today"
        staff={STAFF}
        staffFilter="all"
        state="active"
        filterCount={2}
        pills={[
          {
            id: 'period',
            label: t('list.pill.period', { value: t('list.periodValue.today') }),
            onRemove: noop,
          },
          {
            id: 'state',
            label: t('list.pill.state', { value: t('list.stateValue.active') }),
            onRemove: noop,
          },
        ]}
        onClearFilters={noop}
        otherDays={{ count: 3, onShow: noop }}
      />
      {mode === 'desktop' && (
        <SettingsToast
          mode={mode}
          framed
          title={t('list.exported.title', { n: 14 })}
          description={t('list.exported.filters', {
            filters: `${t('list.exported.period', { value: t('list.periodValue.today') })}, ${t('list.exported.state', { value: t('list.stateValue.active') })}`,
          })}
          action={{ label: t('list.exported.open'), onClick: noop }}
          onDismiss={noop}
        />
      )}
    </>
  );
}

/* ── the frames ─────────────────────────────────────────────────────────────────────────── */

const WIDTH: Record<ScreenMode, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const SIZE_LABEL: Record<ScreenMode, string> = {
  desktop: 'Desktop · 1280',
  tablet: 'Tabletă portret · 820',
  mobile: 'Telefon · 390',
};
// preview.html Screens: desktopH 900, tabletH 1100, mobileH 1100 (LX_Frames: 900 / 1100)
const HEIGHT: Record<ScreenMode, number> = { desktop: 900, tablet: 1100, mobile: 1100 };

function Frame({
  lang,
  mode,
  theme,
  state = 'list',
  height,
  label,
}: {
  lang: Lang;
  mode: ScreenMode;
  theme: Theme;
  state?: 'list' | 'none';
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
          <div style={{ position: 'relative', height: '100%' }}>
            <Shell lang={lang}>
              {state === 'list' ? <List mode={mode} lang={lang} /> : <NoResults mode={mode} />}
            </Shell>
          </div>
        </div>
      </NextIntlClientProvider>
    </div>
  );
}

export function BookingListGallery() {
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">
          EasyBook — Lista de programări: filtre, sortare, selecție, acțiuni în bloc, paginare
        </p>
        {(['light', 'dark'] as const).map((th) => (
          <div className={f.scrRow} key={th}>
            {(['desktop', 'tablet', 'mobile'] as const).map((m) => (
              <Frame key={m} lang="ro" mode={m} theme={th} />
            ))}
          </div>
        ))}
        <p className="heading">
          Stări: căutare fără rezultate în perioada filtrată · export cu filtrele active
        </p>
        <div className={f.scrRow}>
          <Frame
            lang="ro"
            mode="desktop"
            theme="light"
            state="none"
            height={720}
            label="Română · "
          />
          <Frame lang="ro" mode="mobile" theme="dark" state="none" height={720} label="Română · " />
        </div>
        <p className="heading">DE / IT — test de lungime a textelor: lista de programări</p>
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
