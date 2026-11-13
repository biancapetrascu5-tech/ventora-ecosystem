'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  FormField,
  Input,
  Notice,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  SlotPicker,
  Textarea,
  type SelectOption,
  type SelectOptionGroup,
  type SlotItem,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { amountText } from '../services/format';
import {
  CLIENT_NAME_MAX,
  NOTE_MAX,
  dayText,
  durationFor,
  effectiveTerms,
  isoDay,
  isoWeekday,
  pickerDay,
  serviceTerms,
  spanOf,
  differs,
  type NewCurrency,
  type NewErrors,
  type NewForm,
  type NewMemberTerms,
  type NewService,
  type NewStaff,
  type Terms,
} from './new-format';
import s from './new.module.css';

/* BookingNew (B.6c): „Programare nouă”, preview.html NewBooking / New_L, 1:1 — the form in a
   Sheet (service and person, when with the SlotPicker, client, details) and the summary with the
   price; desktop: the summary on the right; tablet: under the form; phone: one column, the actions
   in BookingNewBar, fixed above the bottom bar. Started from the client's profile, the client
   comes first (S-review: the client is already chosen). Props only: the page and the gallery draw
   the same component. */

export type NewClientOption = { id: string; name: string; phone: string | null; visits?: number };

export type BookingNewViewProps = {
  mode: ScreenMode;
  /** 'client': started from the client's profile, the client section comes first. */
  start?: 'service' | 'client';
  /** The breadcrumbs: Programări › Programare nouă, or Clienți › {client} › Programare nouă. */
  listHref?: string;
  fromClient?: { name: string; href?: string; clientsHref?: string };
  services: NewService[];
  staff: NewStaff[];
  terms: NewMemberTerms[];
  /** false: a member who only books for themselves (D-B4-6, B.5: no „Oricine e liber”). */
  anyAllowed?: boolean;
  form: NewForm;
  onChange?: (patch: Partial<NewForm>) => void;
  /** The duration the team chose for a variable service (null = the maximum, S123-3). */
  duration?: number | null;
  onDuration?: (minutes: number) => void;
  /** The business's today and its closed weekdays (1 = Monday … 7 = Sunday). */
  today: string;
  closedWeekdays?: number[];
  /** The times of the chosen day; null while they are read. */
  slots: SlotItem[] | null;
  clients: NewClientOption[];
  /** true: `clients` are the matches of a query; false: „Clienți recenți”. */
  clientsSearched?: boolean;
  clientsLoading?: boolean;
  onClientQuery?: (q: string) => void;
  /** The SMS options (confirmation now, reminder 24 h before); hidden without a source. */
  notify?: {
    confirm: boolean;
    remind: boolean;
    onChange?: (v: { confirm: boolean; remind: boolean }) => void;
  };
  /** Shown after „Programează”: the missing fields (BookingStates „validare”). */
  errors?: NewErrors;
  /** BookingStates „suprapunere”: the time was taken meanwhile. */
  overlap?: { name: string; time: string } | null;
  /** Another refusal from the server (a key of booking.new.err). */
  failure?: string | null;
  saving?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
};

export function useNewTexts() {
  const t = useTranslations('booking.new');
  const locale = useLocale();
  const money = (minor: number, cur: NewCurrency) =>
    t(`money.${cur}`, { amount: amountText(minor) });
  const price = (x: Terms, cur: NewCurrency) => {
    if (x.priceKind === 'from') return t('price.from', { amount: money(x.priceMinor, cur) });
    if (x.priceKind === 'range')
      return t(`money.${cur}`, {
        amount: t('price.range', {
          min: amountText(x.priceMinor),
          max: amountText(x.priceMaxMinor ?? x.priceMinor),
        }),
      });
    return money(x.priceMinor, cur);
  };
  const duration = (x: Terms) =>
    x.durationMin === x.durationMax
      ? t('min', { n: x.durationMin })
      : t('minRange', { min: x.durationMin, max: x.durationMax });
  return { t, locale, money, price, duration };
}

