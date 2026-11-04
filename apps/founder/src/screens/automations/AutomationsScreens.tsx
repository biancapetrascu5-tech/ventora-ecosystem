'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DialogTrigger, Toast } from '@ventora/ui';
import {
  AutomationBuilderView,
  AutomationBusinessesView,
  AutomationsListView,
  RunsView,
  TurnOnOffDialog,
  commercialStyles as cs,
  useDates,
  useIsPhone,
  useWhen,
  type BusinessActivationRow,
  type RunFilter,
  type RunRow,
} from '@ventora/screens';
import {
  CONDITION_CODES,
  DELAYS_MINUTES,
  STEP_KINDS,
  STEP_TEMPLATES,
  TRIGGERS,
  TRIGGER_CODES,
  type ConditionCode,
  type StepInput,
  type StepKind,
  type TriggerCode,
} from '@ventora/workflows/whitelist';
import {
  retryRun,
  saveAutomation,
  turnAutomation,
  type BusinessActivationData,
  type DefinitionData,
  type RunData,
} from '@/server/automations-actions';
import { FounderShell } from '../shell/FounderShell';

/* Lotul 4.10 — Founder · Automatizări (S116): lista, constructorul (doar lista albă, S116-D19),
   pornirea și oprirea per afacere cu „Motiv” (audit pe Founder), jurnalul execuțiilor. */

type User = { name: string };

const V1 = ['thanks', 'winback', 'birthday', 'risk', 'digest', 'quota'];
const slug = (code: string) => code.replace(/\./g, '_');

/** Numele, sumarul declanșatorului și aplicația, cum le arată ecranele. */
function useTexts() {
  const t = useTranslations('founder.automations');
  const hub = useTranslations('automations');
  const nf = new Intl.NumberFormat('ro-RO');
  const name = (d: { code: string; name: string }) =>
    V1.includes(d.code) ? hub(`a.${d.code}.name`) : d.name;
  const summary = (d: DefinitionData) => {
    const p = d.triggerParams as { at?: string; thresholds?: number[] };
    if (d.trigger === 'booking.appointment_completed' && d.delayMinutes > 0) {
      return t('sum.booking_appointment_completed_delay', {
        delay: t(`delayLower.${d.delayMinutes}`),
      });
    }
    return t(`sum.${slug(d.trigger)}`, {
      at: p.at ?? '',
      threshold: (p.thresholds ?? [80]).join(' / '),
    });
  };
  const app = (trigger: TriggerCode) => t(`app.${TRIGGERS[trigger].application}`);
  return { t, hub, nf, name, summary, app };
}

function ToastLine({
  text,
  tone,
  onDismiss,
}: {
  text: string;
  tone: 'done' | 'danger';
  onDismiss: () => void;
}) {
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  return (
    <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
      <Toast tone={tone} title={text} onDismiss={onDismiss} dismissLabel={ui('close')} />
    </div>
  );
}

// ── Lista ──────────────────────────────────────────────────────────────────────────────────

export function AutomationsListScreen({
  user,
  definitions,
}: {
  user: User;
  definitions: DefinitionData[];
}) {
  const router = useRouter();
  const { t, nf, name, summary, app } = useTexts();
  const rows = definitions.map((d) => ({
    id: d.id,
    name: name(d),
    app: app(d.trigger),
    trigger: summary(d),
    activeCount: d.activeCount,
    runs: nf.format(d.runs30d),
    failed: `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(
      d.runs30d ? (100 * d.failed30d) / d.runs30d : 0,
    )}%`,
  }));
  return (
    <FounderShell active="automatizari" title={t('nav')} user={user}>
      <AutomationsListView
        rows={rows}
        onNew={() => router.push('/automations/new')}
        onEdit={(r) => router.push(`/automations/${r.id}`)}
        onBusinesses={(r) => router.push(`/automations/${r.id}/businesses`)}
        onLog={(r) => router.push(`/automations/runs?automation=${r.id}`)}
      />
    </FounderShell>
  );
}

// ── Constructorul ──────────────────────────────────────────────────────────────────────────

const HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '18:00'];
/** Pasul adăugat primește șablonul potrivit declanșatorului, altfel primul al tipului. */
const DEFAULT_TEMPLATE: Partial<Record<TriggerCode, string>> = {
  'booking.appointment_completed': 'thanks',
  'booking.client_inactive': 'winback',
  'booking.client_birthday': 'birthday',
  'booking.high_risk': 'high_risk',
  'booking.daily_digest': 'daily_digest',
  'commercial.quota_threshold': 'quota_limit',
};
function templateFor(kind: StepKind, trigger: TriggerCode): string {
  const own = Object.keys(STEP_TEMPLATES[kind]);
  const wanted = DEFAULT_TEMPLATE[trigger];
  return wanted && own.includes(wanted) ? wanted : own[0]!;
}
const STEP_ICON = {
  'email.client': 'mail',
  'email.member': 'mail',
  'email.owner': 'mail',
  'notification.hub': 'bell',
} as const;

