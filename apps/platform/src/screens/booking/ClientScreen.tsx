'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  BookingClientCardView,
  ClearRiskDialog,
  SettingsToast,
  useNewTexts,
  type ClientHistoryItem,
} from '@ventora/booking/ui';
import {
  clearBehaviorNoteAction,
  readClientCard,
  type ClientCardData,
} from '@/server/booking-clients-actions';
import { useMode } from './useMode';

/* Decision 7, screen 4 — EasyBook · „Fișa clientului” (BookingClientCard, S116 c). The header,
   the figures, the note „Risc ridicat” (only for booking:admin, who can also remove it with a
   reason, S116-D12), the history with the 7 states and the contact. A member sees only their own
   appointments with the client. „Programare nouă” opens BookingNew with the client first; a row
   opens the appointment's drawer. The team notes on the client and the health information
   (BookingHealthFields) have no data source here yet and are not drawn. */

export function ClientScreen({ initial }: { initial: ClientCardData }) {
  const router = useRouter();
  const mode = useMode();
  const locale = useLocale();
  const t = useTranslations('booking');
  const ui = useTranslations('ui');
  const nx = useNewTexts();
  const [data, setData] = useState(initial);
  const [dialog, setDialog] = useState<{ reason: string; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'done' | 'danger' } | null>(null);

  const longDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  // „Vin, 6 nov., 12:30” for this year, „30 oct. 2025, 09:30” before
  const when = (date: string, time: string) => {
    const d = new Date(`${date}T12:00:00Z`);
    const sameYear = date.slice(0, 4) === data.today.slice(0, 4);
    const day = new Intl.DateTimeFormat(locale, {
      ...(date >= data.today ? { weekday: 'short' } : {}),
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
      timeZone: 'UTC',
    }).format(d);
    return `${day.charAt(0).toLocaleUpperCase(locale)}${day.slice(1)}, ${time}`;
  };
  const since = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${data.since}T12:00:00Z`));

  const history: ClientHistoryItem[] = data.history.map((r) => ({
    id: r.id,
    when: when(r.date, r.time),
    service: r.service,
    member: r.member,
    amount: nx.money(r.priceMinor, r.currency),
    status: r.status,
  }));
  const spent = data.stats?.spent
    ? nx.money(data.stats.spent.minor, data.stats.spent.currency)
    : '0';
  const dates = data.risk?.dates.map(longDay) ?? [];

  const reload = () =>
    void readClientCard(data.id).then((r) => {
      if (r.kind === 'ok') setData(r.data);
    });

  return (
    <>
      <BookingClientCardView
        mode={mode}
        name={data.name}
        backHref="/booking/appointments"
        onNew={() => router.push(`/booking/new?client=${data.id}`)}
        stats={
          data.stats
            ? {
                visits: String(data.stats.visits),
                noShows: String(data.stats.noShows),
                late: String(data.stats.lateCancellations),
                spent,
              }
            : null
        }
        risk={
          data.risk
            ? {
                title: t('client.riskTitle', { n: data.risk.noShows, months: data.risk.months }),
                body: t('client.riskBody', {
                  d1: dates.slice(0, -1).join(', '),
                  d2: dates[dates.length - 1] ?? '',
                }),
              }
            : null
        }
        onClearRisk={data.canClearNote ? () => setDialog({ reason: '', error: null }) : undefined}
        history={history}
        onRow={(r) => router.push(`/booking/appointments/${r.id}`)}
        contact={{ phone: data.phone, email: data.email, since }}
      />
      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <>
          {dialog && (
            <ClearRiskDialog
              mode={mode}
              name={data.name}
              reason={dialog.reason}
              error={dialog.error}
              busy={busy}
              onReason={(reason) => setDialog({ reason, error: null })}
              onClose={() => setDialog(null)}
              onConfirm={async () => {
                if (dialog.reason.trim().length < 10) {
                  setDialog({ ...dialog, error: t('client.reasonShort') });
                  return;
                }
                setBusy(true);
                const r = await clearBehaviorNoteAction(data.id, dialog.reason);
                setBusy(false);
                if (r.ok) {
                  setDialog(null);
                  setToast({ tone: 'done', title: t('client.riskCleared') });
                  reload();
                } else if (r.error === 'reason') {
                  setDialog({ ...dialog, error: t('client.reasonShort') });
                } else {
                  setToast({ tone: 'danger', title: t('client.failed') });
                }
              }}
            />
          )}
        </>
      </DialogTrigger>
      {toast && (
        <SettingsToast
          mode={mode}
          tone={toast.tone}
          title={toast.title}
          onDismiss={() => setToast(null)}
          dismissLabel={ui('close')}
        />
      )}
    </>
  );
}
