'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Notice,
  cn,
  type AppName,
} from '@ventora/ui';
import { PasswordRequirements } from './parts';
import styles from './auth.module.css';

/* HubInvite (direcția B, R-B6): cine te-a invitat, afacerea, rolul și aplicațiile, parola cu
   cerințele bifate pe loc, termenii. Stările din HubStates: cerere trimisă, anulată, folosită. */

export type InviteData = {
  inviterName: string;
  businessName: string;
  roleName: string;
  apps: AppName[];
  email: string;
  /** Data până la care e valabilă, deja formatată („31 octombrie 2026”). */
  expires: string;
};

export type InviteState = 'form' | 'loading' | 'expired' | 'requested' | 'revoked' | 'used';

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

export function InviteView({
  state = 'form',
  invite,
  name,
  password,
  terms,
  onNameChange,
  onPasswordChange,
  onTermsChange,
  onSubmit,
  onRequestNew,
  onSignIn,
  mob,
}: {
  state?: InviteState;
  invite: InviteData;
  name: string;
  password: string;
  terms: boolean;
  onNameChange?: (v: string) => void;
  onPasswordChange?: (v: string) => void;
  onTermsChange?: (v: boolean) => void;
  onSubmit?: () => void;
  onRequestNew?: () => void;
  onSignIn?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('invite');
  const ui = useTranslations('ui');
  if (state === 'requested')
    return (
      <EmptyState
        size="sm"
        icon="send"
        title={t('requested.title')}
        description={t('requested.body', { name: invite.inviterName })}
      />
    );
  if (state === 'revoked')
    return (
      <EmptyState
        size="sm"
        icon="mail"
        title={t('revoked.title')}
        description={t('revoked.body')}
      />
    );
  if (state === 'used')
    return (
      <EmptyState
        size="sm"
        icon="lock"
        title={t('used.title')}
        description={t('used.body')}
        actions={
          <Button variant="primary" onPress={onSignIn}>
            {t('signIn')}
          </Button>
        }
      />
    );
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
      <div className={styles.invHead}>
        <span className={styles.mark}>{initials(invite.businessName)}</span>
        <div>
          <p className="caption muted">{t('fromLabel', { name: invite.inviterName })}</p>
          <h1 className="display-m">{t('title', { afacere: invite.businessName })}</h1>
        </div>
      </div>
      {state === 'expired' ? (
        <Notice
          tone="attention"
          title={t('expiredTitle')}
          actions={
            <Button variant="primary" size="sm" icon="send" onPress={onRequestNew}>
              {t('requestNew')}
            </Button>
          }
        >
          {t('expiredBody', { name: invite.inviterName })}
        </Notice>
      ) : (
        <>
          <div className={styles.invRole}>
            <p className="body">
              {(t.raw('roleDesc') as string).split('{role}')[0]}
              <strong className="body-strong">{invite.roleName}</strong>
              {(t.raw('roleDesc') as string).split('{role}')[1]}
            </p>
            <div className={styles.invApps}>
              {invite.apps.map((a) => (
                <span key={a} className={styles.invApp}>
                  <AppIcon app={a} size={24} />
                  <span className="body-small">{APPS[a]?.name}</span>
                </span>
              ))}
            </div>
          </div>
          <FormField label={t('nameField')} isRequired requiredLabel={ui('required')}>
            {(field) => (
              <Input
                {...field}
                autoComplete="name"
                value={name}
                onChange={(e) => onNameChange?.(e.target.value)}
                size={size}
              />
            )}
          </FormField>
          <div className={styles.invEmail}>
            <span className="caption muted">{t('emailLabel')}</span>
            <span className="body-strong">{invite.email}</span>
            <span className="caption muted">{t('emailNote')}</span>
          </div>
          <FormField label={t('passwordField')} isRequired requiredLabel={ui('required')}>
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => onPasswordChange?.(e.target.value)}
                size={size}
                labels={{ showPassword: ui('showPassword'), hidePassword: ui('hidePassword') }}
              />
            )}
          </FormField>
          <PasswordRequirements
            password={password}
            labels={{ length: t('reqLength'), digit: t('reqDigit'), upper: t('reqUpper') }}
          />
          <Checkbox isSelected={terms} onChange={onTermsChange} description={t('termsDesc')}>
            {t('termsLabel')}
          </Checkbox>
          <Button type="submit" variant="primary" size="lg" block isPending={state === 'loading'}>
            {t('accept')}
          </Button>
          <p className={cn('caption muted', styles.center)}>
            {t('expiry', { data: invite.expires })}
          </p>
        </>
      )}
    </form>
  );
}
