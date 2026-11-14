'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogTrigger, FormField, Textarea } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';

/*
 * S147 (HubMyRecommendations, 13.11): cele două câmpuri opționale ale recomandărilor din echipă.
 *   RecommendNoteDialog — membrul, la „Recomandă aplicația”: nota pentru proprietar, cel mult 300
 *     de caractere, cu contorul și eroarea peste limită („Trimite recomandarea” e oprit).
 *   RejectRecommendationDialog — proprietarul / adminul, la „Respinge”: motivul, pe care membrul
 *     îl vede sub „Nu acum” în „Recomandările mele”.
 * Limita e repetată pe server (core/commercial) și în baza de date (CHECK 1–300).
 */

const NOTE_MAX = 300;

export function RecommendNoteDialog({
  app,
  owner,
  open,
  onClose,
  onSend,
}: {
  /** Numele aplicației. */
  app: string;
  /** Numele proprietarului; fără el, „proprietarul”. */
  owner: string;
  open: boolean;
  onClose: () => void;
  /** Trimite recomandarea (nota goală = fără notă); true când a mers. */
  onSend: (note: string) => Promise<boolean>;
}) {
  const t = useTranslations('pay.reco');
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = note.trim().length;
  const tooLong = n > NOTE_MAX;

  async function send() {
    setBusy(true);
    const ok = await onSend(note.trim());
    setBusy(false);
    if (ok) {
      setNote('');
      onClose();
    }
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog
        sheet={phone}
        title={t('note.title', { app })}
        description={t('note.body', { owner })}
        closeLabel={ui('close')}
        onClose={onClose}
        footer={
          <>
            <Button variant="quiet" isDisabled={busy} onPress={onClose}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              icon="send"
              isPending={busy}
              isDisabled={tooLong}
              onPress={() => void send()}
            >
              {t('note.send')}
            </Button>
          </>
        }
      >
        <FormField
          label={t('note.label', { owner })}
          isOptional
          optionalLabel={ui('optional')}
          hint={tooLong ? undefined : t('note.help', { owner })}
          error={tooLong ? t('note.tooLong', { n }) : undefined}
          counter={<span className="caption v-num">{t('note.count', { n })}</span>}
        >
          <Textarea
            rows={4}
            value={note}
            placeholder={t('note.placeholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </Dialog>
    </DialogTrigger>
  );
}

export function RejectRecommendationDialog({
  member,
  open,
  onClose,
  onReject,
}: {
  /** Cine a recomandat. */
  member: string;
  open: boolean;
  onClose: () => void;
  /** „Respinge” cu motivul (gol = fără motiv); true când a mers. */
  onReject: (reason: string) => Promise<boolean>;
}) {
  const t = useTranslations('pay.reco');
  const pay = useTranslations('pay');
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const tooLong = reason.trim().length > NOTE_MAX;

  async function reject() {
    setBusy(true);
    const ok = await onReject(reason.trim());
    setBusy(false);
    if (ok) {
      setReason('');
      onClose();
    }
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog
        sheet={phone}
        title={t('reject.title')}
        description={t('reject.body', { member })}
        closeLabel={ui('close')}
        onClose={onClose}
        footer={
          <>
            <Button variant="quiet" isDisabled={busy} onPress={onClose}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              isPending={busy}
              isDisabled={tooLong}
              onPress={() => void reject()}
            >
              {pay('reject')}
            </Button>
          </>
        }
      >
        <FormField
          label={t('reject.reason')}
          isOptional
          optionalLabel={ui('optional')}
          hint={t('reject.reasonHelp', { member })}
        >
          <Textarea
            rows={3}
            maxLength={NOTE_MAX}
            value={reason}
            placeholder={t('reject.placeholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </Dialog>
    </DialogTrigger>
  );
}