export function AutomationBuilderScreen({
  user,
  definition,
}: {
  user: User;
  definition: DefinitionData | null;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const { t, name: nameOf } = useTexts();
  const p = (definition?.triggerParams ?? {}) as { at?: string; thresholds?: number[] };
  const [name, setName] = useState(definition ? nameOf(definition) : '');
  const [trigger, setTrigger] = useState<TriggerCode>(
    definition?.trigger ?? 'booking.appointment_completed',
  );
  const [delay, setDelay] = useState<number>(definition?.delayMinutes ?? 0);
  const [at, setAt] = useState(p.at ?? '07:00');
  const [threshold, setThreshold] = useState(String((p.thresholds ?? [80]).join(',')));
  const [conditions, setConditions] = useState<ConditionCode[]>(
    (definition?.conditions ?? []) as ConditionCode[],
  );
  const [steps, setSteps] = useState<StepInput[]>((definition?.steps ?? []) as StepInput[]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const source = TRIGGERS[trigger].source.kind;
  const when =
    trigger === 'commercial.quota_threshold'
      ? {
          label: t('builder.thresholds'),
          value: threshold,
          options: [
            { value: '80', label: '80%' },
            { value: '100', label: '100%' },
            { value: '80,100', label: '80% · 100%' },
          ],
          onChange: setThreshold,
        }
      : source === 'schedule'
        ? {
            label: t('builder.at'),
            value: at,
            options: HOURS.map((h) => ({ value: h, label: h })),
            onChange: setAt,
          }
        : {
            label: t('builder.delay'),
            value: String(delay),
            options: DELAYS_MINUTES.map((m) => ({ value: String(m), label: t(`delay.${m}`) })),
            onChange: (v: string) => setDelay(Number(v)),
          };

  async function save() {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    setFailed(false);
    const res = await saveAutomation({
      definitionId: definition?.id,
      // v1: the name stays the code's translation; saving keeps the Founder's name otherwise
      name: name.trim(),
      trigger,
      triggerParams:
        trigger === 'commercial.quota_threshold'
          ? { thresholds: threshold.split(',').map(Number) }
          : source === 'schedule'
            ? { at }
            : {},
      delayMinutes: (source === 'event' && trigger !== 'commercial.quota_threshold'
        ? delay
        : 0) as 0,
      conditions,
      steps,
    });
    setSaving(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    router.push('/automations');
    router.refresh();
  }

  return (
    <FounderShell active="automatizari" title={t('nav')} user={user}>
      <AutomationBuilderView
        mode={phone ? 'mobile' : 'desktop'}
        title={definition ? t('builder.title') : t('builder.newTitle')}
        name={name}
        onNameChange={(v) => {
          setName(v);
          setNameError(false);
        }}
        nameError={nameError}
        trigger={trigger}
        triggerOptions={TRIGGER_CODES.map((c) => ({ value: c, label: t(`trigger.${slug(c)}`) }))}
        onTriggerChange={(v) => {
          setTrigger(v as TriggerCode);
          setSteps((s) =>
            s.map((st) => ({ ...st, template: templateFor(st.kind, v as TriggerCode) })),
          );
        }}
        when={when}
        conditions={conditions.map((c) => ({
          id: c,
          icon: 'check',
          title: t(`cond.${c}`),
          sub:
            c === 'recipient_accepts_messages'
              ? t('cond.recipient_accepts_messagesSub')
              : undefined,
        }))}
        conditionChoices={CONDITION_CODES.filter((c) => !conditions.includes(c)).map((c) => ({
          value: c,
          label: t(`cond.${c}`),
        }))}
        onAddCondition={(c) => setConditions((cs2) => [...cs2, c as ConditionCode])}
        onRemoveCondition={(c) => setConditions((cs2) => cs2.filter((x) => x !== c))}
        steps={steps.map((st, i) => ({
          id: String(i),
          icon: STEP_ICON[st.kind],
          title: t('builder.stepN', { n: i + 1, step: t(`step.${slug(st.kind)}`) }),
          sub: t(`tpl.${st.template}`),
        }))}
        stepChoices={STEP_KINDS.map((k) => ({
          value: k,
          label: t(`step.${slug(k)}`),
          icon: STEP_ICON[k],
        }))}
        onAddStep={(k) =>
          setSteps((s) =>
            s.length >= 10
              ? s
              : [...s, { kind: k as StepKind, template: templateFor(k as StepKind, trigger) }],
          )
        }
        onRemoveStep={(i) => setSteps((s) => s.filter((_, j) => String(j) !== i))}
        whitelist={{
          triggers: TRIGGER_CODES.map((c) => t(`wl.${slug(c)}`)),
          steps: STEP_KINDS.map((k) => t(`step.${slug(k)}`)),
        }}
        saving={saving}
        saveFailed={failed}
        onSave={() => void save()}
        onTest={() => setToast(t('builder.testSoon'))}
        onBack={() => router.push('/automations')}
      />
      {toast ? <ToastLine tone="done" text={toast} onDismiss={() => setToast(null)} /> : null}
    </FounderShell>
  );
}

// ── Pornită la afaceri ─────────────────────────────────────────────────────────────────────

export function AutomationBusinessesScreen({
  user,
  definition,
  businesses,
}: {
  user: User;
  definition: DefinitionData;
  businesses: BusinessActivationData[];
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const dates = useDates();
  const { t, hub, name } = useTexts();
  const [target, setTarget] = useState<BusinessActivationData | null>(null);
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const label = name(definition);

  const setting = (s: Record<string, unknown> | null) => {
    if (!s) return '—';
    if ('birthdayDiscountPercent' in s) {
      return s.birthdayDiscountPercent
        ? t('biz.settingDiscount', { n: Number(s.birthdayDiscountPercent) })
        : t('biz.settingNoDiscount');
    }
    if ('reactivationWeeks' in s) return t('biz.settingWeeks', { n: Number(s.reactivationWeeks) });
    return '—';
  };
  const rows: BusinessActivationRow[] = businesses.map((b) => ({
    id: b.organizationId,
    business: b.business,
    on: b.on,
    setting: setting(b.settings),
    since: b.since ? dates.day(new Date(b.since)) : '—',
    audit:
      b.on && b.since
        ? t('biz.audit', {
            who: b.by ?? '—',
            date: dates.day(new Date(b.since)),
            reason: b.reason ?? '',
          })
        : undefined,
  }));
  const open = (row: BusinessActivationRow) => {
    setReason('');
    setTicket('');
    setError(null);
    setTarget(businesses.find((b) => b.organizationId === row.id) ?? null);
  };

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    const on = !target.on;
    const res = await turnAutomation({
      on,
      organizationId: target.organizationId,
      definitionId: definition.id,
      reason,
      supportRef: ticket,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.overQuota ? t('biz.overQuota') : t('error'));
      return;
    }
    setToast(t(on ? 'biz.on' : 'biz.off', { business: target.business }));
    setTarget(null);
    router.refresh();
  }

  return (
    <FounderShell active="automatizari" title={t('nav')} user={user}>
      <AutomationBusinessesView
        name={label}
        description={
          V1.includes(definition.code) ? hub(`a.${definition.code}.desc`, { n: 'X' }) : undefined
        }
        rows={rows}
        onTurnOn={open}
        onTurnOff={open}
        onLog={(r) => router.push(`/automations/runs?automation=${definition.id}&business=${r.id}`)}
        onBack={() => router.push('/automations')}
      />
      <DialogTrigger isOpen={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        {target ? (
          <TurnOnOffDialog
            on={!target.on}
            name={label}
            business={target.business}
            reason={reason}
            onReasonChange={setReason}
            ticket={ticket}
            onTicketChange={setTicket}
            pending={pending}
            error={error}
            mob={phone}
            onCancel={() => setTarget(null)}
            onConfirm={() => void confirm()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      {toast ? <ToastLine tone="done" text={toast} onDismiss={() => setToast(null)} /> : null}
    </FounderShell>
  );
}

// ── Jurnalul ───────────────────────────────────────────────────────────────────────────────

const ST = { succeeded: 'ok', failed: 'failed', skipped: 'skipped' } as const;

export function RunsScreen({
  user,
  runs,
  definitions,
  business,
}: {
  user: User;
  runs: RunData[];
  definitions: DefinitionData[];
  /** Filtrul venit din „Pornită la afaceri”. */
  business?: string | null;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const when = useWhen();
  const { t, name } = useTexts();
  const [filter, setFilter] = useState<RunFilter>('all');
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);
  const defs = new Map(definitions.map((d) => [d.id, d]));
  const rows: RunRow[] = runs
    .filter((r) => r.status !== 'pending' && (!business || r.organizationId === business))
    .map((r) => {
      const d = defs.get(r.definitionId);
      return {
        id: r.id,
        when: when(new Date(r.createdAt)),
        automation: d ? name(d) : '—',
        business: r.business,
        for: r.forName ?? '—',
        st: ST[r.status as keyof typeof ST],
        why:
          r.status === 'succeeded'
            ? t('runs.sentN', { n: r.messagesSent })
            : r.reasonCode
              ? t(`reason.${r.reasonCode.replace(/\./g, '_')}`)
              : '—',
      };
    })
    .filter((r) => filter === 'all' || r.st === filter);
  const find = (row: RunRow) => runs.find((r) => r.id === row.id)!;

  return (
    <FounderShell active="automatizari" title={t('nav')} user={user}>
      <RunsView
        mode={phone ? 'mobile' : 'desktop'}
        rows={rows}
        filter={filter}
        onFilterChange={setFilter}
        onRetry={async (row) => {
          const r = find(row);
          const res = await retryRun(r.organizationId, r.id);
          setToast(
            res.ok
              ? { tone: 'done', text: t('runs.retried') }
              : { tone: 'danger', text: t('error') },
          );
          router.refresh();
        }}
        onOpenBusiness={(row) => router.push(`/businesses/${find(row).organizationId}`)}
        onBack={() => router.push('/automations')}
      />
      {toast ? (
        <ToastLine tone={toast.tone} text={toast.text} onDismiss={() => setToast(null)} />
      ) : null}
    </FounderShell>
  );
}
