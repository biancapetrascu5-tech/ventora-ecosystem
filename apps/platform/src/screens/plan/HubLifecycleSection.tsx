'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, DialogTrigger, type AppName } from '@ventora/ui';
import {
  answerSetupOffer,
  paySetup,
  requestProfileChange,
  type PlanData,
  type SetupData,
} from '@/server/plan-actions';
import {
  HubBillingProfileCard,
  HubSetupRequestCard,
  ProfileChangeDialog,
  type HubSetupState,
} from './HubLifecycle';

/* Lotul 3.8 (S121): secțiunea din „Abonament și consum”, cu acțiunile ei — „Cere o schimbare”
   (o solicitare la Suport), oferta (accept / renunț) și plata implementării cu cardul salvat. */

const COUNTRY: Record<string, string> = {
  RO: 'România',
  DE: 'Germania',
  IT: 'Italia',
  FR: 'Franța',
  ES: 'Spania',
  MD: 'Republica Moldova',
};

function stateOf(r: SetupData): HubSetupState {
  if (r.status === 'requested') return r.offerSentAt ? 'offer' : 'requested';
  if (r.status === 'in_progress') return 'inProgress';
  return r.status;
}

export function HubLifecycleSection({
  owner,
  profile,
  setup,
  money,
  longDay,
  closeLabel,
  phone,
  onToast,
}: {
  owner: boolean;
  profile: PlanData['profile'];
  setup: PlanData['setup'];
  money: (minor: number, currency: 'RON' | 'EUR') => string;
  /** „4 noiembrie”, din YYYY-MM-DD. */
  longDay: (day: string) => string;
  closeLabel: string;
  phone?: boolean;
  onToast: (t: { tone: 'done' | 'danger'; title: string }) => void;
}) {
  const t = useTranslations('billing.profile');
  const st = useTranslations('billing.setup');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const day = (iso: string | null) => (iso ? longDay(iso.slice(0, 10)) : '');

  async function send() {
    if (!text.trim()) {
      setEmpty(true);
      return;
    }
    setPending(true);
    setFailed(false);
    const res = await requestProfileChange(text);
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setOpen(false);
    setAsked(day(new Date().toISOString()));
    onToast({ tone: 'done', title: t('changeSent') });
  }

  async function act(id: string, fn: () => Promise<{ ok: boolean }>) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) onToast({ tone: 'danger', title: t('changeFailed') });
    router.refresh();
  }

  function body(r: SetupData, state: HubSetupState): string {
    const app = APPS[r.applicationId as AppName]?.name ?? r.applicationId;
    const setupAmount = r.setupMinor !== null ? money(r.setupMinor, r.currency) : '';
    const maint = r.maintenanceMinor !== null ? money(r.maintenanceMinor, r.currency) : '';
    switch (state) {
      case 'requested':
        return st('requested', { date: day(r.createdAt) });
      case 'offer':
        return st('offer', { setup: setupAmount, maint, start: day(r.estimatedStartOn) });
      case 'accepted':
        return st('accepted');
      case 'confirmed':
        return st('confirmed', { date: day(r.startOn) });
      case 'paid':
        return st('paid', { amount: setupAmount, date: day(r.startOn) });
      case 'inProgress':
        return st('inProgress', { app, date: day(r.estimatedStartOn) });
      case 'live':
        return st('live', { app, date: day(r.liveAt), maint, next: '' });
      case 'cancelled':
        return st('cancelled', { date: day(r.cancelledAt), reason: r.cancelReason ?? '' });
      case 'refunded':
        return st('refunded', {
          date: day(r.refundedAt),
          reason: r.cancelReason ?? '',
          amount: setupAmount,
          last4: '····',
        });
    }
  }

  return (
    <>
      <HubBillingProfileCard
        ownerOnly={!owner}
        pendingSince={asked}
        profile={
          profile
            ? {
                type: profile.entityType,
                name: profile.name,
                taxId: profile.taxId,
                regCom: profile.regCom,
                address: [
                  profile.street,
                  profile.city,
                  profile.county
                    ? profile.country === 'RO'
                      ? `jud. ${profile.county}`
                      : profile.county
                    : null,
                  COUNTRY[profile.country] ?? profile.country,
                ]
                  .filter(Boolean)
                  .join(', '),
                email: profile.email,
              }
            : null
        }
        onChange={
          owner
            ? () => {
                setText('');
                setEmpty(false);
                setFailed(false);
                setOpen(true);
              }
            : undefined
        }
      />
      {(setup ?? []).slice(0, 5).map((r) => {
        const state = stateOf(r);
        return (
          <HubSetupRequestCard
            key={r.id}
            app={r.applicationId}
            state={state}
            body={body(r, state)}
            pending={busy === r.id}
            payAmount={r.setupMinor !== null ? money(r.setupMinor, r.currency) : ''}
            onAccept={() => void act(r.id, () => answerSetupOffer(r.id, true))}
            onDecline={() => void act(r.id, () => answerSetupOffer(r.id, false))}
            onPay={
              r.paymentMethod === 'transfer'
                ? undefined
                : () => void act(r.id, () => paySetup(r.id))
            }
            onOpen={() => router.push(`/${r.applicationId}`)}
          />
        );
      })}
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        {open ? (
          <ProfileChangeDialog
            value={text}
            onChange={(v) => {
              setText(v);
              if (empty) setEmpty(false);
            }}
            empty={empty}
            pending={pending}
            failed={failed}
            mob={phone}
            closeLabel={closeLabel}
            onCancel={() => setOpen(false)}
            onSend={() => void send()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
    </>
  );
}
