'use client';

import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  Input,
  Menu,
  SegmentedControl,
  Sheet,
  SheetSection,
  StatusPill,
  type DataTableAction,
  type DataTableColumn,
  type MenuEntry,
} from '@ventora/ui';
import { useServiceTexts, useTableLabels, type ServiceRow } from './texts';
import s from './services.module.css';

/* BookingServices (S123): EasyBook · Setări · „Servicii” — the toolbar and the list (categories in
   their order, then „Fără categorie”), or the archived services and categories. Only props: the
   page (apps/platform) and the gallery both draw this component. */

export type ScreenMode = 'desktop' | 'tablet' | 'mobile';

export type CategoryGroup = { id: string; name: string; services: ServiceRow[] };
export type ArchivedServiceRow = ServiceRow & {
  categoryName: string | null;
  categoryArchived: boolean;
  archivedAt: string;
};
export type ArchivedCategoryRow = {
  id: string;
  name: string;
  archivedCount: number;
  archivedAt: string;
};

export type BookingServicesViewProps = {
  mode: ScreenMode;
  view: 'active' | 'archived';
  onViewChange?: (view: 'active' | 'archived') => void;
  query?: string;
  onQueryChange?: (q: string) => void;
  categories: CategoryGroup[];
  uncategorized: ServiceRow[];
  activeCount: number;
  archivedServices: ArchivedServiceRow[];
  archivedCategories: ArchivedCategoryRow[];
  /** Nothing yet, active or archived: the empty state without the toolbar. */
  empty?: boolean;
  onAdd?: () => void;
  onAddCategory?: () => void;
  onOrder?: () => void;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onRenameCategory?: (id: string) => void;
  onArchiveCategory?: (id: string) => void;
  onRestoreCategory?: (id: string) => void;
};

function Toolbar(p: BookingServicesViewProps) {
  const { t } = useServiceTexts();
  const mob = p.mode === 'mobile';
  const desk = p.mode === 'desktop';
  const items: MenuEntry[] = [
    ...(desk ? [] : [{ id: 'category', label: t('addCategory'), icon: 'folder' as const }]),
    { id: 'order', label: t('order.label'), icon: 'arrow-up-down' },
  ];
  const more = (
    <Menu items={items} onAction={(id) => (id === 'order' ? p.onOrder?.() : p.onAddCategory?.())}>
      <IconButton icon="ellipsis-vertical" label={t('more')} size="sm" />
    </Menu>
  );
  const search = (
    <div className={s.search}>
      <Input
        icon="search"
        size="sm"
        placeholder={t('search')}
        aria-label={t('search')}
        value={p.query ?? ''}
        onChange={(e) => p.onQueryChange?.(e.target.value)}
      />
    </div>
  );
  const seg = (
    <SegmentedControl
      size="sm"
      aria-label={t('filter.label')}
      value={p.view === 'archived' ? 'arch' : 'act'}
      onChange={(v) => p.onViewChange?.(v === 'arch' ? 'archived' : 'active')}
      options={[
        { value: 'act', label: t('filter.active', { n: p.activeCount }) },
        { value: 'arch', label: t('filter.archived', { n: p.archivedServices.length }) },
      ]}
    />
  );
  const add = (
    <Button size="sm" variant="primary" icon="plus" onPress={p.onAdd}>
      {t('add')}
    </Button>
  );
  if (mob) {
    return (
      <div className={`${s.tools} ${s.m}`}>
        <div className={s.line}>
          {search}
          {more}
        </div>
        <div className={s.line}>
          {seg}
          <span className={s.grow} />
          {add}
        </div>
      </div>
    );
  }
  return (
    <div className={s.tools}>
      {search}
      {seg}
      <span className={s.grow} />
      {desk && (
        <Button size="sm" variant="quiet" icon="arrow-up-down" onPress={p.onOrder}>
          {t('order.label')}
        </Button>
      )}
      {desk && (
        <Button size="sm" icon="folder" onPress={p.onAddCategory}>
          {t('addCategory')}
        </Button>
      )}
      {add}
      {!desk && more}
    </div>
  );
}

function useColumns(): DataTableColumn<ServiceRow>[] {
  const x = useServiceTexts();
  const { t } = x;
  return [
    { key: 'name', header: t('col.name'), primary: true, render: (r) => r.name },
    { key: 'dur', header: t('col.duration'), secondary: true, width: '120px', render: x.duration },
    {
      key: 'price',
      header: t('col.price'),
      secondary: true,
      align: 'end',
      width: '128px',
      render: (r) => <span className={s.num}>{x.price(r)}</span>,
    },
    {
      key: 'cap',
      header: t('col.capacity'),
      optional: true,
      width: '168px',
      render: (r) => x.capacity(r.capacity),
    },
    {
      key: 'online',
      header: t('col.online'),
      trailing: true,
      width: '152px',
      render: (r) =>
        r.bookableOnline ? (
          <StatusPill tone="done" icon="globe">
            {t('online.yes')}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" icon="users">
            {t('online.no')}
          </StatusPill>
        ),
    },
  ];
}

