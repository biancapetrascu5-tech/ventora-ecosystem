'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  DialogTrigger,
  type DataTableAction,
  type DataTableKey,
  type DataTableSort,
} from '@ventora/ui';
import {
  BookingDetailDrawer,
  BookingListView,
  BulkCancelDialog,
  CancelAppointmentDialog,
  CorrectStatusDialog,
  MoveAppointmentDialog,
  SettingsToast,
  CORRECT_WINDOW_MS,
  FINAL,
  STATUS_LOOK,
  actionsFor,
  correctTarget,
  dayText,
  historyLine,
  useNewTexts,
  type DetailAction,
  type DetailButton,
  type DetailMenuItem,
  type ListPeriod,
  type ListRow,
  type ListStateFilter,
} from '@ventora/booking/ui';
import {
  cancelAppointmentAction,
  completeAppointmentAction,
  confirmAppointmentAction,
  correctAppointmentAction,
  exportAppointmentsAction,
  moveAppointmentAction,
  noShowAppointmentAction,
  readAppointmentDetail,
  readAppointmentsPage,
  saveAppointmentNoteAction,
  startAppointmentAction,
  type AppointmentDetailData,
  type AppointmentRowData,
  type AppointmentsPageData,
  type DetailActionError,
  type DetailActionResult,
} from '@/server/booking-appointments-actions';
import { readNewSlots, type NewSlotData } from '@/server/booking-new-actions';
import { useMode } from './useMode';

/* Lot B.6a / B.6b — EasyBook · „Programări” (BookingList, Decision 7, screen 4) and the detail of
   an appointment (BookingDetail + BookingStatuses, screen 3). The list: filters with removable
   pills, remembered per person in this browser; sorting and pagination of the period's rows;
   selection with „Confirmă” / „Anulează programările” (one call per appointment, each checked by
   the contract); the row menu; „Exportă” (booking:admin, the CSV of B.24 with the active filters);
   a search with nothing in the period offers its results on other days. The drawer's footer and
   „…” menu offer only the transitions allowed from the state (detail-format `actionsFor`, the same
   map as TRANSITIONS); „Programează din nou” and „Duplică” open „Programare nouă” with the client,
   the service and the person filled in. Every change reads the appointment and the list again. */

export type AppointmentsFilters = {
  period: ListPeriod;
  staffId: string;
  state: ListStateFilter;
  query: string;
};

type Dialog =
  | { kind: 'cancel' }
  | {
      kind: 'move';
      date: string;
      time: string | null;
      slots: NewSlotData[] | null;
      error: string | null;
    }
  | { kind: 'correct'; reason: string; error: string | null }
  | { kind: 'bulkCancel'; ids: string[] };

const PAGE_SIZE = 20;
const DEFAULT_FILTERS = { period: 'today', staffId: 'all', state: 'active', query: '' } as const;
const memoryKey = (who: string | null) => `ventora.booking.listFilters.${who ?? 'me'}`;

/** The latest list read; an older answer that arrives later is dropped. */
let listReads = 0;

const ICON: Record<DetailAction, DetailButton['icon']> = {
  resendPay: 'send',
  move: 'calendar',
  confirm: 'check',
  start: 'circle-dot',
  collect: 'wallet',
  complete: 'check',
  rebook: 'calendar-check',
  noShow: 'circle-x',
  cancel: 'trash-2',
  correct: 'pencil',
  duplicate: 'copy',
};

