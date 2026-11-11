'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  DialogTrigger,
  FormField,
  Input,
  Notice,
  Textarea,
  Toast,
  type AppName,
} from '@ventora/ui';
import {
  GrowthOfferEditorView,
  GrowthOffersView,
  commercialStyles as cs,
  useIsPhone,
  type GrowthOfferKind,
  type GrowthOfferRow,
  type GrowthOfferState,
  type GrowthOfferTextRow,
  type GrowthOfferType,
} from '@ventora/screens';
import type { FounderOffer, FounderOfferTarget } from '@ventora/growth';
import type { GrowthLocale } from '@ventora/contracts';
import {
  growthArchiveOffer,
  growthCreateOffer,
  growthPublishOffer,
  growthSaveText,
  growthUpdateOffer,
  type GrowthCatalogData,
  type GrowthOffersData,
} from '@/server/growth-actions';
import { FounderShell } from '../shell/FounderShell';

/* Lotul 5.10a — Growth › Oferte (S136): lista și editorul. Obiectul vine din modelul comercial,
   costul se citește de acolo (nu se scrie de mână); textele în 6 limbi au starea lor (o editare
   întoarce textul la ciornă; doar o persoană aprobă). O ofertă publicată își păstrează obiectul. */

type User = { name: string };

const LOCALES: GrowthLocale[] = ['ro', 'en', 'fr', 'es', 'de', 'it'];
const TITLE_MAX = 48;
const BODY_MAX = 300;

const lei = (minor: number) =>
  `${new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: minor % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(minor / 100)} lei`;

function kindOf(t: FounderOfferTarget['type']): GrowthOfferKind {
  return t === 'app_activation'
    ? 'app'
    : t === 'addon'
      ? 'addon'
      : t === 'trial'
        ? 'trial'
        : t === 'bundle'
          ? 'bundle'
          : 'plan';
}

function stateOf(o: FounderOffer): GrowthOfferState {
  if (o.status === 'published') return 'active';
  if (o.status === 'archived') return 'stopped';
  return o.texts.some((t) => t.status === 'draft') ? 'review' : 'draft';
}

const offerName = (o: FounderOffer) => o.texts.find((t) => t.locale === 'ro')?.title ?? o.code;

function objectOf(t: FounderOfferTarget): string | null {
  switch (t.type) {
    case 'app_activation':
      return t.applicationId;
    case 'trial':
      return t.applicationId;
    case 'addon':
      return t.addonCode;
    default:
      return t.planVersionId;
  }
}

function targetFor(type: GrowthOfferType, object: string): FounderOfferTarget {
  switch (type) {
    case 'app_activation':
      return { type, applicationId: object };
    case 'trial':
      return { type, applicationId: object, featureKey: null, days: 14 };
    case 'addon':
      return { type, addonCode: object };
    default:
      return { type, planVersionId: object };
  }
}

function objectsFor(type: GrowthOfferType, c: GrowthCatalogData) {
  if (type === 'app_activation' || type === 'trial') {
    return c.applications.map((a) => ({ value: a.id, label: a.name }));
  }
  if (type === 'addon')
    return c.addons.filter((a) => a.onSale).map((a) => ({ value: a.code, label: a.name }));
  return c.versions.filter((v) => v.onSale).map((v) => ({ value: v.id, label: v.label }));
}

