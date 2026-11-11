'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  FormField,
  IconButton,
  PageHeader,
  RecommendationCard,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  type AppName,
  type IconName,
} from '@ventora/ui';
import s from './growth.module.css';

/* GrowthOfferEditor (Lotul 5.10a, S136, doar română): tipul, obiectul din modelul comercial,
   acțiunea (duce mereu în UpgradeDialog; urmează tipul), costurile citite din modelul comercial
   (nu se scriu de aici), textele în 6 limbi cu starea aprobării și previzualizarea
   RecommendationCard în light și dark. */

type Mode = 'desktop' | 'mobile';

export type GrowthOfferType = 'app_activation' | 'addon' | 'plan_upgrade' | 'trial' | 'bundle';
export type GrowthTextState = 'approved' | 'draft' | 'missing';

export type GrowthOfferTextRow = {
  /** „RO”, „EN”… */
  code: string;
  locale: string;
  /** „Titlu · corp”; null când lipsește. */
  text: string | null;
  state: GrowthTextState;
};

export type GrowthOfferPreview = {
  locale: string;
  app?: AppName;
  icon?: IconName;
  title: string;
  benefit: string;
  cost: string;
  actionLabel: string;
};

const TYPES: GrowthOfferType[] = ['app_activation', 'addon', 'plan_upgrade', 'trial', 'bundle'];

export function GrowthOfferEditorView({
  mode = 'desktop',
  name,
  stateLabel,
  stateTone = 'neutral',
  type,
  objects,
  object,
  cost,
  texts,
  previews,
  readOnlyTarget,
  onType,
  onObject,
  onEditText,
  onBack,
  actions,
}: {
  mode?: Mode;
  name: string;
  /** „În revizuire · 3 din 6 limbi aprobate” */
  stateLabel: string;
  stateTone?: 'neutral' | 'done' | 'attention';
  type: GrowthOfferType;
  objects: { value: string; label: string }[];
  object: string | null;
  /** Linia de cost din modelul comercial; null când obiectul nu are preț în vânzare. */
  cost: string | null;
  texts: GrowthOfferTextRow[];
  previews: GrowthOfferPreview[];
  /** O ofertă publicată își păstrează tipul și obiectul (garda din baza de date). */
  readOnlyTarget?: boolean;
  onType?: (type: GrowthOfferType) => void;
  onObject?: (value: string) => void;
  onEditText?: (locale: string) => void;
  onBack?: () => void;
  /** Butoanele din antet (ex. „Publică oferta”), când e cazul. */
  actions?: ReactNode;
}) {
  const t = useTranslations('founder.growth.offerEditor');
  const common = useTranslations('founder.growth.common');
  const offers = useTranslations('founder.growth.offers');
  const pay = useTranslations('pay');
  const ui = useTranslations('ui');
  const [lang, setLang] = useState(previews[0]?.locale ?? 'ro');
  const preview = previews.find((p) => p.locale === lang) ?? previews[0];

  const typeLabel = (v: GrowthOfferType) =>
    v === 'app_activation'
      ? t('activareaUneiAplicatii')
      : v === 'addon'
        ? offers('addon')
        : v === 'plan_upgrade'
          ? t('altAbonament')
          : v === 'trial'
            ? common('perioadaDeProba')
            : t('pachetDeAplicatii');
  const action =
    type === 'trial'
      ? t('actionTry', { days: 14 })
      : type === 'addon'
        ? common('cumpara')
        : type === 'app_activation'
          ? common('veziOptiunile')
          : offers('cereAltAbonament');
  const pill = (st: GrowthTextState) =>
    st === 'approved'
      ? { tone: 'done' as const, icon: 'check' as IconName, label: common('aprobat') }
      : st === 'draft'
        ? { tone: 'neutral' as const, icon: 'clock' as IconName, label: offers('review') }
        : {
            tone: 'attention' as const,
            icon: 'circle-alert' as IconName,
            label: common('lipseste'),
          };
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
  const noop = () => {};

  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={
          mode === 'mobile'
            ? undefined
            : [{ label: common('oferte'), href: '#', onClick: onBack }, { label: name }]
        }
        actions={actions}
        meta={
          <StatusPill tone={stateTone} icon={stateTone === 'done' ? 'check' : 'clock'}>
            {stateLabel}
          </StatusPill>
        }
      />
      <div className={s.body} data-mode={mode}>
        <div className={s.split}>
          <Sheet>
            <SheetSection title={t('ceOfera')}>
              <div className={s.caps}>
                <FormField label={t('tipulOfertei')} isRequired requiredLabel={ui('required')}>
                  <Select
                    value={type}
                    onChange={(v) => onType?.(v as GrowthOfferType)}
                    isDisabled={readOnlyTarget}
                    options={TYPES.map((v) => ({ value: v, label: typeLabel(v) }))}
                  />
                </FormField>
                <FormField label={t('obiectul')} isRequired requiredLabel={ui('required')}>
                  <Select
                    value={object ?? undefined}
                    onChange={(v) => onObject?.(String(v))}
                    isDisabled={readOnlyTarget}
                    options={objects}
                  />
                </FormField>
                <FormField
                  label={t('actiunea')}
                  isRequired
                  requiredLabel={ui('required')}
                  hint={t('actionHelp')}
                >
                  <Select value="a" options={[{ value: 'a', label: action }]} />
                </FormField>
              </div>
              <div className={s.cost}>
                <p className="caption muted">{t('costuriAfisateDinModelul')}</p>
                <p className="body-strong">{cost ?? t('noPrice')}</p>
                <p className="body-small muted">{t('costNote')}</p>
              </div>
            </SheetSection>
            <SheetSection title={t('texte')} description={t('textsLead')}>
              <div className={s.langs}>
                {texts.map((r) => {
                  const p = pill(r.state);
                  return (
                    <div key={r.code} className={s.lang}>
                      <span className="body-strong">{r.code}</span>
                      <span className={`body-small ${s.langText}`}>
                        {r.text ?? <span className="muted">{t('notWritten')}</span>}
                      </span>
                      <StatusPill size="sm" tone={p.tone} icon={p.icon}>
                        {p.label}
                      </StatusPill>
                      <IconButton
                        icon="pencil"
                        label={`${t('editeazaTextul')}${r.code}`}
                        variant="quiet"
                        size="sm"
                        onPress={() => onEditText?.(r.locale)}
                      />
                    </div>
                  );
                })}
              </div>
            </SheetSection>
          </Sheet>
          {preview && (
            <aside className={s.side}>
              <p className="subheading">{t('previzualizare')}</p>
              <SegmentedControl
                size="sm"
                aria-label={common('limba')}
                value={lang}
                onChange={(v) => setLang(String(v))}
                options={previews.map((p) => ({ value: p.locale, label: p.locale.toUpperCase() }))}
              />
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
    </>
  );
}
