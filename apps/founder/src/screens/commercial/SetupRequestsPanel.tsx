'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, DialogTrigger, type AppName } from '@ventora/ui';
import {
  SetupCancelDialog,
  SetupGoLiveDialog,
  SetupRequestDrawer,
  SetupRequestsList,
  currencySuffix,
  money,
  useIsPhone,
  useWhen,
  type SetupOfferValues,
  type SetupRow,
  type SetupState,
} from '@ventora/screens';
import {
  cancelSetup,
  confirmStart,
  goLive,
  readSetupRequest,
  resendPayment,
  sendOffer,
  startWork,
  type SetupDetailData,
  type SetupListData,
} from '@/server/lifecycle-actions';

/* FounderSetupRequests (Lotul 3.8, S121): cererile cu implementare, în „Cereri”. Rândul, apoi
   detaliul (Drawer) cu pasul următor: oferta (precompletată din catalog, N7), confirmarea datei,
   plata, lucrul, pornirea; anularea înainte de plată și rambursarea după ea. Fiecare pas e
   auditat (core/commercial) și ajunge la owner (commercial.setup_request.changed). */

const STATE: Record<SetupListData['status'], SetupState> = {
  requested: 'requested',
  accepted: 'accepted',
  confirmed: 'confirmed',
  paid: 'paid',
  in_progress: 'inProgress',
  live: 'live',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

const LONG = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Bucharest',
});
const longDay = (iso: string | null) =>
  iso ? LONG.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : '';
const isoDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);
const appName = (id: string) => APPS[id as AppName]?.name ?? id;

