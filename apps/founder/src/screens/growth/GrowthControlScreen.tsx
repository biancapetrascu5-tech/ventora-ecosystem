'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogTrigger, FormField, Notice, Textarea, Toast } from '@ventora/ui';
import {
  GrowthControlView,
  commercialStyles as cs,
  useIsPhone,
  useWhen,
  type GrowthLogRow,
  type GrowthStopTarget,
} from '@ventora/screens';
import {
  growthCaps,
  growthStart,
  growthStop,
  type GrowthControlData,
  type GrowthLogData,
} from '@/server/growth-actions';
import { FounderShell } from '../shell/FounderShell';

/* Lotul 5.10e — Growth › Control (S136): oprirea globală, pe campanie și pe slot (confirmare și
   motiv; efect imediat), pornirea la loc fără confirmare (campania cere „Ce ai schimbat”, ca în
   FounderNotifications), plafoanele P25 (refuzate pe server peste maxime), jurnalul growth.*. */

type User = { name: string };

export function useSlotLabel() {
  const t = useTranslations('founder.growth.slots');
  return (id: string) => {
    const k = id.replace(/\./g, '_');
    return t.has(k) ? t(k) : id;
  };
}

function useLogText() {
  const t = useTranslations('founder.growth.control');
  const slot = useSlotLabel();
  return (e: GrowthLogData, campaignName: (id: string | null) => string) => {
    const m = e.metadata;
    switch (e.action) {
      case 'growth.paused':
        return t('log.paused', { reason: String(m.reason ?? '') });
      case 'growth.resumed':
        return t('log.resumed');
      case 'growth.caps_changed': {
        const b = (m.before ?? {}) as Record<string, number>;
        const a = (m.after ?? {}) as Record<string, number>;
        return t('log.caps', {
          d1: b.dailyPerUser ?? '',
          d2: a.dailyPerUser ?? '',
          w1: b.weeklyPerUser ?? '',
          w2: a.weeklyPerUser ?? '',
          c1: b.dismissCooldownDays ?? '',
          c2: a.dismissCooldownDays ?? '',
        });
      }
      case 'growth.placement_stopped':
        return t('log.slotStopped', { slot: slot(e.targetId ?? '') });
      case 'growth.placement_resumed':
        return t('log.slotResumed', { slot: slot(e.targetId ?? '') });
      case 'growth.campaign_stopped':
        return t('log.campaignStopped', { name: campaignName(e.targetId) });
      case 'growth.campaign_restarted':
        return t('log.campaignRestarted', { name: campaignName(e.targetId) });
      case 'growth.campaign_auto_stopped':
        return t('log.campaignAutoStopped', {
          name: campaignName(e.targetId),
          rate: `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(
            Number(m.rate ?? 0) * 100,
          )}%`,
        });
      default:
        return t('log.other', { action: e.action });
    }
  };
}

export function GrowthControlScreen({ user, data }: { user: User; data: GrowthControlData }) {
  const router = useRouter();
  const t = useTranslations('founder.growth.control');
  const re = useTranslations('founder.notifications.re');
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  const when = useWhen();
  const slot = useSlotLabel();
  const logText = useLogText();
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; text: string } | null>(null);
  const [capsError, setCapsError] = useState<'daily' | 'weekly' | 'cooldown' | null>(null);
  const [restart, setRestart] = useState<{ id: string; name: string } | null>(null);
  const [changed, setChanged] = useState('');

  const name = (id: string | null) => data.campaigns.find((k) => k.id === id)?.name ?? '';
  const done = (ok: boolean, text?: string) => {
    if (ok) {
      router.refresh();
      if (text) setToast({ tone: 'done', text });
    } else setToast({ tone: 'danger', text: t('error') });
  };

  const log: GrowthLogRow[] = data.log.map((e) => ({
    id: e.id,
    when: when(new Date(e.createdAt)),
    what: logText(e, name),
    who: e.who ?? t('system'),
  }));
  const [now] = useState(() => Date.now());

  return (
    <FounderShell active="control" title={t('control')} user={user}>
      <GrowthControlView
        mode={phone ? 'mobile' : 'desktop'}
        paused={data.control.paused}
        campaigns={data.campaigns
          .filter((k) => k.status !== 'draft')
          .map((k) => ({
            id: k.id,
            label: k.name,
            on: k.status === 'active',
            note:
              k.stopReason === 'auto_disturbance'
                ? t('autoStopped')
                : k.status === 'active' && k.startsAt && Date.parse(k.startsAt) > now
                  ? t('scheduled')
                  : undefined,
          }))}
        slots={data.placements
          .filter((p) => !p.retired)
          .map((p) => ({ id: p.id, label: slot(p.id), on: !p.stopped }))}
        caps={{
          daily: data.control.dailyPerUser,
          weekly: data.control.weeklyPerUser,
          cooldown: data.control.dismissCooldownDays,
        }}
        log={log}
        capsError={capsError}
        onStop={async (target: GrowthStopTarget, reason) => {
          const r = await growthStop(
            target.kind === 'global' ? target : { kind: target.kind, id: target.id },
            reason,
          );
          done(r.ok);
        }}
        onStart={async (target) => {
          if (target.kind === 'campaign') {
            setChanged('');
            setRestart({ id: target.id, name: target.label });
            return;
          }
          const r = await growthStart(
            target.kind === 'global' ? target : { kind: 'slot', id: target.id },
          );
          done(r.ok);
        }}
        onSaveCaps={async (caps) => {
          const r = await growthCaps(caps);
          const field = r.ok ? null : r.field;
          setCapsError(
            field === 'dailyPerUser'
              ? 'daily'
              : field === 'weeklyPerUser'
                ? 'weekly'
                : field === 'dismissCooldownDays'
                  ? 'cooldown'
                  : null,
          );
          done(r.ok, t('saved'));
        }}
      />

      <DialogTrigger isOpen={!!restart} onOpenChange={(o) => !o && setRestart(null)}>
        <Dialog
          title={re('title', { name: restart?.name ?? '' })}
          closeLabel={ui('close')}
          onClose={() => setRestart(null)}
          footer={
            <>
              <Button variant="secondary" onPress={() => setRestart(null)}>
                {ui('cancel')}
              </Button>
              <Button
                variant="primary"
                isDisabled={!changed.trim()}
                onPress={async () => {
                  if (!restart) return;
                  const r = await growthStart({ kind: 'campaign', id: restart.id }, changed.trim());
                  setRestart(null);
                  done(r.ok);
                }}
              >
                {re('submit')}
              </Button>
            </>
          }
        >
          <Notice tone="attention">{re('warnBody')}</Notice>
          <FormField label={re('changed')} isRequired requiredLabel={ui('required')}>
            <Textarea value={changed} onChange={(e) => setChanged(e.target.value)} rows={3} />
          </FormField>
        </Dialog>
      </DialogTrigger>

      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone={toast.tone}
            title={toast.text}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </FounderShell>
  );
}
