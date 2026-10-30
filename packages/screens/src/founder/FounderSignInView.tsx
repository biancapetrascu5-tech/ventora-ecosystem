'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, FormField, Input, Notice } from '@ventora/ui';
import { Head } from '../parts';
import styles from '../auth.module.css';

/* FounderSignIn (S101, S102): intrarea în Founder Control Center pe AuthLayout brand="founder".
   Doar română (S57): fără selector de limbă, fără nota despre invitații, fără „Ține-mă minte”.
   Stări: eroare, se verifică, prea multe încercări (15 minute, cu ora). Textele: founder.signIn.*. */

export type FounderSignInState = 'idle' | 'error' | 'loading' | 'limit' | 'offline';

export function FounderSignInView({
  state = 'idle',
  email,
  password,
  lockedTime,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onForgot,
  mob,
}: {
  state?: FounderSignInState;
  email: string;
  password: string;
  /** Ora de la care se poate încerca din nou (HH:MM), pentru „prea multe încercări”. */
  lockedTime?: string;
  onEmailChange?: (v: string) => void;
  onPasswordChange?: (v: string) => void;
  onSubmit?: () => void;
  onForgot?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('founder.signIn');
  const ui = useTranslations('ui');
  // „Fără conexiune”: același text aprobat ca în Hub (HubStates, auth.reset.offline)
  const reset = useTranslations('auth.reset');
  const error = state === 'error';
  const loading = state === 'loading';
  const locked = state === 'limit';
  const size = mob ? 'lg' : 'md';
  return (
    <form
      className={styles.contents}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <Head title={t('title')} wide={false}>
        <p className="body muted">{t('lead')}</p>
      </Head>
      {error && (
        <div role="alert">
          <Notice
            tone="danger"
            title={t('error.title')}
            actions={
              <Button size="sm" variant="quiet" onPress={onForgot}>
                {t('forgot')}
              </Button>
            }
          >
            {t('error.body')}
          </Notice>
        </div>
      )}
      {locked && (
        <div role="alert">
          <Notice tone="danger" icon="clock" title={t('limit.title')}>
            {t('limit.body', { time: lockedTime ?? '' })}
          </Notice>
        </div>
      )}
      {state === 'offline' && (
        <div role="alert">
          <Notice tone="neutral" icon="globe" title={reset('offline.title')}>
            {reset('offline.body')}
          </Notice>
        </div>
      )}
      <FormField label={t('email')}>
        {(field) => (
          <Input
            {...field}
            type="email"
            autoComplete="username"
            icon="mail"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            disabled={loading || locked}
            size={size}
          />
        )}
      </FormField>
      <FormField
        label={t('password')}
        counter={
          <button type="button" className="v-link caption" onClick={onForgot}>
            {t('forgot')}
          </button>
        }
      >
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            isInvalid={error}
            disabled={loading || locked}
            size={size}
            labels={{ showPassword: ui('showPassword'), hidePassword: ui('hidePassword') }}
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
        {t('submit')}
      </Button>
    </form>
  );
}