export function BookingNewView(p: BookingNewViewProps) {
  const { t, locale, price, duration } = useNewTexts();
  const ui = useTranslations('ui');
  const f = p.form;
  const set = (patch: Partial<NewForm>) => p.onChange?.(patch);
  const e = p.errors ?? {};
  const mobile = p.mode === 'mobile';

  const service = p.services.find((x) => x.id === f.serviceId) ?? null;
  const who = service ? p.staff.filter((m) => service.staffIds.includes(m.id)) : p.staff;
  const termsOf = (staffId: string) =>
    service
      ? effectiveTerms(
          service,
          p.terms.find((x) => x.serviceId === service.id && x.staffId === staffId),
        )
      : null;
  const any = f.staffId === 'any';
  const member = any ? null : (p.staff.find((m) => m.id === f.staffId) ?? null);
  const terms: Terms | null = !service
    ? null
    : member
      ? termsOf(member.id)
      : any
        ? spanOf(who.map((m) => termsOf(m.id) as Terms))
        : serviceTerms(service);
  const minutes = durationFor(terms, p.duration ?? null);

  // „Serviciu”: the categories in their order, the services nobody does can't be chosen (S129)
  const groups: SelectOptionGroup[] = [];
  for (const x of p.services) {
    const label = x.category ?? t('noCategory');
    let g = groups.find((y) => y.label === label);
    if (!g) groups.push((g = { label, options: [] }));
    const base = serviceTerms(x);
    g.options.push({
      value: x.id,
      label: x.name,
      description:
        x.staffIds.length === 0
          ? t('service.nobody')
          : `${duration(base)} · ${price(base, x.currency)}`,
      isDisabled: x.staffIds.length === 0,
    });
  }

  // „Angajat”: who does the service; S137 the member's own duration and price next to the role
  const staffOptions: SelectOption[] = [
    ...(p.anyAllowed !== false && who.length > 0 ? [{ value: 'any', label: t('any') }] : []),
    ...who.map((m) => {
      const own = service ? termsOf(m.id) : null;
      const extra =
        service && own && differs(own, serviceTerms(service))
          ? ` · ${duration(own)} · ${price(own, service.currency)}`
          : '';
      return { value: m.id, label: m.name, description: m.role + extra };
    }),
  ];

  const recentOrFound = p.clientsSearched ? t('client.found') : t('client.recent');
  const clientOptions = [
    {
      label: recentOrFound,
      options: p.clients.map((c) => ({
        value: c.id,
        label: c.name,
        description:
          [c.phone, c.visits ? t('client.visits', { n: c.visits }) : null]
            .filter(Boolean)
            .join(' · ') || undefined,
      })),
    },
  ];
  const chosenClient = p.clients.find((c) => c.id === f.clientId) ?? null;
  const clientName = f.newClient?.name.trim() || chosenClient?.name || p.fromClient?.name || null;

  const clientSection = (
    <SheetSection title={t('sec.client')}>
      {f.newClient ? (
        <div className={s.g2f}>
          <FormField
            label={t('client.name')}
            required
            error={e.clientName ? t('err.clientName') : undefined}
          >
            <Input
              value={f.newClient.name}
              maxLength={CLIENT_NAME_MAX}
              isInvalid={!!e.clientName}
              onChange={(ev) => set({ newClient: { ...f.newClient!, name: ev.target.value } })}
            />
          </FormField>
          <FormField label={t('client.phone')} isOptional optionalLabel={ui('optional')}>
            <Input
              value={f.newClient.phone}
              type="tel"
              onChange={(ev) => set({ newClient: { ...f.newClient!, phone: ev.target.value } })}
            />
          </FormField>
          <div className={s.end}>
            <Button icon="users" variant="quiet" onPress={() => set({ newClient: null })}>
              {t('client.existing')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={s.g2f}>
          <FormField
            label={t('client.label')}
            required
            hint={p.start === 'client' && any ? t('client.fromProfile') : t('client.help')}
            error={e.client ? t('err.client') : undefined}
          >
            <Combobox
              options={clientOptions}
              value={f.clientId}
              filter={false}
              isLoading={p.clientsLoading}
              isInvalid={!!e.client}
              placeholder={t('client.placeholder')}
              onQueryChange={p.onClientQuery}
              onChange={(v) => set({ clientId: v === null ? null : String(v) })}
              labels={{ noResultsFor: (q) => ui('noResultsFor', { q }) }}
            />
          </FormField>
          <div className={s.end}>
            <Button
              icon="user-plus"
              variant="quiet"
              onPress={() => set({ clientId: null, newClient: { name: '', phone: '' } })}
            >
              {t('client.new')}
            </Button>
          </div>
        </div>
      )}
    </SheetSection>
  );

  const startHelp = any
    ? t('start.helpAny')
    : member
      ? t('start.helpMember', { name: member.name.split(' ')[0] ?? member.name })
      : undefined;
  const variable = !!terms && terms.durationMin !== terms.durationMax && !any;

  const form = (
    <Sheet>
      {p.start === 'client' && clientSection}
      <SheetSection title={t('sec.service')}>
        <div className={s.g2f}>
          <FormField
            label={t('service.label')}
            required
            error={e.service ? t('err.service') : undefined}
          >
            <Select
              value={f.serviceId ?? undefined}
              aria-label={t('service.label')}
              placeholder={t('service.placeholder')}
              options={groups}
              isInvalid={!!e.service}
              onChange={(v) => set({ serviceId: v, time: null })}
            />
          </FormField>
          <FormField label={t('staff.label')} required error={e.staff ? t('err.staff') : undefined}>
            <Select
              value={f.staffId ?? undefined}
              aria-label={t('staff.label')}
              placeholder={t('staff.placeholder')}
              options={staffOptions}
              isInvalid={!!e.staff}
              isDisabled={staffOptions.length === 0}
              onChange={(v) => set({ staffId: v, time: null })}
            />
          </FormField>
        </div>
      </SheetSection>
      <SheetSection title={t('sec.when')}>
        <div className={s.g2f}>
          <FormField label={t('date')} required error={e.date ? t('err.date') : undefined}>
            <DatePicker
              value={pickerDay(f.date)}
              today={pickerDay(p.today)}
              min={pickerDay(p.today)}
              locale={locale}
              invalid={!!e.date}
              isDisabled={(d) => (p.closedWeekdays ?? []).includes(isoWeekday(d))}
              onChange={(v) => v instanceof Date && set({ date: isoDay(v), time: null })}
            />
          </FormField>
          <FormField label={t('duration')}>
            <Input
              value={minutes === null ? '' : String(minutes)}
              suffix={t('minSuffix')}
              readOnly={!variable}
              type={variable ? 'number' : 'text'}
              min={terms?.durationMin}
              max={terms?.durationMax}
              step={5}
              onChange={(ev) => {
                const n = Number(ev.target.value);
                if (Number.isFinite(n) && n > 0) p.onDuration?.(n);
              }}
            />
          </FormField>
        </div>
        <div className={s.start}>
          <FormField
            label={t('start.label')}
            required
            hint={p.slots && p.slots.length === 0 ? t('start.none') : startHelp}
            error={e.time ? t('err.time') : undefined}
          >
            <div>
              <SlotPicker
                label={t('start.label')}
                slots={p.slots ?? []}
                value={f.time ?? undefined}
                onChange={(time) => set({ time })}
              />
            </div>
          </FormField>
        </div>
      </SheetSection>
      {p.start !== 'client' && clientSection}
      <SheetSection title={t('sec.details')}>
        <FormField label={t('notes')} isOptional optionalLabel={ui('optional')}>
          <Textarea
            rows={2}
            maxLength={NOTE_MAX}
            placeholder={t('notesPlaceholder')}
            value={f.note}
            onChange={(ev) => set({ note: ev.target.value })}
          />
        </FormField>
        {p.notify && (
          <div className={s.checks}>
            <Checkbox
              isSelected={p.notify.confirm}
              onChange={(v) => p.notify?.onChange?.({ ...p.notify!, confirm: v })}
            >
              {t('notify.confirm')}
            </Checkbox>
            <Checkbox
              isSelected={p.notify.remind}
              onChange={(v) => p.notify?.onChange?.({ ...p.notify!, remind: v })}
            >
              {t('notify.remind')}
            </Checkbox>
          </div>
        )}
      </SheetSection>
    </Sheet>
  );

  const dash = t('sum.none');
  const summary = (
    <div className={s.sumcard}>
      <p className="subheading">{t('sum.title')}</p>
      <dl className={s.kv}>
        <dt className="caption">{t('sum.client')}</dt>
        <dd className="body">{clientName ?? dash}</dd>
        <dt className="caption">{t('sum.service')}</dt>
        <dd className="body">
          {service ? `${service.name} · ${minutes === null ? '' : t('min', { n: minutes })}` : dash}
        </dd>
        <dt className="caption">{t('sum.who')}</dt>
        <dd className="body">{any ? t('anyWho') : (member?.name ?? dash)}</dd>
        <dt className="caption">{t('sum.when')}</dt>
        <dd className="body-strong">
          {f.date ? `${dayText(f.date, locale)} · ${f.time ?? ''}` : dash}
        </dd>
      </dl>
      <div className={s.sumtotal}>
        <span className="subheading">{t('sum.price')}</span>
        <span className="numeric v-num">
          {terms && service ? price(terms, service.currency) : dash}
        </span>
      </div>
      {!mobile && (
        <Button variant="primary" block icon="check" isPending={p.saving} onPress={p.onSubmit}>
          {t('book')}
        </Button>
      )}
      {!mobile && (
        <Button variant="quiet" block onPress={p.onCancel}>
          {t('cancel')}
        </Button>
      )}
    </div>
  );

  const crumbs = p.fromClient
    ? [
        { label: t('crumbs.clients'), href: p.fromClient.clientsHref },
        { label: p.fromClient.name, href: p.fromClient.href },
        { label: t('title') },
      ]
    : [{ label: t('crumbs.list'), href: p.listHref }, { label: t('title') }];

  return (
    <>
      <PageHeader breadcrumbs={mobile ? undefined : crumbs} title={t('title')} />
      <div className={`${s.newgrid} ${s[p.mode]}`}>
        <div className={s.col}>
          {p.overlap && (
            <Notice
              className={s.notice}
              tone="attention"
              title={t('overlap.title', { name: p.overlap.name, time: p.overlap.time })}
            >
              {t('overlap.body')}
            </Notice>
          )}
          {p.failure && <Notice className={s.notice} tone="danger" title={t(`err.${p.failure}`)} />}
          {form}
        </div>
        {summary}
      </div>
    </>
  );
}

/** The phone's actions, fixed above the bottom bar („Renunță” · „Programează · 13:15”). */
export function BookingNewBar({
  time,
  saving,
  onSubmit,
  onCancel,
  fixed,
}: {
  time: string | null;
  saving?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  /** true in the application (fixed to the viewport); the gallery places it in the frame. */
  fixed?: boolean;
}) {
  const t = useTranslations('booking.new');
  return (
    <div className={`${s.stickybar} ${fixed ? s.fixed : ''}`}>
      <Button variant="quiet" onPress={onCancel}>
        {t('cancel')}
      </Button>
      <Button variant="primary" icon="check" isPending={saving} onPress={onSubmit}>
        {time ? t('bookAt', { time }) : t('book')}
      </Button>
    </div>
  );
}
