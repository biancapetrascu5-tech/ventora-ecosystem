'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Toast, type AppName, type RuleCriterion } from '@ventora/ui';
import {
  GrowthCampaignEditorView,
  GrowthCampaignsView,
  commercialStyles as cs,
  useIsPhone,
  type GrowthCampaignForm,
  type GrowthCampaignRow,
  type GrowthCampaignState,
} from '@ventora/screens';
import { campaignOverlaps, type FounderCampaign, type FounderOffer } from '@ventora/growth';
import { growthSaveCampaign, growthStop, type GrowthCampaignsData } from '@/server/growth-actions';
import { FounderShell } from '../shell/FounderShell';
import { useSlotLabel } from './GrowthControlScreen';
import {
  OPERATORS,
  UI_CRITERIA,
  audienceRoleOf,
  fromUiRules,
  toUiRules,
  type UiCriterion,
} from './rules';

/* Lotul 5.10b — Growth › Campanii (S136): lista și editorul. Criteriile vin doar din lista albă;
   estimarea audienței (un număr, niciodată cine) și „Deranj” au nevoie de cifre peste afaceri,
   care vin cu funcțiile lor (5.10c / 5.10d, GRANT de aprobat): până atunci nu apar. Publicarea
   cere textele RO aprobate (refuz și pe server); fiecare slot scos are rândul lui de audit. */

type User = { name: string };

const slug = (s: string) => s.replace(/\./g, '_');

function stateOf(k: FounderCampaign, now: number): GrowthCampaignState {
  if (k.status === 'draft') return 'draft';
  if (k.status === 'stopped')
    return k.stopReason === 'auto_disturbance' ? 'autoStopped' : 'stopped';
  return k.startsAt && Date.parse(k.startsAt) > now ? 'scheduled' : 'active';
}

const offerName = (o: FounderOffer | undefined) =>
  o ? (o.texts.find((t) => t.locale === 'ro')?.title ?? o.code) : '';