function ActiveList(p: BookingServicesViewProps & { matches: (r: ServiceRow) => boolean }) {
  const x = useServiceTexts();
  const { t } = x;
  const labels = useTableLabels();
  const columns = useColumns();
  const rowActions = (r: ServiceRow): DataTableAction[] => [
    { label: t('action.edit'), icon: 'pencil', onClick: () => p.onEdit?.(r.id) },
    { separator: true },
    { label: t('action.archive'), onClick: () => p.onArchive?.(r.id) },
  ];
  const filtering = !!p.query?.trim();
  const groups = p.categories
    .map((c) => ({ ...c, rows: c.services.filter(p.matches) }))
    .filter((c) => !filtering || c.rows.length > 0);
  const loose = p.uncategorized.filter(p.matches);
  if (filtering && groups.length === 0 && loose.length === 0) {
    return (
      <Sheet>
        <SheetSection>
          <EmptyState
            size="sm"
            icon="search"
            title={t('noResults', { q: p.query?.trim() ?? '' })}
          />
        </SheetSection>
      </Sheet>
    );
  }
  return (
    <Sheet>
      {groups.map((c) => (
        <SheetSection
          key={c.id}
          title={c.name}
          description={x.count(c.services.length)}
          actions={
            <Menu
              items={[
                { id: 'rename', label: t('cat.rename'), icon: 'pencil' },
                { separator: true },
                { id: 'archive', label: t('cat.archive') },
              ]}
              onAction={(id) =>
                id === 'rename' ? p.onRenameCategory?.(c.id) : p.onArchiveCategory?.(c.id)
              }
            >
              <IconButton icon="ellipsis-vertical" label={`${t('more')} · ${c.name}`} />
            </Menu>
          }
        >
          {c.rows.length > 0 && (
            <DataTable
              caption={c.name}
              columns={columns}
              rows={c.rows}
              rowActions={rowActions}
              labels={labels}
            />
          )}
        </SheetSection>
      ))}
      {loose.length > 0 && (
        <SheetSection
          title={t('uncategorized')}
          description={`${x.count(p.uncategorized.length)} · ${t('uncategorizedLead')}`}
        >
          <DataTable
            caption={t('uncategorized')}
            columns={columns}
            rows={loose}
            rowActions={rowActions}
            labels={labels}
          />
        </SheetSection>
      )}
    </Sheet>
  );
}

function ArchivedList(p: BookingServicesViewProps) {
  const x = useServiceTexts();
  const { t } = x;
  const labels = useTableLabels();
  if (p.archivedServices.length === 0 && p.archivedCategories.length === 0) {
    return (
      <Sheet>
        <SheetSection>
          <EmptyState
            size="sm"
            icon="folder"
            title={t('emptyArchived.title')}
            description={t('emptyArchived.body')}
          />
        </SheetSection>
      </Sheet>
    );
  }
  const columns: DataTableColumn<ArchivedServiceRow>[] = [
    { key: 'name', header: t('col.name'), primary: true, render: (r) => r.name },
    {
      key: 'cat',
      header: t('col.category'),
      secondary: true,
      render: (r) =>
        r.categoryName === null
          ? t('uncategorized')
          : r.categoryArchived
            ? t('archived.catArchived', { category: r.categoryName })
            : r.categoryName,
    },
    { key: 'dur', header: t('col.duration'), optional: true, render: x.duration },
    {
      key: 'price',
      header: t('col.price'),
      optional: true,
      align: 'end',
      render: (r) => <span className={s.num}>{x.price(r)}</span>,
    },
    {
      key: 'at',
      header: t('col.archivedAt'),
      trailing: true,
      render: (r) => <span className="body-small muted">{r.archivedAt}</span>,
    },
  ];
  return (
    <Sheet>
      {p.archivedServices.length > 0 && (
        <SheetSection
          title={t('archived.title')}
          description={`${x.count(p.archivedServices.length)} · ${t('archived.lead')}`}
        >
          <DataTable
            caption={t('archived.title')}
            columns={columns}
            rows={p.archivedServices}
            rowActions={(r) => [
              {
                label: t('action.restore'),
                icon: 'rotate-ccw',
                onClick: () => p.onRestore?.(r.id),
              },
            ]}
            labels={labels}
          />
        </SheetSection>
      )}
      {p.archivedCategories.length > 0 && (
        <SheetSection title={t('archived.categories')} description={t('archived.categoriesLead')}>
          <DataTable
            caption={t('archived.categories')}
            columns={[
              { key: 'name', header: t('cat.name'), primary: true },
              {
                key: 'n',
                header: t('title'),
                secondary: true,
                render: (r: ArchivedCategoryRow) => x.archivedCount(r.archivedCount),
              },
              {
                key: 'at',
                header: t('col.archivedAt'),
                trailing: true,
                render: (r: ArchivedCategoryRow) => (
                  <span className="body-small muted">{r.archivedAt}</span>
                ),
              },
            ]}
            rows={p.archivedCategories}
            rowActions={(r) => [
              {
                label: t('cat.restore'),
                icon: 'rotate-ccw',
                onClick: () => p.onRestoreCategory?.(r.id),
              },
            ]}
            labels={labels}
          />
        </SheetSection>
      )}
    </Sheet>
  );
}

export function BookingServicesView(
  p: BookingServicesViewProps & { matches?: (r: ServiceRow) => boolean },
) {
  const { t } = useServiceTexts();
  const matches = p.matches ?? (() => true);
  const body = p.empty ? (
    <Sheet>
      <SheetSection>
        <EmptyState
          icon="boxes"
          title={t('empty.title')}
          description={t('empty.body')}
          actions={
            <Button variant="primary" icon="plus" onPress={p.onAdd}>
              {t('empty.action')}
            </Button>
          }
        />
      </SheetSection>
    </Sheet>
  ) : (
    <>
      <Toolbar {...p} />
      {p.view === 'archived' ? <ArchivedList {...p} /> : <ActiveList {...p} matches={matches} />}
    </>
  );
  return <div className={s.body}>{body}</div>;
}
