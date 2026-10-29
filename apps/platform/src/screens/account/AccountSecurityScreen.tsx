'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { PageHeader, Sheet, SheetSection } from '@ventora/ui';
import { regenerateCodes } from '@/server/codes-actions';
import { useIsPhone } from '@ventora/screens';
import {
  BackupCodesFlow,
  SecurityEmailsRow,
  SecuritySection,
  type CodesFlowState,
} from './SecurityView';
import { downloadCodes } from '@ventora/screens';

/* Contul tău · Securitate.
   - „Coduri de rezervă”: câte au rămas și „Generează coduri noi”, confirmat cu codul din aplicație
     (D3; 5 coduri greșite → 15 minute, același buget ca la intrare); codurile noi se văd o dată.
   - „Schimbă parola”: formularul vine de la Claude Design (Lotul 2.6 nu-l atinge) → inactiv.
   - Rândul „Autentificare în doi pași” pentru membri: tot de la design → doar pentru 2FA activ. */
export function AccountSecurityScreen({
  owner,
  twoFactorEnabled,
  codesLeft: initialLeft,
}: {
  owner: boolean;
  twoFactorEnabled: boolean;
  codesLeft?: number;
}) {
  const t = useTranslations('account');
  const tfa = useTranslations('auth.2fa');
  const format = useFormatter();
  const phone = useIsPhone();
  const [left, setLeft] = useState(initialLeft);
  const [flow, setFlow] = useState<CodesFlowState | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [lockedTime, setLockedTime] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // D1: 8 cifre, afișate în două grupe de 4
  const shown = codes.map((c) => (/^\d{8}$/.test(c) ? `${c.slice(0, 4)} ${c.slice(4)}` : c));

  function close() {
    setFlow(null);
    setCode('');
    setCodes([]);
    setCopied(false);
    setConfirmed(false);
  }

  async function submit() {
    setFlow('loading');
    const res = await regenerateCodes(code.replace(/\s/g, ''));
    if (res.ok) {
      setCodes(res.codes);
      setLeft(res.codes.length);
      setFlow('new');
    } else if (res.reason === 'locked') {
      setLockedTime(
        format.dateTime(new Date(res.lockedUntil), { hour: '2-digit', minute: '2-digit' }),
      );
      setFlow('locked');
    } else setFlow(res.reason === 'wrong' ? 'wrong' : 'confirm');
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <Sheet>
        <SheetSection title={t('notifications.title')} description={t('notifications.lead')}>
          <SecurityEmailsRow />
        </SheetSection>
        <SecuritySection
          owner={owner}
          twoFactorEnabled={twoFactorEnabled}
          codesLeft={left}
          onGenerate={() => setFlow('confirm')}
          codesFlow={
            flow ? (
              <BackupCodesFlow
                state={flow}
                code={code}
                onCodeChange={(v) => {
                  setCode(v);
                  if (flow === 'wrong') setFlow('confirm');
                }}
                lockedTime={lockedTime}
                codes={shown}
                copied={copied}
                confirmed={confirmed}
                onConfirmedChange={setConfirmed}
                onCopy={async () => {
                  await navigator.clipboard.writeText(shown.join('\n')).catch(() => {});
                  setCopied(true);
                }}
                onDownload={() => downloadCodes(tfa('setup.s3.fileName'), shown)}
                onContinue={close}
                onSubmit={submit}
                onCancel={close}
                mob={phone}
              />
            ) : undefined
          }
        />
      </Sheet>
    </>
  );
}