function useSignalLabel() {
  const t = useTranslations('founder.growth.signals');
  return (type: string) => (t.has(slug(type)) ? t(slug(type)) : type);
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

export function GrowthCampaignsScreen({ user, data }: { user: User; data: GrowthCampaignsData }) {
  const router = useRouter();
  const t = useTranslations('founder.growth.campaigns');
  const common = useTranslations('founder.growth.common');
  const ed = useTranslations('founder.growth.campaignEditor');
  const phone = useIsPhone();
  const slot = useSlotLabel();
  const signal = useSignalLabel();
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const day = (iso: string) =>
    new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(new Date(iso));

  const rows: GrowthCampaignRow[] = data.campaigns.map((k) => ({
    id: k.id,
    name: k.name,
    mode:
      k.mode === 'signal'
        ? t('modeSignal', { signal: signal(k.signal?.type ?? '') })
        : t('modeScheduled', { from: day(k.startsAt ?? ''), to: day(k.endsAt ?? '') }),
    offer: offerName(data.offers.find((o) => o.id === k.offerId)),
    slots: k.slots.map(slot).join(', '),
    annoy: null,
    state: stateOf(k, now),
  }));

  return (
    <FounderShell active="campanii" title={common('campanii')} user={user}>
      <GrowthCampaignsView
        mode={phone ? 'mobile' : 'desktop'}
        rows={rows}
        onNew={() => router.push('/growth/campaigns/new')}
        onEdit={(r) => router.push(`/growth/campaigns/${r.id}`)}
        onResults={() => router.push('/growth/control')}
        onStop={async (r) => {
          const res = await growthStop({ kind: 'campaign', id: r.id }, ed('stopFromList'));
          if (res.ok) router.refresh();
          else setError(ed('error'));
        }}
      />
      {error && <ToastLine tone="danger" text={error} onDismiss={() => setError(null)} />}
    </FounderShell>
  );
}

// ── Editorul ───────────────────────────────────────────────────────────────────────────────

export function GrowthCampaignEditorScreen({
  user,
  data,
  campaignId,
}: {
  user: User;
  data: GrowthCampaignsData;
  campaignId: string | null;
}) {
  const router = useRouter();
  const t = useTranslations('founder.growth.campaignEditor');
  const common = useTranslations('founder.growth.common');
  const camps = useTranslations('founder.growth.campaigns');
  const rb = useTranslations('founder.growth.rules');
  const offersT = useTranslations('founder.growth.offers');
  const offerEd = useTranslations('founder.growth.offerEditor');
  const phone = useIsPhone();
  const slot = useSlotLabel();
  const signal = useSignalLabel();
  const [now] = useState(() => Date.now());
  const existing = campaignId ? data.campaigns.find((k) => k.id === campaignId) : undefined;
  const ui0 = toUiRules(existing?.rule);
  const [form, setForm] = useState<GrowthCampaignForm>({
    name: existing?.name ?? '',
    mode: existing?.mode ?? 'signal',
    signal: existing?.signal?.type ?? data.signals[0]?.type ?? null,
    period:
      existing?.startsAt && existing.endsAt
        ? [new Date(existing.startsAt), new Date(existing.endsAt)]
        : null,
    offerId: existing?.offerId ?? null,
    slots: existing?.slots ?? [],
    match: ui0.match,
    rules: ui0.rows,
    priority: String(existing?.priority ?? 50),
  });
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);

  const offers = data.offers.filter((o) => o.status === 'published' || o.id === form.offerId);
  const offer = data.offers.find((o) => o.id === form.offerId);
  const roApproved =
    offer?.texts.some((x) => x.locale === 'ro' && x.status === 'approved') ?? false;
  const opLabel = (op: string) => rb(`op.${op}`);

  const criteria: RuleCriterion[] = UI_CRITERIA.map((c: UiCriterion) => {
    const base = { value: c, operators: [...OPERATORS[c]] };
    switch (c) {
      case 'organization.applications':
        return {
          ...base,
          label: common('aplicatiiActive'),
          values: data.catalog.applications.map((a) => ({ value: a.id, label: a.name })),
        };
      case 'organization.plan':
        return {
          ...base,
          label: common('abonament'),
          values: data.catalog.versions.map((v) => ({ value: v.id, label: v.label })),
        };
      case 'organization.age_days':
        return { ...base, label: common('vechimeaAfacerii'), unit: rb('unitDays') };
      case 'organization.members':
        return { ...base, label: common('numarDeUtilizatori'), unit: rb('unitPeople') };
      case 'organization.country':
        return {
          ...base,
          label: common('tara'),
          values: ['RO', 'MD', 'IT', 'DE'].map((v) => ({ value: v, label: rb(`countries.${v}`) })),
        };
      case 'user.role':
        return {
          ...base,
          label: common('rol'),
          values: [
            { value: 'owner', label: common('proprietar') },
            { value: 'admin', label: common('admin') },
            { value: 'member', label: common('membru') },
          ],
        };
      default:
        return {
          ...base,
          label: common('limba2'),
          values: ['ro', 'en', 'fr', 'es', 'de', 'it'].map((v) => ({
            value: v,
            label: rb(`locales.${v}`),
          })),
        };
    }
  }).map((c) => ({ ...c, operators: c.operators.map(opLabel) }));
  // RuleBuilder lucrează cu etichetele operatorilor; le traducem înapoi la nume la salvare
  const opName = (label: string) =>
    ['includes', 'excludes', 'is', 'is_not', 'gte', 'lte'].find((o) => opLabel(o) === label) ??
    label;
  const uiRows = form.rules.map((r) => ({ ...r, operator: opLabel(r.operator) }));

  // „același slot, aceeași audiență” (5.10b)
  const built = fromUiRules(form.match, form.rules);
  const overlaps = built.ok
    ? campaignOverlaps(
        {
          id: campaignId ?? '',
          slots: form.slots,
          rule: built.rule,
          audienceRole: audienceRoleOf(form.rules),
        },
        data.campaigns,
      )
    : [];
  const first = overlaps[0];
  const caps = data.control;
  const ro = offer?.texts.find((x) => x.locale === 'ro');
  const app =
    offer && (offer.target.type === 'app_activation' || offer.target.type === 'trial')
      ? ((offer.target.applicationId ?? undefined) as AppName | undefined)
      : undefined;
  const actionLabel =
    offer?.target.type === 'trial'
      ? offerEd('actionTry', { days: 14 })
      : offer?.target.type === 'addon'
        ? common('cumpara')
        : offer?.target.type === 'app_activation'
          ? common('veziOptiunile')
          : offersT('cereAltAbonament');

  const save = async (publish: boolean) => {
    setField(null);
    if (!built.ok) {
      setField('rule');
      setToast({ tone: 'danger', text: t('error') });
      return;
    }
    const sig = data.signals.find((x) => x.type === form.signal);
    setBusy(true);
    const r = await growthSaveCampaign(
      campaignId,
      {
        name: form.name || existing?.name || '',
        offerId: form.offerId ?? '',
        mode: form.mode,
        signal: form.mode === 'signal' && sig ? { type: sig.type, version: sig.version } : null,
        startsAt: form.mode === 'scheduled' ? (form.period?.[0].toISOString() ?? null) : null,
        endsAt: form.mode === 'scheduled' ? (form.period?.[1].toISOString() ?? null) : null,
        rule: built.rule,
        audienceRole: audienceRoleOf(form.rules),
        priority: Number(form.priority),
        slots: form.slots,
      },
      publish,
    );
    setBusy(false);
    if (r.ok) {
      setToast({ tone: 'done', text: publish ? t('published') : t('saved') });
      if (!campaignId && r.id) router.replace(`/growth/campaigns/${r.id}`);
      else router.refresh();
    } else {
      setField(r.field ?? null);
      setToast({ tone: 'danger', text: t('error') });
    }
  };

  const title = existing?.name ?? t('new');
  const state = existing ? stateOf(existing, now) : 'draft';

  return (
    <FounderShell active="campanii" title={title} user={user}>
      <GrowthCampaignEditorView
        mode={phone ? 'mobile' : 'desktop'}
        title={title}
        stateLabel={
          state === 'active'
            ? common('activa')
            : state === 'scheduled'
              ? common('programata')
              : state === 'autoStopped'
                ? common('opritaDeranjPestePrag')
                : state === 'draft'
                  ? camps('draft')
                  : camps('stopped')
        }
        stateTone={state === 'active' ? 'done' : state === 'autoStopped' ? 'attention' : 'neutral'}
        form={{ ...form, rules: uiRows }}
        onChange={(f) =>
          setForm({ ...f, rules: f.rules.map((r) => ({ ...r, operator: opName(r.operator) })) })
        }
        nameEditable={!existing}
        signals={data.signals.map((s) => ({ value: s.type, label: signal(s.type) }))}
        offers={offers.map((o) => ({ value: o.id, label: offerName(o) }))}
        slots={data.placements
          .filter((p) => !p.retired && !p.userInitiated)
          .map((p) => ({ value: p.id, label: slot(p.id) }))}
        criteria={criteria}
        overlap={
          first
            ? {
                title: t('overlapTitle', { slot: slot(first.slots[0] ?? ''), name: first.name }),
                body: t('overlapBody', { priority: form.priority }),
              }
            : null
        }
        capsNote={t('capsNote', {
          daily: caps.dailyPerUser,
          weekly: caps.weeklyPerUser,
          cooldown: caps.dismissCooldownDays,
        })}
        previews={(offer?.texts ?? []).map((x) => ({
          locale: x.locale,
          app,
          icon: app ? undefined : ('package' as const),
          title: x.title,
          benefit: x.body,
          cost: '',
          actionLabel,
        }))}
        previewSlots={form.slots.map((s) => ({ value: s, label: slot(s) }))}
        roApproved={roApproved && !!ro}
        onSaveDraft={() => void save(false)}
        onPublish={() => void save(existing?.status !== 'active' && existing?.status !== 'stopped')}
        onBack={() => router.push('/growth/campaigns')}
        busy={busy}
        errorField={field}
      />
      {toast && <ToastLine tone={toast.tone} text={toast.text} onDismiss={() => setToast(null)} />}
    </FounderShell>
  );
}
