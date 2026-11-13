'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookingNewBar,
  BookingNewView,
  SettingsToast,
  dayText,
  hasErrors,
  validateNew,
  type NewErrors,
  type NewForm,
} from '@ventora/booking/ui';
import {
  createNewAppointment,
  newAppointmentId,
  readNewSlots,
  searchNewClients,
  type NewClientData,
  type NewCreateError,
  type NewPageData,
  type NewSlotData,
} from '@/server/booking-new-actions';
import { readBookingShell } from '@/server/booking-services-actions';
import { readPlan, tellOwner } from '@/server/plan-actions';
import { LimitDialog } from '../plan/LimitDialog';
import { useMoney } from '../plan/format';
import { useMode } from './useMode';

/** BookingLimit: the appointment being created, kept while the owner buys more (this tab only). */
const DRAFT_KEY = 'ventora.booking.newDraft';
const QUOTA = 'booking.appointments';
type Limit = {
  usage: { used: number; limit: number } | null;
  currency: 'RON' | 'EUR';
  packs: { id: string; title: string; priceMinor: number }[];
  owner: boolean;
  ownerName: string | null;
};

/* Lot B.6c — EasyBook · „Programare nouă” (BookingNew): the state and the actions of the page.
   The screen is in modules/booking/src/ui (the same component as the gallery). The free times
   come from getFreeSlots for the chosen day; „Programează” sends the instant of the chosen time
   as the contract computed it, with an id chosen once per form (a retry returns the same
   appointment). After saving: the Toast „Am salvat programarea” with „Vezi programarea”, and the
   form is ready for the next one (service and person kept). */

