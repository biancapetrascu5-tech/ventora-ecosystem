'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useFormatter } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import { closeSupport, openSupport } from '@/server/support-actions';
import { useIsPhone } from '@ventora/screens';
import {
  CloseFounderSupportDialog,
  FounderSupportBanner,
  FounderSupportClosedToast,
  OpenSupportDialog,
  REASON_MIN,
  type OpenFormState,
} from '@ventora/screens';
import { founderSupportStyles as styles } from '@ventora/screens';

/* Sesiunea de suport din pagina afacerii (S95): formularul, bannerul peach cât ține, închiderea
   și expirarea. Pagina afacerii (FounderBusiness) nu face parte din lot: fluxul se montează în ea
   cu `opening` controlat din „Mai multe” → „Deschide o sesiune de suport”. */
export function FounderSupportFlow({
  organizationId,
  organizationName,
  opening,
  onOpeningChange,
  children,
}: {
  organizationId: string;
  organizationName: string;
  opening: boolean;
  onOpeningChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const format = useFormatter();
  const phone = useIsPhone();
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [duration, setDuration] = useState('60');
  const [form, setForm] = useState<OpenFormState>('idle');
  const [existing, setExisting] = useState<{ founderName: string; expiresAt: string } | null>(null);
  const [session, setSession] = useState<{ id: string; expiresAt: string } | null>(null);
  const [expired, setExpired] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [closed, setClosed] = useState(false);

  // La expirare bannerul devine neutru (S86); accesul îl taie oricum serverul.
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    const id = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [session]);

  async function submit() {
    if (reason.trim().length < REASON_MIN || !ticket.trim()) {
      setForm('errors');
      return;
    }
    setForm('loading');
    const res = await openSupport({
      organizationId,
      reason: reason.trim(),
      ticketRef: ticket.trim(),
      durationMinutes: Number(duration),
    });
    if (res.ok) {
      setSession({ id: res.id, expiresAt: res.expiresAt });
      setExpired(false);
      setForm('idle');
      onOpeningChange(false);
    } else if (res.reason === 'exists') {
      // Lot 2.6 · G: cine are sesiunea deschisă și până când
      setExisting(res.existing);
      setForm('exists');
    } else setForm(res.reason === 'invalid' ? 'errors' : 'idle');
  }

  async function close() {
    if (!session) return;
    setPending(true);
    const ok = await closeSupport(session.id);
    setPending(false);
    setConfirm(false);
    if (ok) {
      setSession(null);
      setClosed(true);
    }
  }

  return (
    <div className={styles.frame}>
      {session && (
        <FounderSupportBanner
          organizationName={organizationName}
          expiresAt={format.dateTime(new Date(session.expiresAt), {
            hour: '2-digit',
            minute: '2-digit',
          })}
          expired={expired}
          mob={phone}
          onClose={() => setConfirm(true)}
          onOpenNew={() => {
            setSession(null);
            onOpeningChange(true);
          }}
        />
      )}
      <div className={styles.body}>{children}</div>
      <DialogTrigger isOpen={opening} onOpenChange={onOpeningChange}>
        <OpenSupportDialog
          state={form}
          existing={
            existing
              ? {
                  founderName: existing.founderName,
                  expiresAt: format.dateTime(new Date(existing.expiresAt), {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : undefined
          }
          reason={reason}
          ticket={ticket}
          duration={duration}
          onReasonChange={setReason}
          onTicketChange={setTicket}
          onDurationChange={setDuration}
          mob={phone}
          onCancel={() => onOpeningChange(false)}
          onSubmit={submit}
        />
      </DialogTrigger>
      <DialogTrigger isOpen={confirm} onOpenChange={setConfirm}>
        <CloseFounderSupportDialog
          organizationName={organizationName}
          mob={phone}
          pending={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={close}
        />
      </DialogTrigger>
      {closed && (
        <div className={styles.toast}>
          <FounderSupportClosedToast onDismiss={() => setClosed(false)} />
        </div>
      )}
    </div>
  );
}
