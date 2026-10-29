'use client';

import { useState } from 'react';
import { useFormatter } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import { recoverOwner } from '@/server/support-actions';
import { useIsPhone } from '../auth/hooks';
import {
  CHECK_CODE,
  EMPTY_RECOVERY,
  RecoveryConfirmDialog,
  RecoveryDone,
  RecoveryDrawer,
  canSubmit,
  type RecoveryFlags,
  type RecoveryValues,
} from './OwnerRecoveryView';

export type OwnerOption = { userId: string; name: string; email: string };

/* Recuperarea accesului proprietarului (S87), din pagina afacerii. Lista proprietarilor activi
   o dă pagina; în core nu există încă un contract Founder care s-o citească (NECESITĂ DECIZIE).
   Serverul verifică din nou regula, codul (5 greșite → 15 minute) și identitatea. */
export function OwnerRecoveryFlow({
  organizationId,
  businessName,
  owners,
  open,
  onOpenChange,
}: {
  organizationId: string;
  businessName: string;
  owners: OwnerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useFormatter();
  const phone = useIsPhone();
  const [values, setValues] = useState<RecoveryValues>(EMPTY_RECOVERY);
  const [flags, setFlags] = useState<RecoveryFlags>({});
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<'A' | 'B' | null>(null);
  const owner = owners.find((o) => o.userId === values.owner);

  function reset() {
    setValues(EMPTY_RECOVERY);
    setFlags({});
    setDone(null);
    onOpenChange(false);
  }

  async function submit() {
    if (!owner || !canSubmit(values)) return;
    setConfirm(false);
    setFlags({ loading: true });
    const res = await recoverOwner({
      organizationId,
      userId: owner.userId,
      ticketRef: values.ticket.trim(),
      reason: values.reason.trim(),
      verifications: values.checks.map((c) => CHECK_CODE[c]),
      emailCompromised: values.compromised,
      identityVerified: values.identity,
      founderTotpCode: values.code.replace(/\s/g, ''),
      resetPassword: values.variant === 'B',
    });
    if (res.ok) {
      setFlags({});
      setDone(values.variant);
      return;
    }
    if (res.reason === 'locked')
      setFlags({
        lockedTime: format.dateTime(new Date(res.lockedUntil), {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    else if (res.reason === 'refused') setFlags({ refused: true });
    else if (res.reason === 'wrongCode') setFlags({ wrongCode: true });
    else setFlags({});
  }

  if (done && owner)
    return (
      <RecoveryDone
        isOpen={open}
        businessName={businessName}
        ownerName={owner.name}
        email={owner.email}
        variant={done}
        mob={phone}
        onBack={reset}
      />
    );

  return (
    <>
      <RecoveryDrawer
        isOpen={open}
        onOpenChange={onOpenChange}
        businessName={businessName}
        values={values}
        onChange={(v) => {
          setValues(v);
          if (flags.wrongCode || flags.refused) setFlags({});
        }}
        owners={owners.map((o) => ({ value: o.userId, label: `${o.name} · ${o.email}` }))}
        flags={flags}
        mob={phone}
        onCancel={reset}
        onSubmit={() => setConfirm(true)}
      />
      {owner && (
        <DialogTrigger isOpen={confirm} onOpenChange={setConfirm}>
          <RecoveryConfirmDialog
            ownerName={owner.name}
            email={owner.email}
            variant={values.variant}
            mob={phone}
            onCancel={() => setConfirm(false)}
            onConfirm={submit}
          />
        </DialogTrigger>
      )}
    </>
  );
}
