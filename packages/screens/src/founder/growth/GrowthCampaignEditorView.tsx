'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  DatePicker,
  FormField,
  Input,
  Notice,
  PageHeader,
  RecommendationCard,
  RuleBuilder,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  type AppName,
  type IconName,
  type RuleCriterion,
  type RuleRow,
} from '@ventora/ui';
import s from './growth.module.css';

/* GrowthCampaignEditor (Lotul 5.10b, S136, doar română): modul (automat la un semnal / programat
   într-o perioadă), oferta, sloturile, eligibilitatea (doar criteriile din lista albă; estimarea
   e doar un număr și vine când există), prioritatea, plafoanele globale (din Control) și
   previzualizarea pe slot × limbă × light / dark. Publicarea cere textele RO aprobate. */

type Mode = 'desktop' | 'mobile';

export type GrowthCampaignMode = 'signal' | 'scheduled';

export type GrowthCampaignForm = {
  name: string;
  mode: GrowthCampaignMode;
  signal: string | null;
  period: [Date, Date] | null;
  offerId: string | null;
  slots: string[];
  match: 'all' | 'any';
  rules: RuleRow[];
  priority: string;
};

export type GrowthCampaignPreview = {
  locale: string;
  app?: AppName;
  icon?: IconName;
  title: string;
  benefit: string;
  cost: string;
  actionLabel: string;
};

