'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Checkbox, FormField, Input, Notice } from '@ventora/ui';
import { Head, Note } from './parts';
import styles from './auth.module.css';

/* HubSignIn: intrare doar prin invitație (direcția B, S63), cu stările din HubStates. */

export type SignInState = 'idle' | 'error' | 'loading' | 'limit' | 'offline';

export function SignInView({
  state = 'idle',
  email,
  password,
  remember,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  mob,
  onSubmit,
  onForgot,
}: {
  state?: SignInState;
  email: string;
  password: string;
  remember: boolean;
  onEmailChange?: (v: string) => void;
  onPasswordChange?: (v: string) => void;
  onRememberChange?: (v: boolean) => void;
  mob?: boolean;
  onSubmit?: () => void;
  onForgot?: () => void;
}) {
  const t = useTranslations('auth.signIn');
  const ui = useTranslations('ui');
  // „Fără conexiune” are același text aprobat ca la resetare (HubStates)
  const reset = useTranslations('auth.reset');
  const error = state === 'error';
  const loading = state === 'loading';
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
      {state === 'limit' && (
        <div role="alert">
          <Notice tone="danger" title={t('limit.title')}>
            {t('limit.body')}
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
      <FormField label={t('emailLabel')}>
        {(field) => (
          <Input
            {...field}
            type="email"
            autoComplete="username"
            icon="mail"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            disabled={loading}
            size={size}
          />
        )}
      </FormField>
      <FormField
        label={t('passwordLabel')}
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
            disabled={loading}
            size={size}
            labels={{ showPassword: ui('showPassword'), hidePassword: ui('hidePassword') }}
          />
        )}
      </FormField>
      <Checkbox isSelected={remember} onChange={onRememberChange} isDisabled={loading}>
        {t('remember')}
      </Checkbox>
      <Button type="submit" variant="primary" size="lg" block isPending={loading}>
        {loading ? t('submitting') : t('submit')}
      </Button>
      <Note icon="mail">
        <p className="body-small">{t('inviteOnly')}</p>
      </Note>
    </form>
  );
}
