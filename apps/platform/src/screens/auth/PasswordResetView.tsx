'use client';

import type { FormEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, FormField, Icon, Input, Notice, cn } from '@ventora/ui';
import { Head, Line, Note, PasswordRequirements, TextLink } from './parts';
import styles from './auth.module.css';

/* HubPasswordReset (S72–S79, R-PR1…R-PR8): cele patru ecrane ca vederi fără logică.
   Containerul (app/(auth)/…) ține starea și vorbește cu API-ul; galeria le arată cu date fixe. */

export type RequestState = 'idle' | 'empty' | 'format' | 'loading' | 'limit' | 'offline';
export type SentState = 'wait' | 'ready' | 'resent';
export type NewPasswordState = 'form' | 'error' | 'loading' | 'expired' | 'used';

function submitWith(handler?: () => void) {
  return (e: FormEvent) => {
    e.preventDefault();
    handler?.();
  };
}

function useLabels() {
  const t = useTranslations('ui');
  return { showPassword: t('showPassword'), hidePassword: t('hidePassword') };
}

function Back({ onPress }: { onPress?: () => void }) {
  const t = useTranslations('auth.reset');
  return (
    <Button variant="quiet" icon="arrow-left" block onPress={onPress}>
      {t('back')}
    </Button>
  );
}

