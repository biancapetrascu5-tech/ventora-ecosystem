'use client';

import type { FormEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button, FormField, Icon, Input, Notice, SheetSection, StatusPill, cn } from '@ventora/ui';
import styles from './account.module.css';
import { BackupCodesList, authStyles as auth } from '@ventora/screens';

/* HubAccount · Securitate (S58, S60, S82, S83): parola, starea 2FA fără comutator pentru
   proprietar, „Coduri de rezervă” cu „Generează coduri noi” (afișate o singură dată). */

export type CodesFlowState = 'confirm' | 'wrong' | 'loading' | 'locked' | 'new';

/** Fluxul „Generează coduri noi”: confirmarea cu codul din aplicație, apoi codurile noi
   (aceleași piese ca FounderBackupCodes, S84). */
export function BackupCodesFlow({
  state,
  code,
  onCodeChange,
  lockedTime,
  codes,
  copied,
  confirmed,
  onConfirmedChange,
  onCopy,
  onDownload,
  onContinue,
  onSubmit,
  onCancel,
  mob,
}: {
  state: CodesFlowState;
  code: string;
  onCodeChange?: (v: string) => void;
  lockedTime?: string;
  codes?: string[];
  copied?: boolean;
  confirmed?: boolean;
  onConfirmedChange?: (v: boolean) => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onContinue?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('auth.2fa');
  if (state === 'new')
    return (
      <div className={styles.flow}>
        <p className={cn('body-small', auth.done)}>
          <Icon icon="circle-check" size={16} />
          {t('codes.newDone')}
        </p>
        <p className="body muted">
          {t('setup.s3.lead')} <strong className={auth.once}>{t('setup.s3.once')}</strong>
        </p>
        <BackupCodesList
          codes={codes ?? []}
          copied={copied}
          confirmed={!!confirmed}
          onConfirmedChange={onConfirmedChange}
          onCopy={onCopy}
          onDownload={onDownload}
          onContinue={onContinue}
        />
      </div>
    );
  const wrong = state === 'wrong';
  const locked = state === 'locked';
  const loading = state === 'loading';
  return (
    <form
      className={styles.flow}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <p className="body-strong">{t('codes.confirmTitle')}</p>
      <p className="body-small muted">{t('codes.confirmLead')}</p>
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
            className={auth.code}
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
      <div className={cn(auth.row, styles.actions, mob && styles.actionsCol)}>
        <Button
          type="submit"
          variant="primary"
          isPending={loading}
          isDisabled={locked}
          aria-label={loading ? t('checking') : undefined}
        >
          {t('codes.confirm')}
        </Button>
        <Button variant="quiet" onPress={onCancel}>
          {t('codes.cancel')}
        </Button>
      </div>
    </form>
  );
}

function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.secrow}>
      <div className={styles.secText}>{children}</div>
      {action}
    </div>
  );
}

export function SecuritySection({
  owner,
  twoFactorEnabled,
  passwordChanged,
  codesLeft,
  codesFlow,
  onChangePassword,
  onGenerate,
  children,
}: {
  owner: boolean;
  twoFactorEnabled: boolean;
  /** „acum 3 luni” (deja formatat); lipsește din API azi. */
  passwordChanged?: string;
  /** Câte coduri de rezervă au rămas, din countBackupCodes (Lot 2.6 · A). */
  codesLeft?: number;
  /** Fluxul „Generează coduri noi”, sub rândul codurilor, cât e deschis. */
  codesFlow?: ReactNode;
  /** Fără handler, butonul e inactiv (acțiunea nu e încă posibilă). */
  onChangePassword?: () => void;
  onGenerate?: () => void;
  /** Ce urmează în secțiune (ex. „Dispozitive conectate”). */
  children?: ReactNode;
}) {
  const t = useTranslations('account.security');
  const tfa = useTranslations('auth.2fa');
  return (
    <SheetSection title={t('title')}>
      <Row
        action={
          <Button onPress={onChangePassword} isDisabled={!onChangePassword}>
            {t('password.change')}
          </Button>
        }
      >
        <p className="body-strong">{t('password.title')}</p>
        {passwordChanged && (
          <p className="body-small muted">{t('password.changed', { when: passwordChanged })}</p>
        )}
      </Row>
      {twoFactorEnabled && (
        <div className={styles.secrow}>
          <div className={styles.split}>
            <div>
              <p className="body-strong">{t('twoStep.title')}</p>
              {owner && <p className="body-small muted">{t('twoStep.ownerBody')}</p>}
            </div>
            <StatusPill tone="neutral" icon="shield">
              {t('twoStep.active')}
            </StatusPill>
          </div>
        </div>
      )}
      {twoFactorEnabled && (
        <>
          <Row
            action={
              codesFlow ? undefined : (
                <Button onPress={onGenerate} isDisabled={!onGenerate}>
                  {tfa('backupLeft.action')}
                </Button>
              )
            }
          >
            <p className="body-strong">{tfa('codes.title')}</p>
            <p className="body-small muted">
              {tfa('codes.lead')}
              {codesLeft !== undefined && <> {tfa('codes.left', { n: codesLeft })}</>}
            </p>
          </Row>
          {codesFlow}
        </>
      )}
      {children}
    </SheetSection>
  );
}

/** Notificări: rândul informativ „E-mailuri de securitate”, fără comutator (S83). */
export function SecurityEmailsRow() {
  const t = useTranslations('auth.reset.email');
  return (
    <p className={cn('body-small', styles.infoRow)}>
      <Icon icon="shield" size={16} />
      <span>{t('securityRow')}</span>
    </p>
  );
}