/** „600” / „49,90” → minor units; null when it is not a sum. */
function parseMinor(v: string): number | null {
  const n = Number(v.replace(/\s|\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
const toInput = (minor: number) =>
  minor % 100 ? (minor / 100).toFixed(2).replace('.', ',') : String(minor / 100);

export function SetupRequestsPanel({
  rows,
  onToast,
}: {
  rows: SetupListData[];
  onToast: (t: { tone: 'done' | 'danger'; text: string }) => void;
}) {
  const router = useRouter();
  const t = useTranslations('founder.setup');
  const when = useWhen();
  const phone = useIsPhone();
  const [open, setOpen] = useState<SetupListData | null>(null);
  const [detail, setDetail] = useState<SetupDetailData | null>(null);
  const [offer, setOffer] = useState<SetupOfferValues>({
    setup: '',
    maintenance: '',
    start: null,
    note: '',
  });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<'goLive' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');

  const listRows: SetupRow[] = rows.map((r) => ({
    id: r.id,
    business: r.business,
    item: appName(r.applicationId),
    who: r.who,
    when: when(new Date(r.createdAt)),
    st: STATE[r.status],
  }));

  async function openRow(row: SetupRow) {
    const r = rows.find((x) => x.id === row.id)!;
    setOpen(r);
    setDetail(null);
    setFailed(false);
    const d = await readSetupRequest(r.organizationId, r.id);
    setDetail(d);
    if (d?.defaults) {
      setOffer({
        setup: toInput(d.setupMinor ?? d.defaults.setupMinor),
        maintenance: toInput(d.maintenanceMinor ?? d.defaults.maintenanceMinor),
        start: d.estimatedStartOn ? new Date(`${d.estimatedStartOn}T12:00:00`) : null,
        note: '',
      });
    }
  }

  async function step(fn: () => Promise<{ ok: boolean }>, done?: string) {
    setPending(true);
    setFailed(false);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return false;
    }
    if (done) onToast({ tone: 'done', text: done });
    setDialog(null);
    router.refresh();
    if (open) {
      const d = await readSetupRequest(open.organizationId, open.id);
      setDetail(d);
    }
    return true;
  }

  const base = open ? { organizationId: open.organizationId, setupRequestId: open.id } : null;
  const state = detail ? STATE[detail.status] : open ? STATE[open.status] : 'requested';
  const currency = detail?.currency ?? 'RON';
  const interval = detail?.maintenanceInterval ?? detail?.defaults?.interval ?? 'month';

  function primary() {
    if (!base || !detail) return;
    if (state === 'requested') {
      const setupMinor = parseMinor(offer.setup);
      const maintenanceMinor = parseMinor(offer.maintenance);
      if (setupMinor === null || maintenanceMinor === null || !offer.start) {
        setFailed(true);
        return;
      }
      void step(() =>
        sendOffer({
          ...base,
          setupMinor,
          maintenanceMinor,
          estimatedStartOn: isoDay(offer.start!),
          note: offer.note,
        }),
      );
    } else if (state === 'accepted') {
      void step(() =>
        confirmStart({ ...base, startOn: detail.estimatedStartOn ?? isoDay(new Date()) }),
      );
    } else if (state === 'confirmed') {
      void step(() => resendPayment(base));
    } else if (state === 'paid') {
      void step(() => startWork(base));
    } else if (state === 'inProgress') {
      setDialog('goLive');
    }
  }

  const next = (() => {
    if (!detail) return undefined;
    const amount = detail.setupMinor !== null ? money(detail.setupMinor, currency) : '';
    switch (state) {
      case 'requested':
        return detail.offerSentAt
          ? t('next.offerSent', { date: longDay(detail.offerSentAt) })
          : undefined;
      case 'accepted':
        return t('next.accepted');
      case 'confirmed':
        return t('next.confirmed', { amount });
      case 'paid':
        return t('next.paid');
      case 'inProgress':
        return t('next.inProgress');
      case 'live':
        return t('next.live', { date: longDay(detail.liveAt) });
      case 'cancelled':
        return t('next.cancelled', {
          date: longDay(detail.cancelledAt),
          reason: detail.cancelReason ?? '',
        });
      case 'refunded':
        return t('next.refunded', { date: longDay(detail.refundedAt), amount });
    }
  })();

  return (
    <>
      <SetupRequestsList
        rows={listRows}
        activeRow={open?.id}
        onOpen={(row) => void openRow(row)}
        onOpenBusiness={(row) =>
          router.push(`/businesses/${rows.find((x) => x.id === row.id)!.organizationId}`)
        }
      />
      {open ? (
        <SetupRequestDrawer
          isOpen
          onOpenChange={(o) => !o && setOpen(null)}
          business={open.business}
          item={appName(open.applicationId)}
          state={state}
          meta={[open.who, when(new Date(open.createdAt))].filter(Boolean).join(' · ')}
          amounts={
            detail && detail.setupMinor !== null && detail.maintenanceMinor !== null
              ? {
                  setup: money(detail.setupMinor, currency),
                  maintenance: money(detail.maintenanceMinor, currency),
                  interval,
                }
              : null
          }
          subStart={detail?.liveAt ? longDay(detail.liveAt) : null}
          next={next}
          offer={state === 'requested' ? offer : undefined}
          onOfferChange={setOffer}
          currencySuffix={currencySuffix(currency)}
          maintenanceSuffix={`${currencySuffix(currency)} / ${interval === 'year' ? 'an' : 'lună'}`}
          today={new Date()}
          pending={pending}
          failed={failed}
          onPrimary={primary}
          onCancelMenu={() => {
            setReason('');
            setFailed(false);
            setDialog('cancel');
          }}
          phone={phone}
        />
      ) : null}
      <DialogTrigger isOpen={dialog === 'goLive'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'goLive' && open && detail ? (
          <SetupGoLiveDialog
            app={appName(open.applicationId)}
            business={open.business}
            date={longDay(new Date().toISOString())}
            amount={money(detail.maintenanceMinor ?? 0, currency)}
            pending={pending}
            mob={phone}
            onCancel={() => setDialog(null)}
            onConfirm={() =>
              void step(
                () => goLive(base!),
                t('goLive.done', { app: appName(open.applicationId), business: open.business }),
              )
            }
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      <DialogTrigger isOpen={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'cancel' && open && detail ? (
          <SetupCancelDialog
            business={open.business}
            refund={
              detail.paidAt
                ? {
                    amount: money(detail.setupMinor ?? 0, currency),
                    last4: detail.paymentMethod === 'card' ? (detail.cardLast4 ?? '····') : null,
                  }
                : null
            }
            reason={reason}
            onReasonChange={setReason}
            pending={pending}
            failed={failed}
            mob={phone}
            onCancel={() => setDialog(null)}
            onConfirm={() =>
              void step(() => cancelSetup({ ...base!, reason, refund: !!detail.paidAt }))
            }
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
    </>
  );
}