export type NewStart = {
  serviceId?: string;
  staffId?: string;
  date?: string;
  time?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function NewScreen({ initial, start }: { initial: NewPageData; start: NewStart }) {
  const router = useRouter();
  const mode = useMode();
  const locale = useLocale();
  const t = useTranslations('booking.new');
  const ui = useTranslations('ui');
  const data = initial;
  const own = data.scope === 'own';

  const firstStaff = (): string | null => {
    if (own) return data.myStaffId;
    if (start.staffId && data.staff.some((m) => m.id === start.staffId)) return start.staffId;
    return null;
  };
  const [form, setForm] = useState<NewForm>(() => ({
    serviceId:
      start.serviceId && data.services.some((s) => s.id === start.serviceId)
        ? start.serviceId
        : null,
    staffId: firstStaff(),
    date: start.date && ISO.test(start.date) && start.date >= data.today ? start.date : data.today,
    time: start.time && TIME.test(start.time) ? start.time : null,
    clientId: data.fromClient?.id ?? null,
    newClient: null,
    note: '',
  }));
  const [duration, setDuration] = useState<number | null>(null);
  const [slots, setSlots] = useState<NewSlotData[] | null>([]);
  const [clients, setClients] = useState<NewClientData[]>(data.clients);
  const [searched, setSearched] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [errors, setErrors] = useState<NewErrors | undefined>(undefined);
  const [failure, setFailure] = useState<NewCreateError | null>(null);
  const [overlap, setOverlap] = useState<{ name: string; time: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ id: string; description: string } | null>(null);
  const [limit, setLimit] = useState<Limit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nav = useTranslations('booking.nav');
  const lt = useTranslations('booking.limit');
  const st = useTranslations('booking.states');
  const money = useMoney(limit?.currency ?? 'RON');

  // BookingLimit: back from the plan page, the appointment started before is filled in again
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        window.sessionStorage.removeItem(DRAFT_KEY);
        const draft = JSON.parse(raw) as { form: NewForm; duration: number | null };
        setForm(draft.form);
        setDuration(draft.duration);
        setNotice(lt('kept'));
      } catch {
        // no storage: the form starts empty
      }
    });
  }, [lt]);
  const keepDraft = () => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, duration }));
    } catch {
      // private window: the form is lost, as before
    }
  };
  const openLimit = async () => {
    const [plan, shell] = await Promise.all([readPlan(), readBookingShell()]);
    setLimit({
      usage: shell?.usage ?? null,
      currency: plan?.summary?.currency ?? plan?.catalog.currency ?? 'RON',
      packs: (plan?.offers ?? [])
        .filter((o) => o.quotaKey === QUOTA)
        .sort((a, b) => a.priceMinor - b.priceMinor)
        .map((o) => ({ id: o.id, title: o.name, priceMinor: o.priceMinor })),
      owner: plan?.owner ?? false,
      ownerName: plan?.ownerName ?? null,
    });
  };
  const id = useRef<string | null>(null);
  const query = useRef(0);

  // the times of the chosen day, again whenever the service, the person, the day or the duration change
  const { serviceId, staffId, date } = form;
  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    let live = true;
    void readNewSlots({ serviceId, staffId, date, durationMinutes: duration ?? undefined }).then(
      (r) => {
        if (!live) return;
        const list = r.ok ? r.slots : [];
        setSlots(list);
        // a time that came with the link (calendar) or was picked stays only while it is free
        setForm((f) =>
          f.time && !list.some((s) => s.time === f.time && s.available) ? { ...f, time: null } : f,
        );
      },
    );
    return () => {
      live = false;
    };
  }, [serviceId, staffId, date, duration]);

  const change = (patch: Partial<NewForm>) => {
    if ('serviceId' in patch || 'staffId' in patch || 'date' in patch) {
      setSlots(null);
      if ('serviceId' in patch || 'staffId' in patch) setDuration(null);
    }
    if ('time' in patch || 'staffId' in patch) setOverlap(null);
    setFailure(null);
    const next = { ...form, ...patch };
    setForm(next);
    if (errors) setErrors(validateNew(next));
  };

  const onClientQuery = (q: string) => {
    const n = ++query.current;
    setClientsLoading(true);
    void searchNewClients(q).then((found) => {
      if (n !== query.current) return;
      setClients(found);
      setSearched(q.trim() !== '');
      setClientsLoading(false);
    });
  };

  const submit = async () => {
    const e = validateNew(form);
    if (form.time && !slots?.some((s) => s.time === form.time && s.available)) e.time = true;
    setErrors(e);
    if (hasErrors(e) || saving) return;
    const slot = slots!.find((s) => s.time === form.time)!;
    setSaving(true);
    id.current ??= await newAppointmentId();
    const r = await createNewAppointment({
      id: id.current,
      serviceId: form.serviceId!,
      staffId: form.staffId!,
      startsAt: slot.startsAt,
      durationMinutes: duration ?? undefined,
      ...(form.newClient ? { newClient: form.newClient } : { clientId: form.clientId! }),
      note: form.note,
    });
    setSaving(false);
    if (!r.ok) {
      if (r.error === 'overlap') {
        const name = data.staff.find((m) => m.id === form.staffId)?.name ?? '';
        setOverlap({ name: name.split(' ')[0] ?? name, time: form.time! });
        setForm((f) => ({ ...f, time: null }));
        setSlots(null);
        void readNewSlots({
          serviceId: form.serviceId!,
          staffId: form.staffId!,
          date: form.date!,
          durationMinutes: duration ?? undefined,
        }).then((x) => setSlots(x.ok ? x.slots : []));
      } else if (r.error === 'limit') void openLimit();
      else setFailure(r.error);
      return;
    }
    setToast({
      id: r.id,
      description: t('saved.when', { day: dayText(form.date!, locale), time: form.time! }),
    });
    id.current = null;
    setErrors(undefined);
    setForm((f) => ({
      ...f,
      time: null,
      clientId: data.fromClient?.id ?? null,
      newClient: null,
      note: '',
    }));
    router.refresh();
  };

  const cancel = () => router.back();
  const month = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'Europe/Bucharest',
  }).format(new Date());

  return (
    <>
      <BookingNewView
        mode={mode}
        start={data.fromClient ? 'client' : 'service'}
        listHref="/booking/appointments"
        fromClient={
          data.fromClient
            ? {
                name: data.fromClient.name,
                href: `/booking/clients/${data.fromClient.id}`,
                clientsHref: '/booking/appointments',
              }
            : undefined
        }
        services={data.services}
        staff={own ? data.staff.filter((m) => m.id === data.myStaffId) : data.staff}
        terms={data.terms}
        anyAllowed={!own}
        form={form}
        onChange={change}
        duration={duration}
        onDuration={setDuration}
        today={data.today}
        closedWeekdays={data.closedWeekdays}
        slots={form.serviceId && form.staffId ? slots : []}
        clients={clients}
        clientsSearched={searched}
        clientsLoading={clientsLoading}
        onClientQuery={onClientQuery}
        errors={errors}
        overlap={overlap}
        failure={failure === 'overlap' ? null : failure}
        saving={saving}
        onSubmit={() => void submit()}
        onCancel={cancel}
      />
      {mode === 'mobile' && (
        <BookingNewBar
          fixed
          time={form.time}
          saving={saving}
          onSubmit={() => void submit()}
          onCancel={cancel}
        />
      )}
      <LimitDialog
        open={limit !== null}
        title={lt('title', { month })}
        description={lt('desc')}
        usage={
          limit?.usage
            ? { label: nav('usage', { month }), used: limit.usage.used, limit: limit.usage.limit }
            : null
        }
        packs={(limit?.packs ?? []).map((p) => ({ ...p, price: money.minor(p.priceMinor) }))}
        owner={limit?.owner ?? false}
        ownerName={limit?.ownerName ?? null}
        onBuy={() => {
          keepDraft();
          router.push('/admin/plan');
        }}
        onPlan={() => {
          keepDraft();
          router.push('/catalog');
        }}
        onRecommend={async () => {
          const r = await tellOwner('quota', QUOTA);
          if (r.ok && limit?.ownerName) setNotice(st('limitSent', { name: limit.ownerName }));
          return r.ok;
        }}
        onClose={() => setLimit(null)}
      />
      {notice && !toast && (
        <SettingsToast
          mode={mode}
          title={notice}
          onDismiss={() => setNotice(null)}
          dismissLabel={ui('close')}
        />
      )}
      {toast && (
        <SettingsToast
          mode={mode}
          title={t('saved.title')}
          description={toast.description}
          onDismiss={() => setToast(null)}
          dismissLabel={ui('close')}
          action={{
            label: t('saved.view'),
            onClick: () => router.push(`/booking/appointments/${toast.id}`),
          }}
        />
      )}
    </>
  );
}