export function AppointmentsScreen({
  initial,
  filters: initialFilters,
  openId: initialOpen,
}: {
  initial: AppointmentsPageData;
  filters: AppointmentsFilters;
  openId: string | null;
}) {
  const router = useRouter();
  const mode = useMode();
  const locale = useLocale();
  const t = useTranslations('booking');
  const ui = useTranslations('ui');
  const nx = useNewTexts();
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [detail, setDetail] = useState<AppointmentDetailData | null>(null);
  const [allHistory, setAllHistory] = useState(false);
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    title: string;
    tone: 'done' | 'danger';
    undo?: () => void;
    description?: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [sort, setSort] = useState<DataTableSort | null>({ key: 'when', dir: 'asc' });
  const [selected, setSelected] = useState<DataTableKey[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // a row action that needs the drawer's data (move, cancel): run once the detail is read
  const pending = useRef<DetailAction | null>(null);
  // when the open appointment was read (the 24 h of „Corectează starea…”, „Nu a venit” after the start)
  const [readAt, setReadAt] = useState(0);

  const reloadList = (f: AppointmentsFilters) => {
    const n = ++listReads;
    setLoading(true);
    void readAppointmentsPage({
      period: f.period,
      staffId: f.staffId,
      state: f.state,
      query: f.query,
    }).then((r) => {
      if (n !== listReads) return;
      if (r.kind === 'ok') setData(r.data);
      setLoading(false);
    });
  };
  const filter = (patch: Partial<AppointmentsFilters>) => {
    const f = { ...filters, ...patch };
    setFilters(f);
    setSelected([]);
    setPage(1);
    reloadList(f);
    try {
      const { query: _q, ...kept } = f;
      window.localStorage.setItem(memoryKey(data.myStaffId), JSON.stringify(kept));
    } catch {
      // no storage (private window): the filters are simply not remembered
    }
  };

  // the filters this person used last time, when the address has none (BookingList README)
  useEffect(() => {
    if (window.location.search) return;
    try {
      const raw = window.localStorage.getItem(memoryKey(initial.myStaffId));
      if (!raw) return;
      const m = JSON.parse(raw) as Partial<AppointmentsFilters>;
      const f = {
        period: m.period === 'week' || m.period === 'month' ? m.period : 'today',
        staffId:
          typeof m.staffId === 'string' && initial.staff.some((x) => x.id === m.staffId)
            ? m.staffId
            : 'all',
        state: m.state === 'unconfirmed' || m.state === 'cancelled' ? m.state : 'active',
        query: '',
      } satisfies AppointmentsFilters;
      if (f.period === 'today' && f.staffId === 'all' && f.state === 'active') return;
      void Promise.resolve().then(() => {
        setFilters(f);
        reloadList(f);
      });
    } catch {
      // nothing remembered
    }
    // once, on the first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = (id: string, all: boolean) =>
    readAppointmentDetail(id, all).then((r) => {
      if (r.ok) {
        setDetail(r.data);
        setNote(r.data.note);
        setReadAt(Date.now());
      } else {
        setToast({
          tone: 'danger',
          title: t(r.error === 'notFound' ? 'detail.notFound' : 'detail.err.failed'),
        });
        setOpenId(null);
      }
    });

  useEffect(() => {
    if (!openId) return;
    let live = true;
    void readAppointmentDetail(openId, false).then((r) => {
      if (!live) return;
      if (r.ok) {
        setDetail(r.data);
        setNote(r.data.note);
        setReadAt(Date.now());
      } else {
        setToast({
          tone: 'danger',
          title: t(r.error === 'notFound' ? 'detail.notFound' : 'detail.err.failed'),
        });
        setOpenId(null);
      }
    });
    return () => {
      live = false;
    };
  }, [openId, t]);

  const open = (id: string) => {
    setDetail(null);
    setAllHistory(false);
    setOpenId(id);
    window.history.replaceState(null, '', `/booking/appointments/${id}`);
  };
  const close = () => {
    setOpenId(null);
    setDetail(null);
    setDialog(null);
    window.history.replaceState(null, '', '/booking/appointments');
  };

  // „Azi, 11:00” / „vin., 6 nov., 12:30”
  const shortDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  const at = (date: string, time: string) =>
    date === data.today ? t('list.today', { time }) : `${shortDay(date)}, ${time}`;
  const priceOf = (r: AppointmentRowData) =>
    nx.price(
      {
        durationMin: r.minutes,
        durationMax: r.minutes,
        priceKind: r.price.kind,
        priceMinor: r.price.minor,
        priceMaxMinor: r.price.maxMinor,
      },
      r.price.currency,
    );
  const byId = new Map(data.rows.map((r) => [r.id, r] as const));
  const sortValue = (r: AppointmentRowData, key: string): string | number =>
    key === 'client'
      ? r.client.toLocaleLowerCase(locale)
      : key === 'staff'
        ? r.staff.toLocaleLowerCase(locale)
        : key === 'price'
          ? r.price.minor
          : `${r.date} ${r.start}`;
  const sorted = [...data.rows].sort((a, b) => {
    if (!sort) return 0;
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    const c = typeof x === 'number' ? x - (y as number) : x.localeCompare(y as string, locale);
    return sort.dir === 'asc' ? c : -c;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const shown = sorted.slice((current - 1) * pageSize, current * pageSize);
  const rows: ListRow[] = shown.map((r) => ({
    id: r.id,
    client: r.client,
    phone: null,
    service: r.service,
    staff: r.staff.split(' ')[0] ?? r.staff,
    when: at(r.date, r.start),
    duration: t('detail.min', { n: r.minutes }),
    price: priceOf(r),
    status: r.status,
  }));

  const moveDay = (iso: string) => {
    const days =
      (Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${data.today}T12:00:00Z`)) / 86_400_000;
    return days >= 0 && days < 7
      ? new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
          new Date(`${iso}T12:00:00Z`),
        )
      : dayText(iso, locale).toLocaleLowerCase(locale);
  };
  const mine = (staffId: string) => data.scope === 'all' || staffId === data.myStaffId;

  const done = (r: DetailActionResult, title: string, undo?: () => void) => {
    if (r.ok) {
      setToast({ tone: 'done', title, undo });
      setDialog(null);
      if (openId) void loadDetail(openId, allHistory);
      reloadList(filters);
      return true;
    }
    setToast({ tone: 'danger', title: errorText(r.error) });
    return false;
  };
  const errorText = (e: DetailActionError) =>
    t(
      `detail.err.${e === 'forbidden' ? 'failed' : e === 'reason' ? 'reason' : e}` as 'detail.err.failed',
    );

  const act = async (a: DetailAction) => {
    if (!detail) return;
    const id = detail.row.id;
    const client = detail.row.client;
    const p = new URLSearchParams({
      client: detail.clientId,
      service: detail.serviceId,
      staff: detail.row.staffId,
    });
    switch (a) {
      case 'confirm':
        return done(await confirmAppointmentAction(id), t('states.confirmed', { client }));
      case 'start':
        return done(await startAppointmentAction(id), t('detail.toast.started', { client }));
      case 'complete':
        return done(await completeAppointmentAction(id), t('states.completed', { client }));
      case 'noShow':
        return done(await noShowAppointmentAction(id), t('detail.toast.noShow', { client }));
      case 'cancel':
        return setDialog({ kind: 'cancel' });
      case 'correct':
        return setDialog({ kind: 'correct', reason: '', error: null });
      case 'move': {
        setDialog({ kind: 'move', date: detail.row.date, time: null, slots: null, error: null });
        return slotsFor(detail.row.date);
      }
      case 'rebook':
      case 'duplicate':
        return router.push(`/booking/new?${p.toString()}`);
      default:
        return undefined;
    }
  };

  const slotsFor = (date: string) => {
    if (!detail) return;
    void readNewSlots({
      serviceId: detail.serviceId,
      staffId: detail.row.staffId,
      date,
      durationMinutes: detail.row.minutes,
    }).then((r) =>
      setDialog((d) =>
        d?.kind === 'move' && d.date === date ? { ...d, slots: r.ok ? r.slots : [] } : d,
      ),
    );
  };

  useEffect(() => {
    if (!detail || !pending.current) return;
    const a = pending.current;
    pending.current = null;
    void act(a);
    // act reads the current detail; it runs once per pending action
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const drawer = () => {
    if (!detail) return null;
    const r = detail.row;
    const final = FINAL.has(r.status);
    const canWrite = data.canWrite && mine(r.staffId);
    const changed = Date.parse(detail.statusChangedAt);
    const { footer, menu } = actionsFor(r.status, {
      canWrite,
      canCorrect: data.canCorrect,
      started: readAt >= Date.parse(detail.startsAt),
      correctable: readAt - changed < CORRECT_WINDOW_MS,
    });
    const label = (a: DetailAction) =>
      a === 'complete'
        ? t('detail.complete')
        : a === 'duplicate'
          ? t('detail.duplicate')
          : t(`action.${a}` as 'action.move', a === 'collect' ? { amount: priceOf(r) } : undefined);
    const menuItems: DetailMenuItem[] = [
      ...(canWrite ? [{ id: 'duplicate', label: label('duplicate'), icon: ICON.duplicate }] : []),
      ...menu.map((a, i) => ({
        id: a,
        label: label(a),
        icon: ICON[a],
        destructive: a === 'cancel',
        separatorBefore: a === 'cancel' && (canWrite || i > 0),
      })),
    ];
    const before = (min: number) =>
      min >= 2880
        ? t('detail.before.d', { n: Math.round(min / 1440) })
        : min >= 60
          ? t('detail.before.h', { n: Math.round(min / 60) })
          : t('detail.before.m', { n: Math.max(0, min) });
    const money = (minor: number, cur: 'RON' | 'EUR') => nx.money(minor, cur);
    const lines = (
      <>
        {r.status === 'awaiting_payment' && detail.deposit && (
          <p className="body-small">
            {t('status.paymentUntil', {
              amount: money(detail.deposit.minor, detail.deposit.currency),
              until: detail.deposit.until,
            })}
          </p>
        )}
        {r.status === 'confirmed' && detail.deposit && (
          <p className="body-small">
            {t('status.depositPaid', {
              amount: money(detail.deposit.minor, detail.deposit.currency),
            })}
          </p>
        )}
        {r.status === 'cancelled' && detail.cancellation && (
          <>
            <p className="body-small">
              {detail.cancellation.by === 'client' || !detail.cancellation.byName
                ? t('status.byClient', { time: before(detail.cancellation.minutesBefore) })
                : t('status.bySalon', {
                    name: detail.cancellation.byName,
                    time: before(detail.cancellation.minutesBefore),
                  })}
            </p>
            {detail.deposit && (
              <p className="body-small">
                {t(detail.cancellation.late ? 'status.late' : 'status.inTime')}
              </p>
            )}
          </>
        )}
      </>
    );
    const history = detail.history.map((h): [string, string] => {
      const line = historyLine({ ...h, source: detail.source });
      const vars =
        line.key === 'corrected' && h.toStatus
          ? { ...line.vars, status: t(`status.${STATUS_LOOK[h.toStatus].key}` as 'status.done') }
          : line.vars;
      return [at(h.date, h.time), t(`detail.h.${line.key}` as 'detail.h.created', vars)];
    });
    const more =
      detail.historyCount > 3
        ? {
            label: allHistory ? t('detail.historyLess') : t('detail.historyAll'),
            onPress: () => {
              const all = !allHistory;
              setAllHistory(all);
              void loadDetail(r.id, all);
            },
          }
        : null;
    const unconfirmed = r.status === 'unconfirmed';
    return (
      <BookingDetailDrawer
        mode={mode}
        contained={false}
        isOpen
        title={r.client}
        subtitle={`${r.service} · ${at(r.date, r.start)}`}
        status={r.status}
        badge={detail.source === 'public' ? t('detail.online') : null}
        lines={lines}
        rows={[
          [
            t('detail.kv.when'),
            t('detail.when', { day: dayText(r.date, locale), from: r.start, to: r.end }),
          ],
          [
            t('detail.kv.service'),
            `${r.service} · ${t('detail.min', { n: r.minutes })} · ${priceOf(r)}`,
          ],
          [t('detail.kv.staff'), r.staff],
          [t('detail.kv.client'), detail.phone ? `${r.client} · ${detail.phone}` : r.client],
        ]}
        finalNote={final ? t('status.final') : null}
        notice={
          unconfirmed
            ? {
                tone: 'attention',
                title: t('detail.unconfirmed.title'),
                body: detail.phone ? t('detail.unconfirmed.call') : undefined,
              }
            : r.status === 'completed' && canWrite
              ? { tone: 'neutral', title: t('detail.rebook.title'), body: t('detail.rebook.body') }
              : null
        }
        noticeButtons={
          unconfirmed && detail.phone
            ? [
                {
                  id: 'call',
                  label: t('detail.call'),
                  icon: 'phone',
                  onPress: () => {
                    window.location.href = `tel:${detail.phone!.replace(/\s+/g, '')}`;
                  },
                },
              ]
            : undefined
        }
        note={
          canWrite
            ? {
                value: note,
                onChange: setNote,
                onBlur: () => {
                  if (note.trim() === detail.note.trim()) return;
                  void saveAppointmentNoteAction(r.id, note).then((x) => {
                    if (x.ok) {
                      setDetail({ ...detail, note });
                      setToast({ tone: 'done', title: t('detail.toast.noteSaved') });
                    } else setToast({ tone: 'danger', title: errorText(x.error) });
                  });
                },
              }
            : null
        }
        history={history}
        historyMore={more}
        footer={footer.map((a) => ({
          id: a,
          label: label(a),
          icon: ICON[a],
          primary: a === footer[footer.length - 1] && footer.length > 0,
          onPress: () => void act(a),
        }))}
        menu={menuItems}
        onMenu={(id) => void act(id as DetailAction)}
        onClose={close}
      />
    );
  };

  const target = detail ? correctTarget(detail.row.status) : null;

  // the filter pills (desktop) and „Filtre · n” (phone)
  const periodValue = t(`list.periodValue.${filters.period}`);
  const stateValue = t(`list.stateValue.${filters.state}`);
  const staffName = data.staff.find((x) => x.id === filters.staffId)?.name ?? null;
  const pills = [
    {
      id: 'period',
      label: t('list.pill.period', { value: periodValue }),
      onRemove: () => filter({ period: 'today' }),
    },
    ...(staffName
      ? [
          {
            id: 'staff',
            label: t('list.pill.staff', { value: staffName }),
            onRemove: () => filter({ staffId: 'all' }),
          },
        ]
      : []),
    {
      id: 'state',
      label: t('list.pill.state', { value: stateValue }),
      onRemove: () => filter({ state: 'active' }),
    },
  ];
  const changed =
    filters.period !== 'today' ||
    filters.staffId !== 'all' ||
    filters.state !== 'active' ||
    !!filters.query.trim();

  const canChange = (r: AppointmentRowData) => data.canWrite && mine(r.staffId);
  const rowActions = (row: ListRow): DataTableAction[] => {
    const r = byId.get(row.id);
    const acts: DataTableAction[] = [
      { label: t('list.actions.open'), icon: 'external-link', onClick: () => open(row.id) },
    ];
    if (!r || !canChange(r) || FINAL.has(r.status)) return acts;
    if (r.status === 'unconfirmed')
      acts.push({
        label: t('action.confirm'),
        icon: 'check',
        onClick: () =>
          void confirmAppointmentAction(r.id).then((x) =>
            done(x, t('states.confirmed', { client: r.client })),
          ),
      });
    if (r.status !== 'in_progress')
      acts.push({
        label: t('action.move'),
        icon: 'calendar',
        onClick: () => {
          pending.current = 'move';
          open(r.id);
        },
      });
    if (r.status === 'confirmed' || r.status === 'in_progress')
      acts.push({
        label: t('action.noShow'),
        icon: 'circle-x',
        onClick: () =>
          void noShowAppointmentAction(r.id).then((x) =>
            done(x, t('detail.toast.noShow', { client: r.client })),
          ),
      });
    if (r.status !== 'in_progress')
      acts.push(
        { separator: true },
        {
          label: t('action.cancel'),
          icon: 'trash-2',
          destructive: true,
          onClick: () => {
            pending.current = 'cancel';
            open(r.id);
          },
        },
      );
    return acts;
  };

  // the bulk bar: only the appointments this person can change, in a state that allows it
  const picked = selected
    .map((k) => byId.get(String(k)))
    .filter((r): r is AppointmentRowData => !!r && canChange(r));
  const bulk = async (
    ids: string[],
    call: (id: string) => Promise<DetailActionResult>,
    key: 'list.bulk.confirmed' | 'list.bulk.cancelled',
  ) => {
    setBusy(true);
    const results = await Promise.all(ids.map((id) => call(id)));
    setBusy(false);
    const ok = results.filter((x) => x.ok).length;
    setDialog(null);
    setSelected([]);
    reloadList(filters);
    setToast(
      ok === ids.length
        ? { tone: 'done', title: t(key, { n: ok }) }
        : { tone: 'danger', title: t('list.bulk.partial', { done: ok, total: ids.length }) },
    );
  };
  const bulkActions: DataTableAction[] = [
    {
      label: t('list.bulk.confirm'),
      icon: 'check',
      onClick: () => {
        const ids = picked.filter((r) => r.status === 'unconfirmed').map((r) => r.id);
        if (ids.length) void bulk(ids, confirmAppointmentAction, 'list.bulk.confirmed');
      },
    },
    {
      label: t('list.bulk.cancel'),
      icon: 'trash-2',
      destructive: true,
      onClick: () => {
        const ids = picked
          .filter((r) => !FINAL.has(r.status) && r.status !== 'in_progress')
          .map((r) => r.id);
        if (ids.length) setDialog({ kind: 'bulkCancel', ids });
      },
    },
  ];

  const exportList = async () => {
    const r = await exportAppointmentsAction({
      period: filters.period,
      staffId: filters.staffId,
      state: filters.state,
    });
    if (!r.ok) {
      setToast({ tone: 'danger', title: t('list.exported.failed') });
      return;
    }
    const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.filename;
    a.click();
    const used = [
      t('list.exported.period', { value: periodValue }),
      ...(staffName ? [t('list.exported.staff', { value: staffName })] : []),
      t('list.exported.state', { value: stateValue }),
    ].join(', ');
    setToast({
      tone: 'done',
      title: t('list.exported.title', { n: r.rows }),
      description: t('list.exported.filters', { filters: used }),
      action: { label: t('list.exported.open'), onClick: () => window.open(url, '_blank') },
    });
  };

  return (
    <>
      <BookingListView
        mode={mode}
        description
        wide={locale !== 'ro'}
        onExport={data.canExport && filters.period !== 'all' ? () => void exportList() : undefined}
        rows={rows}
        activeRow={openId}
        onRowClick={(r) => open(r.id)}
        rowActions={rowActions}
        query={filters.query}
        onQuery={(q) => filter({ query: q })}
        period={filters.period}
        onPeriod={(p) => filter({ period: p })}
        staff={data.staff}
        staffFilter={filters.staffId}
        onStaffFilter={(id) => filter({ staffId: id })}
        state={filters.state}
        onState={(s) => filter({ state: s })}
        filterCount={pills.length}
        pills={pills}
        loading={loading}
        onClearFilters={changed ? () => filter({ ...DEFAULT_FILTERS }) : undefined}
        sort={sort}
        onSortChange={(x) => {
          setSort(x);
          setPage(1);
        }}
        selected={data.canWrite ? selected : undefined}
        onSelectedChange={data.canWrite ? setSelected : undefined}
        bulkActions={bulkActions}
        pagination={
          sorted.length > PAGE_SIZE
            ? {
                page: current,
                pageSize,
                total: sorted.length,
                onPageChange: setPage,
                onPageSizeChange: (n) => {
                  setPageSize(n);
                  setPage(1);
                },
              }
            : undefined
        }
        otherDays={
          data.otherDays > 0
            ? { count: data.otherDays, onShow: () => filter({ period: 'all' }) }
            : null
        }
      />
      {openId && drawer()}
      {detail && (
        <DialogTrigger
          isOpen={!!dialog && dialog.kind !== 'bulkCancel'}
          onOpenChange={(o) => !o && setDialog(null)}
        >
          <>
            {dialog?.kind === 'cancel' && (
              <CancelAppointmentDialog
                mode={mode}
                client={detail.row.client}
                day={dayText(detail.row.date, locale).toLocaleLowerCase(locale)}
                time={detail.row.start}
                busy={busy}
                onClose={() => setDialog(null)}
                onConfirm={async () => {
                  setBusy(true);
                  const r = await cancelAppointmentAction(detail.row.id, 'business');
                  setBusy(false);
                  done(r, t('detail.toast.cancelled', { client: detail.row.client }));
                }}
              />
            )}
            {dialog?.kind === 'move' && (
              <MoveAppointmentDialog
                mode={mode}
                date={dialog.date}
                today={data.today}
                slots={dialog.slots}
                time={dialog.time}
                error={dialog.error}
                busy={busy}
                onDate={(date) => {
                  setDialog({ ...dialog, date, time: null, slots: null, error: null });
                  slotsFor(date);
                }}
                onTime={(time) => setDialog({ ...dialog, time, error: null })}
                onClose={() => setDialog(null)}
                onConfirm={async () => {
                  const slot = dialog.slots?.find((s) => s.time === dialog.time && s.available);
                  if (!slot) return;
                  setBusy(true);
                  const r = await moveAppointmentAction(detail.row.id, slot.startsAt);
                  setBusy(false);
                  if (!r.ok && r.error === 'overlap') {
                    setDialog({ ...dialog, time: null, error: t('detail.err.overlap') });
                    slotsFor(dialog.date);
                    return;
                  }
                  // BookingStates: „Am mutat programarea pe sâmbătă, 11:00.” with „Anulează” (back to
                  // the time it had)
                  const id = detail.row.id;
                  const before = detail.startsAt;
                  done(r, t('states.moved', { day: moveDay(dialog.date), time: slot.time }), () => {
                    setToast(null);
                    void moveAppointmentAction(id, before).then((x) =>
                      done(x, t('today.toast.undone')),
                    );
                  });
                }}
              />
            )}
            {dialog?.kind === 'correct' && target && (
              <CorrectStatusDialog
                mode={mode}
                to={target}
                reason={dialog.reason}
                error={dialog.error}
                busy={busy}
                onReason={(reason) => setDialog({ ...dialog, reason, error: null })}
                onClose={() => setDialog(null)}
                onConfirm={async () => {
                  if (dialog.reason.trim().length < 10) {
                    setDialog({ ...dialog, error: t('detail.err.reason') });
                    return;
                  }
                  setBusy(true);
                  const r = await correctAppointmentAction(
                    detail.row.id,
                    target,
                    dialog.reason.trim(),
                  );
                  setBusy(false);
                  done(r, t('detail.toast.corrected'));
                }}
              />
            )}
          </>
        </DialogTrigger>
      )}
      <DialogTrigger
        isOpen={dialog?.kind === 'bulkCancel'}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <>
          {dialog?.kind === 'bulkCancel' && (
            <BulkCancelDialog
              mode={mode}
              count={dialog.ids.length}
              busy={busy}
              onClose={() => setDialog(null)}
              onConfirm={() =>
                void bulk(
                  dialog.ids,
                  (id) => cancelAppointmentAction(id, 'business'),
                  'list.bulk.cancelled',
                )
              }
            />
          )}
        </>
      </DialogTrigger>
      {toast && (
        <SettingsToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          onDismiss={() => setToast(null)}
          dismissLabel={ui('close')}
          onUndo={toast.undo}
          undoLabel={t('today.toast.undo')}
          description={toast.description}
          action={toast.action}
        />
      )}
    </>
  );
}
