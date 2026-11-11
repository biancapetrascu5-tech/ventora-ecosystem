'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  DataTable,
  Dialog,
  DialogTrigger,
  FormField,
  Input,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  Textarea,
  Toggle,
  type DataTableColumn,
} from '@ventora/ui';
import { useTableLabels } from '../BusinessesView';
import s from './growth.module.css';

/* GrowthControl (Lotul 5.10e, S136, doar română): oprirea globală, pe campanie și pe slot, cu
   confirmare și efect imediat (pornirea la loc nu cere confirmare); plafoanele globale cu maximele
   P25 (validate și pe server); pragul de oprire automată (5% după 100 de afișări, fix în v1);
   jurnalul modificărilor. Vederea primește valori gata de afișat; ecranul Founder le citește din
   core/growth. */

type Mode = 'desktop' | 'mobile';

export type GrowthSwitchRow = {
  id: string;
  label: string;
  on: boolean;
  /** Ce se adaugă după „Pornită / Oprită”, ex. „Oprită: deranj peste prag”. */
  note?: string;
};

export type GrowthLogRow = { id: string | number; when: string; what: string; who: string };

export type GrowthCaps = { daily: number; weekly: number; cooldown: number };

/** Ce cere o oprire: ce se oprește (global / campanie / slot) și ce se trimite. */
export type GrowthStopTarget =
  | { kind: 'global' }
  | { kind: 'campaign'; id: string; label: string }
  | { kind: 'slot'; id: string; label: string };

