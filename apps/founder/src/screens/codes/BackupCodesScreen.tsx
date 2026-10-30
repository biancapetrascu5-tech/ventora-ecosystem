'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { downloadCodes, groupBackupCode, useIsPhone, type CodesPageState } from '@ventora/screens';
import { regenerateFounderCodes } from '@/server/auth-actions';
import { FounderShell } from '../shell/FounderShell';
import { BackupCodesPage } from '@ventora/screens';

/* FounderBackupCodes (S84): câte au rămas, confirmarea cu codul din aplicație (D3; 5 greșite →
   15 minute, același buget ca la intrare), codurile noi afișate o singură dată. */
export function BackupCodesScreen({
  user,
  left: initialLeft,
}: {
  user: { name: string };
  left?: number;
}) {
  const t = useTranslations('auth.2fa');
  const format = useFormatter();
  const phone = useIsPhone();
  const [state, setState] = useState<CodesPageState>('left');
  const [left, setLeft] = useState(initialLeft);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [lockedTime, setLockedTime] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function submit() {
    setState('loading');
    const res = await regenerateFounderCodes(code.replace(/\s/g, ''));
    if (res.ok) {
      setCodes(res.codes.map(groupBackupCode));
      setLeft(res.codes.length);
      setState('new');
    } else if (res.reason === 'locked') {
      setLockedTime(
        format.dateTime(new Date(res.lockedUntil), { hour: '2-digit', minute: '2-digit' }),
      );
      setState('locked');
    } else setState(res.reason === 'wrong' ? 'wrong' : 'confirm');
  }

  function back() {
    setState('left');
    setCode('');
    setCodes([]);
    setCopied(false);
    setConfirmed(false);
  }

  return (
    <FounderShell title={t('codes.title')} user={user}>
      <BackupCodesPage
        state={state}
        left={left}
        code={code}
        onCodeChange={(v) => {
          setCode(v);
          if (state === 'wrong') setState('confirm');
        }}
        lockedTime={lockedTime}
        codes={codes}
        copied={copied}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        onGenerate={() => setState('confirm')}
        onSubmit={submit}
        onCancel={back}
        onCopy={async () => {
          await navigator.clipboard.writeText(codes.join('\n')).catch(() => {});
          setCopied(true);
        }}
        onDownload={() => downloadCodes(t('setup.s3.fileName'), codes)}
        onContinue={back}
        mob={phone}
      />
    </FounderShell>
  );
}
