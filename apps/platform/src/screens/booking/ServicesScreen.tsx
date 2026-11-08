'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  ArchiveServiceDialog,
  BookingServicesView,
  BookingSettingsHeader,
  CategoryBlockedDialog,
  CategoryDialog,
  CategoryOrderDialog,
  ServiceFormDrawer,
  ServicesToast,
  emptyServiceForm,
  findNameClash,
  formFromService,
  matchesQuery,
  moveItem,
  validateServiceForm,
  type ArchivedCategoryRow,
  type ArchivedServiceRow,
  type CategoryGroup,
  type FormErrors,
  type OrderItem,
  type ScreenMode,
  type ServiceForm,
} from '@ventora/booking/ui';
import {
  archiveCategoryAction,
  archiveServiceAction,
  readServicesPage,
  reorderCategories,
  restoreCategoryAction,
  restoreServiceAction,
  saveCategory,
  saveService,
  type ActionError,
  type ServicesPageData,
} from '@/server/booking-services-actions';

/* Lot B.1-UI — EasyBook · Setări · „Servicii” (BookingServices, S123): the state and the actions
   of the page. The screen itself is in modules/booking/src/ui (the same components as the gallery);
   every write goes through the server actions, which call the booking contracts. */

type FormState = {
  id: string | null;
  form: ServiceForm;
  errors: FormErrors;
  duplicateCategory?: string;
  busy: boolean;
};
type CategoryState = {
  id: string | null;
  name: string;
  error?: 'required' | 'duplicate';
  busy: boolean;
  /** „Categorie nouă…” from the service form: the new category is selected in it. */
  fromForm: boolean;
};
type OrderState = { items: OrderItem[]; movedId: string | null; busy: boolean };
type Dialog =
  | { kind: 'category'; state: CategoryState }
  | { kind: 'order'; state: OrderState }
  | { kind: 'archive'; id: string; name: string; busy: boolean }
  | { kind: 'blocked'; name: string; count: number };
type ToastState = { title: string; description?: string; tone: 'done' | 'danger' };

/** desktop ≥ 1024, tablet ≥ 768 (the AppShell breakpoints), phone below. */
function useMode(): ScreenMode {
  const [mode, setMode] = useState<ScreenMode>('desktop');
  useEffect(() => {
    const desk = window.matchMedia('(min-width: 1024px)');
    const tab = window.matchMedia('(min-width: 768px)');
    const update = () => setMode(desk.matches ? 'desktop' : tab.matches ? 'tablet' : 'mobile');
    update();
    desk.addEventListener('change', update);
    tab.addEventListener('change', update);
    return () => {
      desk.removeEventListener('change', update);
      tab.removeEventListener('change', update);
    };
  }, []);
  return mode;
}

const FIELD_OF: Record<string, keyof FormErrors> = {
  name: 'name',
  description: 'description',
  durationMinutes: 'duration',
  durationMaxMinutes: 'durationMax',
  priceMinor: 'price',
  priceMaxMinor: 'priceMax',
  capacity: 'capacity',
};