export function GrowthControlView({
  mode = 'desktop',
  paused,
  campaigns,
  slots,
  caps,
  thresholdPercent = 5,
  log,
  onStop,
  onStart,
  onSaveCaps,
  capsError,
}: {
  mode?: Mode;
  paused: boolean;
  campaigns: GrowthSwitchRow[];
  slots: GrowthSwitchRow[];
  caps: GrowthCaps;
  thresholdPercent?: number;
  log: GrowthLogRow[];
  /** Oprirea, după confirmare, cu motivul (obligatoriu la global și la slot). */
  onStop?: (target: GrowthStopTarget, reason: string) => void | Promise<void>;
  /** Pornirea la loc, fără confirmare. */
  onStart?: (target: GrowthStopTarget) => void;
  onSaveCaps?: (caps: GrowthCaps) => void;
  /** Câmpul refuzat de server (ex. „dailyPerUser”). */
  capsError?: 'daily' | 'weekly' | 'cooldown' | null;
}) {
  const t = useTranslations('founder.growth.control');
  const ui = useTranslations('ui');
  const common = useTranslations('founder.growth.common');
  const labels = useTableLabels();
  const [confirm, setConfirm] = useState<GrowthStopTarget | null>(null);
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<Record<keyof GrowthCaps, string>>({
    daily: String(caps.daily),
    weekly: String(caps.weekly),
    cooldown: String(caps.cooldown),
  });
  const labelPosition = mode === 'mobile' ? 'start' : 'end';

  const toggle = (target: GrowthStopTarget, on: boolean, next: boolean) => {
    if (next === on) return;
    if (next) onStart?.(target);
    else {
      setReason('');
      setConfirm(target);
    }
  };
  const describe = (on: boolean, note?: string, words = [t('on'), t('off')]) =>
    (on ? words[0] : words[1]) + (note ? ` · ${note}` : '');

  const columns: DataTableColumn[] = [
    { key: 'when', header: t('when'), secondary: true, muted: true },
    { key: 'what', header: t('ceSASchimbat'), primary: true },
    { key: 'who', header: t('cine'), secondary: true },
  ];
  const cap = (k: keyof GrowthCaps) => Number(draft[k]);
  // ca în design, fără buton: plafoanele se salvează la ieșirea dintr-un câmp schimbat
  const commit = () => {
    const next = { daily: cap('daily'), weekly: cap('weekly'), cooldown: cap('cooldown') };
    if (
      next.daily === caps.daily &&
      next.weekly === caps.weekly &&
      next.cooldown === caps.cooldown
    ) {
      return;
    }
    onSaveCaps?.(next);
  };

  return (
    <>
      <PageHeader title={t('control')} description={mode === 'mobile' ? undefined : t('lead')} />
      <div className={s.body} data-mode={mode}>
        <Sheet>
          <SheetSection
            title={t('oprireGlobala')}
            description={t('opresteToateRecomandarileVentora')}
          >
            <Toggle
              isSelected={!paused}
              onChange={(v) => toggle({ kind: 'global' }, !paused, v)}
              labelPosition={labelPosition}
              description={describe(!paused, t('globalOffNote'), [t('pornite'), t('oprite')])}
            >
              {t('recomandarileVentoraSystems')}
            </Toggle>
          </SheetSection>
          {campaigns.length > 0 && (
            <SheetSection title={common('peCampanie')}>
              <div className={s.switches}>
                {campaigns.map((c) => (
                  <Toggle
                    key={c.id}
                    isSelected={c.on}
                    onChange={(v) =>
                      toggle({ kind: 'campaign', id: c.id, label: c.label }, c.on, v)
                    }
                    labelPosition={labelPosition}
                    description={describe(c.on, c.note)}
                  >
                    {c.label}
                  </Toggle>
                ))}
              </div>
            </SheetSection>
          )}
          <SheetSection title={t('peSlot')}>
            <div className={s.switches}>
              {slots.map((c) => (
                <Toggle
                  key={c.id}
                  isSelected={c.on}
                  onChange={(v) => toggle({ kind: 'slot', id: c.id, label: c.label }, c.on, v)}
                  labelPosition={labelPosition}
                  description={describe(c.on, c.note)}
                >
                  {c.label}
                </Toggle>
              ))}
            </div>
          </SheetSection>
          <SheetSection title={t('plafoaneGlobale')} description={t('capsLead')}>
            <div className={s.caps}>
              <FormField
                label={t('peZi')}
                hint={t('helpDay')}
                error={capsError === 'daily' ? t('helpDay') : undefined}
              >
                <Input
                  value={draft.daily}
                  onChange={(e) => setDraft({ ...draft, daily: e.target.value })}
                  onBlur={commit}
                  suffix={t('unitDay')}
                  inputMode="numeric"
                  isInvalid={capsError === 'daily'}
                />
              </FormField>
              <FormField
                label={t('perWeek')}
                hint={t('helpWeek')}
                error={capsError === 'weekly' ? t('helpWeek') : undefined}
              >
                <Input
                  value={draft.weekly}
                  onChange={(e) => setDraft({ ...draft, weekly: e.target.value })}
                  onBlur={commit}
                  suffix={t('unitWeek')}
                  inputMode="numeric"
                  isInvalid={capsError === 'weekly'}
                />
              </FormField>
              <FormField
                label={t('pauzaDupaNuMa')}
                hint={t('helpCooldown')}
                error={capsError === 'cooldown' ? t('helpCooldown') : undefined}
              >
                <Input
                  value={draft.cooldown}
                  onChange={(e) => setDraft({ ...draft, cooldown: e.target.value })}
                  onBlur={commit}
                  suffix={t('deZile')}
                  inputMode="numeric"
                  isInvalid={capsError === 'cooldown'}
                />
              </FormField>
              <FormField label={t('pragDeOprireAutomata')} hint={t('nuMaIntereseazaLa')}>
                <Input value={String(thresholdPercent)} suffix="%" inputMode="numeric" readOnly />
              </FormField>
            </div>
          </SheetSection>
        </Sheet>
        <div>
          <h2 className={`heading ${s.h2}`}>{t('jurnalulModificarilor')}</h2>
          <DataTable
            caption={t('jurnal')}
            columns={columns}
            rows={log}
            labels={labels}
            locale="ro"
          />
        </div>
      </div>

      <DialogTrigger isOpen={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog
          title={
            confirm?.kind === 'global'
              ? t('confirm.globalTitle')
              : t('confirm.title', { name: confirm && 'label' in confirm ? confirm.label : '' })
          }
          tone="danger"
          closeLabel={ui('close')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onPress={() => setConfirm(null)}>
                {ui('cancel')}
              </Button>
              <Button
                variant="danger"
                isDisabled={!reason.trim()}
                onPress={async () => {
                  if (!confirm) return;
                  await onStop?.(confirm, reason.trim());
                  setConfirm(null);
                }}
              >
                {t('confirm.stop')}
              </Button>
            </>
          }
        >
          <Notice tone="attention">{t('confirm.body')}</Notice>
          <FormField label={t('confirm.reason')} isRequired requiredLabel={ui('required')}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </FormField>
        </Dialog>
      </DialogTrigger>
    </>
  );
}