export function GrowthCampaignEditorView({
  mode = 'desktop',
  title,
  stateLabel,
  stateTone = 'neutral',
  form,
  onChange,
  signals,
  offers,
  slots,
  criteria,
  estimate,
  overlap,
  capsNote,
  previews,
  previewSlots,
  roApproved,
  onSaveDraft,
  onPublish,
  onBack,
  busy,
  errorField,
  today,
  nameEditable,
}: {
  mode?: Mode;
  title: string;
  stateLabel: string;
  stateTone?: 'neutral' | 'done' | 'attention';
  form: GrowthCampaignForm;
  onChange: (form: GrowthCampaignForm) => void;
  signals: { value: string; label: string }[];
  offers: { value: string; label: string }[];
  slots: { value: string; label: string }[];
  criteria: RuleCriterion[];
  /** Câte afaceri ar intra acum; fără el, estimarea nu apare (sub 5 nu se afișează niciodată). */
  estimate?: number;
  /** „Launcher e folosit și de …” — campaniile active pe același slot, pentru aceeași audiență. */
  overlap?: { title: string; body: ReactNode } | null;
  /** „Cel mult o recomandare pe zi…”, din plafoanele de acum. */
  capsNote: string;
  previews: GrowthCampaignPreview[];
  previewSlots: { value: string; label: string }[];
  roApproved: boolean;
  onSaveDraft?: () => void;
  onPublish?: () => void;
  onBack?: () => void;
  busy?: boolean;
  /** Câmpul refuzat de server. */
  errorField?: string | null;
  today?: Date;
  /** Câmpul „Numele campaniei” (o campanie nouă); altfel numele e titlul paginii. */
  nameEditable?: boolean;
}) {
  const t = useTranslations('founder.growth.campaignEditor');
  const common = useTranslations('founder.growth.common');
  const rb = useTranslations('founder.growth.rules');
  const pay = useTranslations('pay');
  const ui = useTranslations('ui');
  const [lang, setLang] = useState(previews[0]?.locale ?? 'ro');
  const [pslot, setPslot] = useState(previewSlots[0]?.value ?? '');
  const preview = previews.find((p) => p.locale === lang) ?? previews[0];
  const set = (patch: Partial<GrowthCampaignForm>) => onChange({ ...form, ...patch });
  const err = (f: string) => (errorField === f ? t('fieldError') : undefined);
  const noop = () => {};
  const cardLabels = {
    recommendation: pay('recommendation'),
    recommendSend: pay('recommendSend'),
    decides: (who: string) => pay('decides', { who }),
    recommendSent: (who: string) => pay('recommendSent', { who }),
    recoActivated: pay('states.member.active'),
    recoDeclined: pay('states.member.notNow'),
    recoPending: pay('states.member.pending'),
    remind: {
      moreOptions: pay('moreOptions'),
      remindLater: pay('remindLater'),
      remindWeek: pay('remindWeek'),
      remindMonth: pay('remindMonth'),
      notInterested: pay('notInterested'),
    },
  };

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={
          mode === 'mobile'
            ? undefined
            : [{ label: common('campanii'), href: '#', onClick: onBack }, { label: title }]
        }
        meta={
          <StatusPill tone={stateTone} icon={stateTone === 'done' ? 'check' : 'pencil'}>
            {stateLabel}
          </StatusPill>
        }
      />
      <div className={s.body} data-mode={mode}>
        <div className={s.split}>
          <Sheet>
            <SheetSection title={t('candPorneste')}>
              {nameEditable && (
                <>
                  <FormField
                    label={t('nameLabel')}
                    isRequired
                    requiredLabel={ui('required')}
                    error={err('name')}
                  >
                    <Input
                      value={form.name}
                      maxLength={120}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  </FormField>
                  <div className={s.gap} />
                </>
              )}
              <SegmentedControl
                aria-label={common('mod')}
                value={form.mode}
                onChange={(v) => set({ mode: v as GrowthCampaignMode })}
                options={[
                  { value: 'signal', label: t('automatLaUnSemnal') },
                  { value: 'scheduled', label: t('scheduled') },
                ]}
              />
              <div className={`${s.caps} ${s.gap}`}>
                {form.mode === 'signal' ? (
                  <FormField
                    label={t('semnalul')}
                    isRequired
                    requiredLabel={ui('required')}
                    error={err('signal')}
                  >
                    <Select
                      value={form.signal ?? undefined}
                      wrap
                      onChange={(v) => set({ signal: String(v) })}
                      options={signals}
                    />
                  </FormField>
                ) : (
                  <FormField
                    label={t('perioada')}
                    isRequired
                    requiredLabel={ui('required')}
                    error={err('endsAt')}
                  >
                    <DatePicker
                      mode="range"
                      today={today}
                      value={form.period ?? undefined}
                      onChange={(v) =>
                        set({ period: Array.isArray(v) ? (v as [Date, Date]) : null })
                      }
                    />
                  </FormField>
                )}
                <FormField
                  label={t('oferta')}
                  isRequired
                  requiredLabel={ui('required')}
                  error={err('offerId')}
                >
                  <Select
                    value={form.offerId ?? undefined}
                    wrap
                    onChange={(v) => set({ offerId: String(v) })}
                    options={offers}
                  />
                </FormField>
              </div>
            </SheetSection>
            <SheetSection title={t('undeApare')}>
              <div className={s.apps}>
                {slots.map((sl) => (
                  <Checkbox
                    key={sl.value}
                    isSelected={form.slots.includes(sl.value)}
                    onChange={(on) =>
                      set({
                        slots: on
                          ? [...form.slots, sl.value]
                          : form.slots.filter((x) => x !== sl.value),
                      })
                    }
                  >
                    {sl.label}
                  </Checkbox>
                ))}
              </div>
              {overlap && (
                <div className={s.gap}>
                  <Notice tone="neutral" icon="info" title={overlap.title}>
                    {overlap.body}
                  </Notice>
                </div>
              )}
            </SheetSection>
            <SheetSection title={t('cineOVede')} description={t('doarCriteriilePermiseCriteriile')}>
              <RuleBuilder
                criteria={criteria}
                rules={form.rules}
                match={form.match}
                onChange={(rules) => set({ rules })}
                onMatchChange={(match) => set({ match })}
                estimate={estimate}
                labels={{
                  matchLabel: rb('matchLabel'),
                  matchAll: rb('matchAll'),
                  matchAny: rb('matchAny'),
                  ruleN: (n) => rb('ruleN', { n }),
                  criterion: rb('criterion'),
                  operator: rb('operator'),
                  value: rb('value'),
                  removeCondition: rb('removeCondition'),
                  addCondition: rb('addCondition'),
                  eligibleN: (n) => rb('eligibleN', { n }),
                }}
              />
            </SheetSection>
            <SheetSection title={t('prioritateSiPlafoane')}>
              <div className={s.caps}>
                <FormField label={t('prioritate')} hint={t('priorityHelp')} error={err('priority')}>
                  <Input
                    value={form.priority}
                    inputMode="numeric"
                    onChange={(e) => set({ priority: e.target.value })}
                  />
                </FormField>
              </div>
              <Notice tone="neutral" icon="shield" title={t('plafoaneleGlobaleSeAplica')}>
                {capsNote}
              </Notice>
            </SheetSection>
          </Sheet>
          {preview && (
            <aside className={s.side}>
              <p className="subheading">{t('previzualizarePeSlot')}</p>
              <div className={s.row}>
                <div className={s.grow}>
                  <Select
                    size="sm"
                    aria-label={t('previzualizarePeSlot')}
                    value={pslot}
                    onChange={(v) => setPslot(String(v))}
                    options={previewSlots}
                  />
                </div>
                <SegmentedControl
                  size="sm"
                  aria-label={common('limba')}
                  value={lang}
                  onChange={(v) => setLang(String(v))}
                  options={previews.map((p) => ({
                    value: p.locale,
                    label: p.locale.toUpperCase(),
                  }))}
                />
              </div>
              {(['light', 'dark'] as const).map((th) => (
                <div key={th} className={s.frame} data-theme={th}>
                  <p className="caption muted">{th === 'light' ? 'Light' : 'Dark'}</p>
                  <RecommendationCard
                    app={preview.app}
                    icon={preview.icon}
                    title={preview.title}
                    benefit={preview.benefit}
                    cost={preview.cost}
                    actionLabel={preview.actionLabel}
                    onAction={noop}
                    onDismiss={noop}
                    onRemindLater={noop}
                    labels={cardLabels}
                  />
                </div>
              ))}
            </aside>
          )}
        </div>
      </div>
      <div className={s.unsaved} data-mode={mode}>
        <span className="body-small muted">{roApproved ? t('roApproved') : t('roMissing')}</span>
        <span className={s.unsavedActions}>
          <Button variant="quiet" onPress={onSaveDraft} isPending={busy}>
            {t('salveazaCiorna')}
          </Button>
          <Button variant="primary" onPress={onPublish} isDisabled={!roApproved} isPending={busy}>
            {t('publicaSchimbarile')}
          </Button>
        </span>
      </div>
    </>
  );
}