export function ServicesScreen({
  initial,
  initialView,
}: {
  initial: ServicesPageData;
  initialView: 'active' | 'archived';
}) {
  const t = useTranslations('booking.services');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const mode = useMode();
  const [data, setData] = useState(initial);
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState('');
  const [formState, setFormState] = useState<FormState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reload = async () => {
    const page = await readServicesPage();
    if (page.kind === 'ok') setData(page.data);
    else router.refresh();
  };

  // ── the data, as the screen shows it ──────────────────────────────────────────────────────
  const activeCats = useMemo(
    () =>
      data.categories
        .filter((c) => !c.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ro')),
    [data.categories],
  );
  const activeServices = data.services.filter((s) => !s.archivedAt);
  const activeIds = new Set(activeCats.map((c) => c.id));
  const groups: CategoryGroup[] = activeCats.map((c) => ({
    id: c.id,
    name: c.name,
    services: activeServices.filter((s) => s.categoryId === c.id),
  }));
  const uncategorized = activeServices.filter((s) => !s.categoryId || !activeIds.has(s.categoryId));
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: data.timeZone,
  });
  const archivedServices: ArchivedServiceRow[] = data.services
    .filter((s) => s.archivedAt)
    .map((s) => {
      const cat = s.categoryId ? catById.get(s.categoryId) : undefined;
      return {
        ...s,
        categoryName: cat?.name ?? null,
        categoryArchived: !!cat?.archivedAt,
        archivedAt: dateFmt.format(new Date(s.archivedAt as string)),
      };
    });
  const archivedCategories: ArchivedCategoryRow[] = data.categories
    .filter((c) => c.archivedAt)
    .map((c) => ({
      id: c.id,
      name: c.name,
      archivedCount: data.services.filter((s) => s.archivedAt && s.categoryId === c.id).length,
      archivedAt: dateFmt.format(new Date(c.archivedAt as string)),
    }));
  const empty =
    data.services.length === 0 && activeCats.length === 0 && archivedCategories.length === 0;
  const categoryName = (id: string | null) => (id && catById.get(id)?.name) || t('uncategorized');
  const nextSortOrder = (categoryId: string | null) =>
    Math.max(
      -1,
      ...activeServices.filter((s) => s.categoryId === categoryId).map((s) => s.sortOrder),
    ) + 1;

  const changeView = (v: 'active' | 'archived') => {
    setView(v);
    router.replace(v === 'archived' ? `${pathname}?view=archived` : pathname, { scroll: false });
  };
  const fail = (error: ActionError) => {
    if (error === 'forbidden' || error === 'not_found') void reload();
    setToast({ tone: 'danger', title: t('err.summary') });
  };

  // ── the service form ──────────────────────────────────────────────────────────────────────
  const openNew = () =>
    setFormState({
      id: null,
      form: emptyServiceForm(data.currency, activeCats[0]?.id ?? null),
      errors: {},
      busy: false,
    });
  const openEdit = (id: string) => {
    const s = data.services.find((x) => x.id === id);
    if (s) setFormState({ id, form: formFromService(s), errors: {}, busy: false });
  };
  const submitForm = async () => {
    if (!formState) return;
    const checked = validateServiceForm(formState.form);
    const clash = findNameClash(activeServices, formState.form.name, formState.id ?? undefined);
    if (!checked.ok || clash) {
      const errors: FormErrors = checked.ok ? {} : checked.errors;
      if (clash) errors.name = { field: 'name', code: 'duplicate' };
      setFormState({
        ...formState,
        errors,
        duplicateCategory: clash ? categoryName(clash.categoryId) : undefined,
      });
      return;
    }
    const before = formState.id ? data.services.find((x) => x.id === formState.id) : undefined;
    const sortOrder =
      before && before.categoryId === checked.input.categoryId
        ? before.sortOrder
        : nextSortOrder(checked.input.categoryId);
    setFormState({ ...formState, busy: true });
    const res = await saveService(formState.id, { ...checked.input, sortOrder });
    if (!res.ok) {
      if (res.error === 'name_taken') {
        await reload();
        setFormState({
          ...formState,
          busy: false,
          errors: { name: { field: 'name', code: 'duplicate' } },
          duplicateCategory: categoryName(
            findNameClash(activeServices, formState.form.name, formState.id ?? undefined)
              ?.categoryId ?? null,
          ),
        });
        return;
      }
      if (res.error.startsWith('invalid:')) {
        const field = FIELD_OF[res.error.slice('invalid:'.length)];
        if (field) {
          setFormState({
            ...formState,
            busy: false,
            errors: { [field]: { field, code: 'invalid' } } as FormErrors,
          });
          return;
        }
      }
      setFormState({ ...formState, busy: false });
      fail(res.error);
      return;
    }
    setFormState(null);
    setToast({
      tone: 'done',
      title: formState.id
        ? t('saved', { name: res.value.name })
        : t('created', { name: res.value.name, category: categoryName(res.value.categoryId) }),
    });
    await reload();
  };

  // ── categories ────────────────────────────────────────────────────────────────────────────
  const openCategory = (id: string | null, fromForm = false) =>
    setDialog({
      kind: 'category',
      state: { id, name: id ? (catById.get(id)?.name ?? '') : '', busy: false, fromForm },
    });
  const submitCategory = async (st: CategoryState) => {
    const name = st.name.trim();
    if (!name) return setDialog({ kind: 'category', state: { ...st, error: 'required' } });
    const clash = activeCats.find(
      (c) => c.id !== st.id && c.name.toLocaleLowerCase('ro') === name.toLocaleLowerCase('ro'),
    );
    if (clash) return setDialog({ kind: 'category', state: { ...st, error: 'duplicate' } });
    setDialog({ kind: 'category', state: { ...st, busy: true } });
    const sortOrder = st.id
      ? catById.get(st.id)?.sortOrder
      : Math.max(-1, ...activeCats.map((c) => c.sortOrder)) + 1;
    const res = await saveCategory(st.id, name, sortOrder);
    if (!res.ok) {
      if (res.error === 'category_name_taken') {
        return setDialog({ kind: 'category', state: { ...st, busy: false, error: 'duplicate' } });
      }
      setDialog(null);
      return fail(res.error);
    }
    setDialog(null);
    if (st.fromForm && formState) {
      setFormState({ ...formState, form: { ...formState.form, categoryId: res.value.id } });
    }
    await reload();
  };
  const archiveCategory = async (id: string) => {
    const cat = catById.get(id);
    if (!cat) return;
    const count = activeServices.filter((s) => s.categoryId === id).length;
    if (count > 0) return setDialog({ kind: 'blocked', name: cat.name, count });
    const res = await archiveCategoryAction(id);
    if (!res.ok) {
      if (res.error === 'category_not_empty') {
        await reload();
        return setDialog({ kind: 'blocked', name: cat.name, count });
      }
      return fail(res.error);
    }
    setToast({ tone: 'done', title: t('catArchive.done', { name: cat.name }) });
    await reload();
  };
  const restoreCategory = async (id: string) => {
    const res = await restoreCategoryAction(id);
    if (!res.ok) {
      if (res.error === 'category_name_taken') {
        return setToast({
          tone: 'danger',
          title: t('err.catDuplicate', { name: catById.get(id)?.name ?? '' }),
        });
      }
      return fail(res.error);
    }
    await reload();
  };
  const openOrder = () =>
    setDialog({
      kind: 'order',
      state: {
        items: groups.map((g) => ({ id: g.id, name: g.name, count: g.services.length })),
        movedId: null,
        busy: false,
      },
    });
  const submitOrder = async (st: OrderState) => {
    setDialog({ kind: 'order', state: { ...st, busy: true } });
    const res = await reorderCategories(st.items.map((i) => i.id));
    setDialog(null);
    if (!res.ok) return fail(res.error);
    setToast({ tone: 'done', title: t('order.done') });
    await reload();
  };

  // ── archive and restore ───────────────────────────────────────────────────────────────────
  const askArchive = (id: string) => {
    const s = data.services.find((x) => x.id === id);
    if (s) setDialog({ kind: 'archive', id, name: s.name, busy: false });
  };
  const submitArchive = async (id: string, name: string) => {
    setDialog({ kind: 'archive', id, name, busy: true });
    const res = await archiveServiceAction(id);
    setDialog(null);
    setFormState(null);
    if (!res.ok) return fail(res.error);
    setToast({ tone: 'done', title: t('archive.done', { name }) });
    await reload();
  };
  const restore = async (id: string) => {
    const before = data.services.find((x) => x.id === id);
    if (!before) return;
    const res = await restoreServiceAction(id);
    if (!res.ok) {
      if (res.error === 'name_taken') {
        // S123-4 (decision 6): the duplicate-name message
        const clash = findNameClash(activeServices, before.name);
        return setToast({
          tone: 'danger',
          title: t('err.nameDuplicate', {
            name: before.name,
            category: categoryName(clash?.categoryId ?? null),
          }),
        });
      }
      return fail(res.error);
    }
    // C1 / S123-5: its category was archived, so it came back in „Fără categorie”
    const moved =
      before.categoryId && !res.value.categoryId ? catById.get(before.categoryId) : null;
    setToast({
      tone: 'done',
      title: t('restore.done', { name: before.name }),
      description: moved ? t('restore.toUncategorized', { category: moved.name }) : undefined,
    });
    await reload();
  };

  return (
    <>
      <BookingSettingsHeader
        mode={mode}
        onTabChange={(tab) => {
          if (tab !== 'services') router.push(`/booking/settings/${tab}`);
        }}
      />
      <BookingServicesView
        mode={mode}
        view={view}
        onViewChange={changeView}
        query={query}
        onQueryChange={setQuery}
        matches={(r) => matchesQuery(r.name, query)}
        categories={groups}
        uncategorized={uncategorized}
        activeCount={activeServices.length}
        archivedServices={archivedServices}
        archivedCategories={archivedCategories}
        empty={empty}
        onAdd={openNew}
        onAddCategory={() => openCategory(null)}
        onOrder={openOrder}
        onEdit={openEdit}
        onArchive={askArchive}
        onRestore={restore}
        onRenameCategory={(id) => openCategory(id)}
        onArchiveCategory={archiveCategory}
        onRestoreCategory={restoreCategory}
      />

      {formState && (
        <ServiceFormDrawer
          mode={mode}
          isOpen
          isNew={!formState.id}
          editingName={data.services.find((x) => x.id === formState.id)?.name}
          form={formState.form}
          onChange={(form) => setFormState({ ...formState, form })}
          categories={activeCats}
          onNewCategory={() => openCategory(null, true)}
          errors={formState.errors}
          duplicateCategory={formState.duplicateCategory}
          busy={formState.busy}
          onSubmit={submitForm}
          onCancel={() => setFormState(null)}
          onArchive={() => formState.id && askArchive(formState.id)}
        />
      )}

      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'category' ? (
          <CategoryDialog
            mode={mode}
            rename={!!dialog.state.id}
            name={dialog.state.name}
            onNameChange={(name) =>
              setDialog({ kind: 'category', state: { ...dialog.state, name, error: undefined } })
            }
            error={dialog.state.error}
            busy={dialog.state.busy}
            onSubmit={() => submitCategory(dialog.state)}
            onCancel={() => setDialog(null)}
          />
        ) : dialog?.kind === 'order' ? (
          <CategoryOrderDialog
            mode={mode}
            items={dialog.state.items}
            uncategorizedCount={uncategorized.length}
            movedId={dialog.state.movedId}
            onMove={(i, delta) =>
              setDialog({
                kind: 'order',
                state: {
                  ...dialog.state,
                  items: moveItem(dialog.state.items, i, delta),
                  movedId: dialog.state.items[i]?.id ?? null,
                },
              })
            }
            busy={dialog.state.busy}
            onSubmit={() => submitOrder(dialog.state)}
            onCancel={() => setDialog(null)}
          />
        ) : dialog?.kind === 'archive' ? (
          <ArchiveServiceDialog
            mode={mode}
            name={dialog.name}
            busy={dialog.busy}
            onSubmit={() => submitArchive(dialog.id, dialog.name)}
            onCancel={() => setDialog(null)}
          />
        ) : dialog?.kind === 'blocked' ? (
          <CategoryBlockedDialog
            mode={mode}
            name={dialog.name}
            activeCount={dialog.count}
            onCancel={() => setDialog(null)}
          />
        ) : (
          <span />
        )}
      </DialogTrigger>

      {toast && (
        <ServicesToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          description={toast.description}
          onDismiss={() => setToast(null)}
          dismissLabel={ui('close')}
        />
      )}
    </>
  );
}
