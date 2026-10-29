'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, FormField, Input, Notice, Toast, cn } from '@ventora/ui';
import { Head, Note, TextLink } from './parts';
import styles from './auth.module.css';

/* HubTwoFactorVerify (S59, S61, S62, S81): verificarea după parolă, recuperarea, toastul R-2F10. */

export type VerifyState = 'idle' | 'wrong' | 'used' | 'loading' | 'locked' | 'expired';

export function TwoFactorVerify({
  email,
  backup,
  state = 'idle',
  code,
  onCodeChange,
  lockedTime,
  onSubmit,
  onToggleBackup,
  onOtherAccount,
  onNoAccess,
  onBackToSignIn,
}: {
  email: string;
  backup?: boolean;
  state?: VerifyState;
  code: string;
  onCodeChange?: (v: string) => void;
  lockedTime?: string;
  onSubmit?: () => void;
  onToggleBackup?: () => void;
  onOtherAccount?: () => void;
  onNoAccess?: () => void;
  onBackToSignIn?: () => void;
}) {
  const t = useTranslations('auth.2fa');
  if (state === 'expired')
    return (
      <>
        <Head title={t('verify.title')} />
        <Notice tone="neutral" icon="clock" title={t('verify.expired.title')}>
          {t('verify.expired.body')}
        </Notice>
        <Button variant="primary" size="lg" block icon="arrow-left" onPress={onBackToSignIn}>
          {t('verify.expired.action')}
        </Button>
      </>
    );
  const locked = state === 'locked';
  const loading = state === 'loading';
  const err =
    state === 'wrong'
      ? t(backup ? 'error.backupWrong' : 'error.wrongCode')
      : state === 'used'
        ? t('error.backupUsed')
        : undefined;
  return (
    <form
      className={styles.contents}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <Head title={t('verify.title')}>
        <p className="body muted">{t(backup ? 'verify.leadBackup' : 'verify.lead')}</p>
        <p className={cn('body-small', styles.acct)}>
          <span>{t('verify.account', { email })}</span>{' '}
          <TextLink onClick={onOtherAccount}>{t('verify.otherAccount')}</TextLink>
        </p>
      </Head>
      {locked && (
        <Notice tone="danger" icon="clock" title={t('verify.locked.title')}>
          {t('verify.locked.body', { time: lockedTime ?? '' })}
        </Notice>
      )}
      <FormField
        label={t(backup ? 'verify.backupLabel' : 'codeLabel')}
        error={err}
        hint={err ? undefined : t(backup ? 'verify.backupHelper' : 'codeHelper')}
      >
        {(field) => (
          <Input
            {...field}
            className={styles.code}
            size="lg"
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={backup ? 11 : 6}
            value={code}
            onChange={(e) => onCodeChange?.(e.target.value)}
            isInvalid={!!err}
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
        {t('verify.submit')}
      </Button>
      <div className={styles.linkRow}>
        <TextLink icon={backup ? 'smartphone' : 'key-round'} onClick={onToggleBackup}>
          {t(backup ? 'verify.useApp' : 'verify.useBackup')}
        </TextLink>
      </div>
      <Note icon="life-buoy">
        <TextLink onClick={onNoAccess}>{t('verify.noAccess')}</TextLink>
      </Note>
    </form>
  );
}

/** „Nu mai am acces la telefon și nici la coduri”: fără resetare automată (R-2F7, S62). */
export function TwoFactorRecovery({ onBack }: { onBack?: () => void }) {
  const t = useTranslations('auth.2fa.recovery');
  return (
    <>
      <Head title={t('title')}>
        <p className="body muted">{t('body')}</p>
      </Head>
      <p className={cn('body-small', styles.acct)}>{t('address')}</p>
      <Button
        variant="primary"
        size="lg"
        block
        icon="mail"
        onPress={() => {
          window.location.href = `mailto:${t('email')}`;
        }}
      >
        {t('write')}
      </Button>
      <Button variant="quiet" icon="arrow-left" block onPress={onBack}>
        {t('back')}
      </Button>
    </>
  );
}

/** R-2F10: după intrarea cu un cod de rezervă, câte coduri au rămas. */
export function BackupCodesLeftToast({
  left,
  onGenerate,
  onDismiss,
}: {
  left: number;
  onGenerate?: () => void;
  onDismiss?: () => void;
}) {
  const t = useTranslations('auth.2fa.backupLeft');
  const ui = useTranslations('ui');
  const msg =
    left === 0
      ? t('none')
      : left === 1
        ? t('one')
        : left <= 2
          ? t('few', { n: left })
          : t('many', { n: left });
  // 3 sau mai multe: neutru, se închide singur; 2 sau mai puține: peach, rămâne până îl închizi
  return (
    <Toast
      tone={left <= 2 ? 'attention' : 'neutral'}
      title={t('title')}
      description={msg}
      action={{ label: t('action'), onClick: onGenerate }}
      onDismiss={onDismiss}
      dismissLabel={ui('close')}
    />
  );
}
