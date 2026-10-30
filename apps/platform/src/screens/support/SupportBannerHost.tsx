'use client';

import { useState, type ReactNode } from 'react';
import { useFormatter } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import { closeSupportSession, type BannerData } from '@/server/support-actions';
import { useIsPhone } from '@ventora/screens';
import { CloseSupportDialog, SupportBanner, SupportClosedToast } from './SupportSessionView';
import styles from './support.module.css';

/* Bannerul deasupra întregii pagini (S85), cât timp sesiunea e activă; închiderea cu Dialog
   (S94) și toastul neutru. Pagina de dedesubt e `children`. */
export function SupportBannerHost({
  manager,
  sessions,
  children,
}: {
  manager: boolean;
  sessions: BannerData[];
  children: ReactNode;
}) {
  const format = useFormatter();
  const phone = useIsPhone();
  const [open, setOpen] = useState(sessions);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [closed, setClosed] = useState(false);
  const current = open[0];

  async function close() {
    if (!current) return;
    setPending(true);
    const ok = await closeSupportSession(current.id);
    setPending(false);
    setConfirm(false);
    if (ok) {
      setOpen((s) => s.slice(1));
      setClosed(true);
    }
  }

  return (
    <div className={styles.frame}>
      {current && (
        <SupportBanner
          manager={manager}
          mob={phone}
          onClose={() => setConfirm(true)}
          session={{
            founderName: current.founderName,
            expiresAt: format.dateTime(new Date(current.expiresAt), {
              hour: '2-digit',
              minute: '2-digit',
            }),
            reason: current.reason,
            ticketRef: current.ticketRef,
          }}
        />
      )}
      <div className={styles.body}>{children}</div>
      <DialogTrigger isOpen={confirm} onOpenChange={setConfirm}>
        <CloseSupportDialog
          mob={phone}
          pending={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={close}
        />
      </DialogTrigger>
      {closed && (
        <div className={phone ? `${styles.toast} ${styles.toastMob}` : styles.toast}>
          <SupportClosedToast onDismiss={() => setClosed(false)} />
        </div>
      )}
    </div>
  );
}