/** 1 · „Ai uitat parola?” */
export function ResetRequest({
  state = 'idle',
  email,
  onEmailChange,
  limitTime,
  mob,
  onSubmit,
  onBack,
}: {
  state?: RequestState;
  email: string;
  onEmailChange?: (v: string) => void;
  /** Ora după care se poate cere un link nou (din `retryAt`, R-PR4). */
  limitTime?: string;
  mob?: boolean;
  onSubmit?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations('auth.reset');
  const err =
    state === 'empty' ? t('error.empty') : state === 'format' ? t('error.format') : undefined;
  const limited = state === 'limit';
  const loading = state === 'loading';
  return (
    <form className={styles.contents} onSubmit={submitWith(onSubmit)} noValidate>
      <Head title={t('request.title')}>
        <p className="body muted">{t('request.lead')}</p>
      </Head>
      {limited && (
        <Notice tone="danger" icon="clock" title={t('limit.title')}>
          {t('limit.body', { time: limitTime ?? '' })}
        </Notice>
      )}
      {state === 'offline' && (
        <Notice tone="neutral" icon="globe" title={t('offline.title')}>
          {t('offline.body')}
        </Notice>
      )}
      <FormField label={t('emailLabel')} error={err}>
        {(field) => (
          <Input
            {...field}
            type="email"
            autoComplete="username"
            icon="mail"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            isInvalid={!!err}
            disabled={limited}
            size={mob ? 'lg' : 'md'}
          />
        )}
      </FormField>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        isPending={loading}
        isDisabled={limited}
        aria-label={loading ? t('sending') : undefined}
      >
        {t('request.submit')}
      </Button>
      <Back onPress={onBack} />
    </form>
  );
}

/** Textul cu adresa îngroșată: „Dacă {email} este adresa unui cont Ventora, …”. */
function WithEmail({ text, email }: { text: string; email: string }): ReactNode {
  const [before, after] = text.split('{email}');
  return (
    <>
      {before}
      <strong className={cn('body-strong', styles.mail)}>{email}</strong>
      {after}
    </>
  );
}

/** 2 · „Verifică-ți e-mailul” — același ecran pentru orice adresă (S73). */
export function ResetSent({
  state = 'wait',
  email,
  onResend,
  onOtherEmail,
  onBack,
}: {
  state?: SentState;
  /** Lipsește când linkul nou a plecat din R-PR5: API-ul nu întoarce adresa (NECESITĂ DECIZIE). */
  email?: string;
  onResend?: () => void;
  onOtherEmail?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations('auth.reset');
  const ready = state !== 'wait';
  return (
    <>
      <Head title={t('sent.title')}>
        {email && (
          <p className="body muted">
            <WithEmail text={t.raw('sent.body') as string} email={email} />
          </p>
        )}
        <p className="body muted">{t('sent.validity')}</p>
      </Head>
      {state === 'resent' && (
        <Line icon="mail-check" ok>
          {t('sent.resent')}
        </Line>
      )}
      <Note icon="inbox">
        <p className="body-small">{t('sent.help')}</p>
      </Note>
      <div className={styles.resend}>
        <Button variant="secondary" icon="send" block isDisabled={!ready} onPress={onResend}>
          {t('sent.resend')}
        </Button>
        {!ready && <p className={cn('caption muted', styles.center)}>{t('sent.resendWait')}</p>}
      </div>
      <div className={styles.links}>
        <TextLink onClick={onOtherEmail}>{t('sent.otherEmail')}</TextLink>
        <span className="muted" aria-hidden>
          ·
        </span>
        <TextLink onClick={onBack}>{t('back')}</TextLink>
      </div>
    </>
  );
}

/** 3 · „Alege o parolă nouă” (din linkul primit pe e-mail), cu stările linkului. */
export function ResetNewPassword({
  state = 'form',
  email,
  password,
  onPasswordChange,
  mob,
  onSubmit,
  onNewLink,
  onSignIn,
  onBack,
}: {
  state?: NewPasswordState;
  /** Adresa contului; API-ul nu o dă încă pentru un token (NECESITĂ DECIZIE). */
  email?: string;
  password: string;
  onPasswordChange?: (v: string) => void;
  mob?: boolean;
  onSubmit?: () => void;
  onNewLink?: () => void;
  onSignIn?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations('auth.reset');
  const labels = useLabels();
  if (state === 'expired')
    return (
      <>
        <Head title={t('new.title')} />
        <Notice
          tone="attention"
          title={t('expired.title')}
          actions={
            <Button variant="primary" size="sm" icon="send" onPress={onNewLink}>
              {t('newLink')}
            </Button>
          }
        >
          {t('expired.body')}
        </Notice>
        <Back onPress={onBack} />
      </>
    );
  if (state === 'used')
    return (
      <EmptyState
        size="sm"
        icon="lock"
        title={t('used.title')}
        description={t('used.body')}
        actions={
          <>
            <Button variant="primary" onPress={onSignIn}>
              {t('signIn')}
            </Button>
            <Button variant="quiet" icon="send" onPress={onNewLink}>
              {t('newLink')}
            </Button>
          </>
        }
      />
    );
  const err = state === 'error' ? t('error.reqs') : undefined;
  const loading = state === 'loading';
  return (
    <form className={styles.contents} onSubmit={submitWith(onSubmit)} noValidate>
      <Head title={t('new.title')}>
        {email && <p className={cn('body-small', styles.acct)}>{t('new.account', { email })}</p>}
      </Head>
      <FormField label={t('new.label')} error={err}>
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            isInvalid={!!err}
            size={mob ? 'lg' : 'md'}
            labels={labels}
            aria-describedby={[field['aria-describedby'], 'pr-reqs'].filter(Boolean).join(' ')}
          />
        )}
      </FormField>
      <PasswordRequirements
        id="pr-reqs"
        password={password}
        labels={{ length: t('req.length'), digit: t('req.digit'), upper: t('req.upper') }}
      />
      <Line icon="log-out">{t('new.signOutNote')}</Line>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        isPending={loading}
        aria-label={loading ? t('saving') : undefined}
      >
        {t('new.submit')}
      </Button>
    </form>
  );
}

/** 4 · „Parola e schimbată” — toate sesiunile s-au închis (S72). */
export function ResetDone({ twoStep, onSignIn }: { twoStep: boolean; onSignIn?: () => void }) {
  const t = useTranslations('auth.reset');
  return (
    <>
      <Head title={t('done.title')}>
        <p className={cn('body-small', styles.done)}>
          <Icon icon="log-out" size={16} />
          {t('done.signedOut')}
        </p>
        <p className="body muted">{t('done.body')}</p>
      </Head>
      {twoStep && (
        <Note icon="smartphone">
          <p className="body-small">{t('done.twoStep')}</p>
        </Note>
      )}
      <Button variant="primary" size="lg" block onPress={onSignIn}>
        {t('signIn')}
      </Button>
    </>
  );
}
