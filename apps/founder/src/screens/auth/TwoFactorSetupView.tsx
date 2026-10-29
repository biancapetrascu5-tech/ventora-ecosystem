'use client';

import { useMemo, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  FormField,
  Icon,
  Input,
  Notice,
  cn,
} from '@ventora/ui';
import { encodeQr } from '@/lib/qr';
import { Head, TextLink } from './parts';
import styles from './auth.module.css';

/* HubTwoFactorSetup (R-2F1, S58, S60, S61): cei trei pași ai activării, ca vederi fără logică. */

export type SetupCodeState = 'idle' | 'wrong' | 'loading' | 'locked';

/** Codul QR al URI-ului otpauth; închis pe deschis în ambele teme, ca telefonul să-l citească. */
export function QrCode({
  value,
  label,
  size = 168,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const matrix = useMemo(() => encodeQr(value), [value]);
  const n = matrix.length;
  const c = size / n;
  return (
    <div className={styles.qr} data-theme="light">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <g fill="var(--ink)">
          {matrix.flatMap((row, y) =>
            row.map((dark, x) =>
              dark ? <rect key={`${x}-${y}`} x={x * c} y={y * c} width={c} height={c} /> : null,
            ),
          )}
        </g>
      </svg>
    </div>
  );
}

/** Cheia secretă din URI, în grupe de câte 4 (ex. „JBSW Y3DP …”). */
export function groupedKey(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get('secret') ?? '';
  return (
    secret
      .replace(/=+$/, '')
      .match(/.{1,4}/g)
      ?.join(' ') ?? ''
  );
}

function SignOut({ onSignOut }: { onSignOut?: () => void }) {
  const t = useTranslations('auth.2fa');
  return (
    <p className={styles.out}>
      <TextLink onClick={onSignOut}>{t('signOut')}</TextLink>
    </p>
  );
}

/** Pasul 1: codul QR și cheia. */
export function SetupStep1({
  founder,
  totpUri,
  copied,
  appsOpen,
  onAppsOpenChange,
  onCopy,
  onNext,
  onSignOut,
  mob,
}: {
  founder?: boolean;
  totpUri: string;
  copied?: boolean;
  appsOpen?: boolean;
  onAppsOpenChange?: (open: boolean) => void;
  onCopy?: () => void;
  onNext?: () => void;
  onSignOut?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('auth.2fa');
  return (
    <>
      <Head step={t('step', { step: 1 })} title={t('setup.s1.title')}>
        <p className="body muted">{t(founder ? 'setup.s1.leadFounder' : 'setup.s1.leadOwner')}</p>
        <p className="body muted">{t('setup.s1.how')}</p>
      </Head>
      <div className={styles.scan}>
        <p className="body-strong">{t('setup.s1.scan')}</p>
        <QrCode value={totpUri} label={t('setup.s1.qrAlt')} />
        <TextLink icon="help-circle" onClick={() => onAppsOpenChange?.(true)}>
          {t('setup.s1.whichApp')}
        </TextLink>
      </div>
      <div className={styles.key}>
        <p className={cn('body-small', styles.keyLab)} id="tfa-key">
          {t('setup.s1.manual')}
        </p>
        <div className={styles.keyBox}>
          <p className={cn('body', styles.keyText)} aria-labelledby="tfa-key">
            {groupedKey(totpUri)}
          </p>
          <Button icon={copied ? 'check' : 'copy'} size="sm" onPress={onCopy}>
            {t(copied ? 'copied' : 'copy')}
          </Button>
        </div>
      </div>
      <Button variant="primary" size="lg" block onPress={onNext}>
        {t('setup.s1.next')}
      </Button>
      <SignOut onSignOut={onSignOut} />
      <DialogTrigger isOpen={!!appsOpen} onOpenChange={onAppsOpenChange}>
        <AppsDialog mob={mob} onClose={() => onAppsOpenChange?.(false)} />
      </DialogTrigger>
    </>
  );
}

/** „Ce aplicație folosesc?” (foaie de jos pe telefon). */
export function AppsDialog({
  inline,
  mob,
  onClose,
}: {
  inline?: boolean;
  mob?: boolean;
  onClose?: () => void;
}) {
  const t = useTranslations('auth.2fa');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('setup.s1.whichApp')}
      closeLabel={ui('close')}
      onClose={onClose}
      footer={
        <Button variant="primary" block={mob} onPress={onClose}>
          {t('apps.close')}
        </Button>
      }
    >
      <p className="body">{t('apps.body')}</p>
      <p className="body muted">{t('apps.how')}</p>
    </Dialog>
  );
}