/** Costul din modelul comercial, în lei (D-GRW-10); null: obiectul nu are preț în vânzare. */
function useCost() {
  const t = useTranslations('founder.growth.cost');
  return (target: FounderOfferTarget, c: GrowthCatalogData): string | null => {
    const setup = (m: number) => (m > 0 ? t('setup', { amount: lei(m) }) : t('noSetup'));
    if (target.type === 'app_activation' || target.type === 'trial') {
      const a = c.applications.find((x) => x.id === target.applicationId);
      if (!a || a.monthMinor === null) return null;
      const price = t('month', { amount: lei(a.monthMinor) });
      return target.type === 'trial'
        ? `${t('trial', { days: target.days, price })} ${setup(a.setupMinor)}`
        : `${price} · ${setup(a.setupMinor)}`;
    }
    if (target.type === 'addon') {
      const a = c.addons.find((x) => x.code === target.addonCode);
      if (!a || a.priceMinor === null) return null;
      return `${a.monthly ? t('month', { amount: lei(a.priceMinor) }) : t('once', { amount: lei(a.priceMinor) })} · ${setup(a.setupMinor)}`;
    }
    const v = c.versions.find((x) => x.id === target.planVersionId);
    if (!v || v.monthMinor === null) return null;
    return t('month', { amount: lei(v.monthMinor) });
  };
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

export function GrowthOffersScreen({ user, data }: { user: User; data: GrowthOffersData }) {
  const router = useRouter();
  const common = useTranslations('founder.growth.common');
  const t = useTranslations('founder.growth.offerEditor');
  const phone = useIsPhone();
  const [error, setError] = useState<string | null>(null);

  const rows: GrowthOfferRow[] = data.offers.map((o) => ({
    id: o.id,
    name: offerName(o),
    kind: kindOf(o.target.type),
    approved: o.texts.filter((x) => x.status === 'approved').length,
    total: LOCALES.length,
    state: stateOf(o),
  }));
  const first = data.catalog.applications[0];

  return (
    <FounderShell active="oferte" title={common('oferte')} user={user}>
      <GrowthOffersView
        mode={phone ? 'mobile' : 'desktop'}
        rows={rows}
        onNew={async () => {
          if (!first) return;
          const r = await growthCreateOffer({ type: 'app_activation', applicationId: first.id });
          if (r.ok && r.id) router.push(`/growth/offers/${r.id}`);
          else setError(t('error'));
        }}
        onEdit={(r) => router.push(`/growth/offers/${r.id}`)}
        onDuplicate={async (r) => {
          const o = data.offers.find((x) => x.id === r.id);
          if (!o) return;
          const res = await growthCreateOffer(o.target);
          if (res.ok && res.id) router.push(`/growth/offers/${res.id}`);
          else setError(t('error'));
        }}
        onStop={async (r) => {
          const res = await growthArchiveOffer(r.id);
          if (res.ok) router.refresh();
          else setError(res.conflict ? t('archiveActive') : t('error'));
        }}
      />
      {error && <ToastLine tone="danger" text={error} onDismiss={() => setError(null)} />}
    </FounderShell>
  );
}

// ── Editorul ───────────────────────────────────────────────────────────────────────────────

export function GrowthOfferEditorScreen({
  user,
  offer,
  catalog,
}: {
  user: User;
  offer: FounderOffer;
  catalog: GrowthCatalogData;
}) {
  const router = useRouter();
  const t = useTranslations('founder.growth.offerEditor');
  const offers = useTranslations('founder.growth.offers');
  const common = useTranslations('founder.growth.common');
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  const cost = useCost();
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);
  const [edit, setEdit] = useState<{ locale: GrowthLocale; title: string; body: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const type = offer.target.type as GrowthOfferType;
  const costLine = cost(offer.target, catalog);
  const approved = offer.texts.filter((x) => x.status === 'approved').length;
  const state = stateOf(offer);
  const stateWord =
    state === 'active'
      ? common('activa')
      : state === 'review'
        ? offers('review')
        : state === 'draft'
          ? offers('ciorna')
          : offers('stopped');
  const texts: GrowthOfferTextRow[] = LOCALES.map((l) => {
    const x = offer.texts.find((y) => y.locale === l);
    return {
      code: l.toUpperCase(),
      locale: l,
      text: x ? `${x.title} · ${x.body}` : null,
      state: !x ? 'missing' : x.status === 'approved' ? 'approved' : 'draft',
    };
  });
  const app =
    offer.target.type === 'app_activation' || offer.target.type === 'trial'
      ? ((offer.target.applicationId ?? undefined) as AppName | undefined)
      : undefined;
  const actionLabel =
    type === 'trial'
      ? t('actionTry', { days: 14 })
      : type === 'addon'
        ? common('cumpara')
        : type === 'app_activation'
          ? common('veziOptiunile')
          : offers('cereAltAbonament');
  const previews = offer.texts
    .filter((x) => ['ro', 'en', 'de'].includes(x.locale) || offer.texts.length <= 3)
    .map((x) => ({
      locale: x.locale,
      app,
      icon: app ? undefined : ('package' as const),
      title: x.title,
      benefit: x.body,
      cost: costLine ?? '',
      actionLabel,
    }));
  const ro = offer.texts.find((x) => x.locale === 'ro');
  const canPublish = offer.status === 'draft' && ro?.status === 'approved' && costLine !== null;

  const update = async (next: FounderOfferTarget) => {
    const r = await growthUpdateOffer(offer.id, next);
    if (r.ok) router.refresh();
    else setToast({ tone: 'danger', text: t('error') });
  };
  const save = async (approve: boolean) => {
    if (!edit) return;
    setBusy(true);
    const r = await growthSaveText({ offerId: offer.id, ...edit, approve });
    setBusy(false);
    if (r.ok) {
      setEdit(null);
      setToast({ tone: 'done', text: approve ? t('approvedToast') : t('savedToast') });
      router.refresh();
    } else setToast({ tone: 'danger', text: t('error') });
  };

  return (
    <FounderShell active="oferte" title={offerName(offer)} user={user}>
      <GrowthOfferEditorView
        mode={phone ? 'mobile' : 'desktop'}
        name={offerName(offer)}
        stateLabel={t('stateLangs', { state: stateWord, n: approved })}
        stateTone={state === 'active' ? 'done' : 'neutral'}
        type={type}
        objects={objectsFor(type, catalog)}
        object={objectOf(offer.target)}
        cost={costLine}
        texts={texts}
        previews={previews}
        readOnlyTarget={offer.status !== 'draft'}
        onBack={() => router.push('/growth/offers')}
        onType={(next) => {
          const first = objectsFor(next, catalog)[0];
          if (first) void update(targetFor(next, first.value));
        }}
        onObject={(value) => void update(targetFor(type, value))}
        onEditText={(locale) => {
          const x = offer.texts.find((y) => y.locale === locale);
          setEdit({ locale: locale as GrowthLocale, title: x?.title ?? '', body: x?.body ?? '' });
        }}
        actions={
          canPublish ? (
            <Button
              variant="primary"
              icon="check"
              onPress={async () => {
                const r = await growthPublishOffer(offer.id);
                if (r.ok) router.refresh();
                else setToast({ tone: 'danger', text: t('error') });
              }}
            >
              {t('publish')}
            </Button>
          ) : undefined
        }
      />

      <DialogTrigger isOpen={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <Dialog
          title={`${t('editeazaTextul')}${edit?.locale.toUpperCase() ?? ''}`}
          closeLabel={ui('close')}
          onClose={() => setEdit(null)}
          footer={
            <>
              <Button variant="secondary" onPress={() => void save(false)} isPending={busy}>
                {t('saveDraft')}
              </Button>
              <Button
                variant="primary"
                icon="check"
                onPress={() => void save(true)}
                isPending={busy}
              >
                {t('approve')}
              </Button>
            </>
          }
        >
          {edit && edit.locale !== 'ro' && ro && (
            <Notice tone="neutral" title={t('original')}>
              {`${ro.title} · ${ro.body}`}
            </Notice>
          )}
          {edit && (
            <>
              <FormField
                label={t('titleLabel')}
                isRequired
                requiredLabel={ui('required')}
                counter={`${edit.title.length} / ${TITLE_MAX}`}
              >
                <Input
                  value={edit.title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </FormField>
              <FormField
                label={t('bodyLabel')}
                isRequired
                requiredLabel={ui('required')}
                counter={`${edit.body.length} / ${BODY_MAX}`}
              >
                <Textarea
                  value={edit.body}
                  maxLength={BODY_MAX}
                  rows={4}
                  onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                />
              </FormField>
            </>
          )}
        </Dialog>
      </DialogTrigger>

      {toast && <ToastLine tone={toast.tone} text={toast.text} onDismiss={() => setToast(null)} />}
    </FounderShell>
  );
}
