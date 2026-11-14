'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  FounderNotificationsView,
  useIsPhone,
  type FounderNotifKind,
  type FounderNotifTab,
} from '@ventora/screens';
import {
  markAllFounderRead,
  markFounderRead,
  readFounderNotifications,
  restartStoppedCampaign,
  type FounderBellData,
  type FounderBellItem,
} from '@/server/notifications-actions';
import { FounderShell } from '../shell/FounderShell';
import { useFounderNotifText } from './founderNotifText';

/* FounderNotifications (S136, P22; D4-29 a): pagina clopoțelului Founder. „Vezi” marchează
   citit (pentru acest om) și deschide: oprirea automată în Drawer, restul la locul lor (Suport,
   Cereri, afacerea). „Repornește” trece prin core/growth (Ce ai schimbat, Anunță-mă…), apoi Toast. */

export function FounderNotificationsScreen({
  user,
  initial,
  openId,
}: {
  user: { name: string };
  initial: FounderBellData;
  /** Din clopoțel: oprirea automată de deschis în Drawer. */
  openId?: string | null;
}) {
  const t = useTranslations('founder.notifications');
  const router = useRouter();
  const phone = useIsPhone();
  const text = useFounderNotifText();
  const [tab, setTab] = useState<FounderNotifTab>('unread');
  const [kind, setKind] = useState<'all' | FounderNotifKind>('all');
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<FounderBellItem | null>(
    () => initial.items.find((i) => i.id === openId && i.kind === 'auto') ?? null,
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; description?: string } | null>(null);

  const reload = useCallback(
    async (next: { tab: FounderNotifTab; kind: 'all' | FounderNotifKind }) => {
      const d = await readFounderNotifications({
        unreadOnly: next.tab === 'unread',
        kind: next.kind === 'all' ? null : next.kind,
      });
      if (d) setData(d);
    },
    [],
  );

  useEffect(() => {
    if (openId) void markFounderRead(openId);
  }, [openId]);

  const see = async (id: string) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return;
    if (!item.read) void markFounderRead(item.id).then(() => reload({ tab, kind }));
    if (item.kind === 'auto') setOpen(item);
    else if (item.actionPath) router.push(item.actionPath);
  };

  return (
    <FounderShell active="azi" title={t('title')} user={user}>
      <FounderNotificationsView
        mode={phone ? 'mobile' : 'desktop'}
        rows={data.items.map((i) => text.row(i))}
        unreadCount={data.unread}
        tab={tab}
        onTab={(next) => {
          setTab(next);
          void reload({ tab: next, kind });
        }}
        kind={kind}
        onKind={(next) => {
          setKind(next);
          void reload({ tab, kind: next });
        }}
        onMarkAll={async () => {
          const r = await markAllFounderRead();
          if (r.ok) await reload({ tab, kind });
        }}
        onSee={(r) => void see(String(r.id))}
        detail={open ? text.detail(open) : null}
        onCloseDetail={() => {
          setOpen(null);
          setConfirm(false);
        }}
        onSeeCampaign={() => {
          const id = open?.params.campaignId;
          if (typeof id === 'string') router.push(`/growth/campaigns/${id}`);
        }}
        restartOpen={confirm}
        onRestart={() => setConfirm(true)}
        onCancelRestart={() => setConfirm(false)}
        restartBusy={busy}
        onConfirmRestart={async (whatChanged, watch) => {
          const id = open?.params.campaignId;
          if (!open || typeof id !== 'string') return;
          setBusy(true);
          const r = await restartStoppedCampaign({
            campaignId: id,
            whatChanged,
            notifyOnStop: watch,
          });
          setBusy(false);
          if (!r.ok) {
            setToast({ title: t('live.error') });
            return;
          }
          const name = text.detail(open).name;
          setConfirm(false);
          setOpen(null);
          setToast({ title: t('live.done', { name }), description: t('re.doneDesc') });
        }}
        toast={toast}
        onCloseToast={() => setToast(null)}
      />
    </FounderShell>
  );
}