/** Pasul 2: codul de 6 cifre. */
export function SetupStep2({
  state = 'idle',
  code,
  onCodeChange,
  lockedTime,
  onSubmit,
  onBack,
  onSignOut,
}: {
  state?: SetupCodeState;
  code: string;
  onCodeChange?: (v: string) => void;
  lockedTime?: string;
  onSubmit?: () => void;
  onBack?: () => void;
  onSignOut?: () => void;
}) {
  const t = useTranslations('auth.2fa');
  const locked = state === 'locked';
  const wrong = state === 'wrong';
  const loading = state === 'loading';
  return (
    <form
      className={styles.contents}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <Head step={t('step', { step: 2 })} title={t('setup.s2.title')}>
        <p className="body muted">{t('setup.s2.lead')}</p>
      </Head>
      {locked && (
        <Notice tone="danger" icon="clock" title={t('setup.locked.title')}>
          {t('setup.locked.body', { time: lockedTime ?? '' })}
        </Notice>
      )}
      <FormField
        label={t('codeLabel')}
        error={wrong ? t('error.wrongCode') : undefined}
        hint={wrong ? undefined : t('codeHelper')}
      >
        {(field) => (
          <Input
            {...field}
            className={styles.code}
            size="lg"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => onCodeChange?.(e.target.value)}
            isInvalid={wrong}
            disabled={locked}
          />
        )}
      </FormField>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        isPending={loading}
        isDisabled={locked}
        aria-label={loading ? t('checking') : undefined}
      >
        {t('setup.s2.submit')}
      </Button>
      <Button variant="quiet" icon="arrow-left" block onPress={onBack}>
        {t('setup.s2.back')}
      </Button>
      <SignOut onSignOut={onSignOut} />
    </form>
  );
}

/** Codurile de rezervă, afișate o singură dată: listă, Descarcă / Copiază, bifa obligatorie. */
export function BackupCodesList({
  codes,
  copied,
  confirmed,
  onConfirmedChange,
  onCopy,
  onDownload,
  onContinue,
}: {
  codes: string[];
  copied?: boolean;
  confirmed: boolean;
  onConfirmedChange?: (v: boolean) => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onContinue?: () => void;
}) {
  const t = useTranslations('auth.2fa');
  return (
    <>
      <ol className={styles.codes} aria-label={t('setup.s3.listLabel')}>
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className={styles.row}>
        <Button icon="download" onPress={onDownload}>
          {t('download')}
        </Button>
        <Button icon={copied ? 'check' : 'copy'} onPress={onCopy}>
          {t(copied ? 'copied' : 'copy')}
        </Button>
      </div>
      <Checkbox
        isSelected={confirmed}
        onChange={onConfirmedChange}
        description={t('setup.s3.confirmHelp')}
      >
        {t('setup.s3.confirm')}
      </Checkbox>
      <Button variant="primary" size="lg" block isDisabled={!confirmed} onPress={onContinue}>
        {t('setup.s3.next')}
      </Button>
    </>
  );
}

/** Pasul 3: cele 10 coduri de rezervă. */
export function SetupStep3(props: Parameters<typeof BackupCodesList>[0]) {
  const t = useTranslations('auth.2fa');
  return (
    <>
      <Head step={t('step', { step: 3 })} title={t('setup.s3.title')}>
        <p className={cn('body-small', styles.done)}>
          <Icon icon="circle-check" size={16} />
          {t('setup.s3.done')}
        </p>
        <p className="body muted">
          {t('setup.s3.lead')} <strong className={styles.once}>{t('setup.s3.once')}</strong>
        </p>
      </Head>
      <BackupCodesList {...props} />
    </>
  );
}

/** Fișierul „ventora-coduri-de-rezerva.txt”, descărcat din browser. */
export function downloadCodes(fileName: string, codes: string[]): void {
  const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
