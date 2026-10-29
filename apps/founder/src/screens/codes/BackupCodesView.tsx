'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  FormField,
  Icon,
  Input,
  Notice,
  PageHeader,
  Sheet,
  SheetSection,
  cn,
} from '@ventora/ui';
import { BackupCodesList } from '../auth/TwoFactorSetupView';
import { Glyph } from '../glyphs';
import auth from '../auth/auth.module.css';
import styles from './codes.module.css';

/* FounderBackupCodes (S84): pagina „Coduri de rezervă” din shell-ul Founder, cu stările 1–6.
   Refolosește câmpul de 6 cifre din verificare și lista din pasul 3 al activării. */

export type CodesPageState = 'left' | 'confirm' | 'wrong' | 'loading' | 'locked' | 'new';

export function BackupCodesBody({
  state,
  left,
  code,
  onCodeChange,
  lockedTime,
  codes,
  copied,
  confirmed,
  onConfirmedChange,
  onGenerate,
  onSubmit,
  onCancel,
  onCopy,
  onDownload,
  onContinue,
  mob,
}: {
  state: CodesPageState;
  /** Câte au rămas; API-ul nu le numără încă (NECESITĂ DECIZIE). */
  left?: number;
  code: string;
  onCodeChange?: (v: string) => void;
  lockedTime?: string;
  codes?: string[];
  copied?: boolean;
  confirmed?: boolean;
  onConfirmedChange?: (v: boolean) => void;
  onGenerate?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onContinue?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('auth.2fa');
  if (state === 'left')
    return (
      <>
        {left !== undefined && <p className="body-strong">{t('codes.left', { n: left })}</p>}
        <p className="body-small muted">{t('codes.oldStop')}</p>
        <div>
          <Button variant="primary" block={mob} onPress={onGenerate} isDisabled={!onGenerate}>
            <span className={styles.lbl}>
              <Glyph name="key-round" />
              {t('backupLeft.action')}
            </span>
          </Button>
        </div>
      </>
    );
  if (state === 'new')
    return (
      <>
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
      </>
    );
  const wrong = state === 'wrong';
  const locked = state === 'locked';
  const loading = state === 'loading';
  return (
    <form
      className={styles.body}
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

/** Conținutul paginii (fără shell): antetul și foaia cu starea curentă. */
export function BackupCodesPage(props: Parameters<typeof BackupCodesBody>[0]) {
  const t = useTranslations('auth.2fa.codes');
  return (
    <>
      <PageHeader title={t('title')} description={props.mob ? undefined : t('lead')} />
      <div className={cn(styles.wrap, props.mob && styles.wrapMob)}>
        <Sheet>
          <SheetSection description={props.mob ? t('lead') : undefined}>
            <div className={styles.body}>
              <BackupCodesBody {...props} />
            </div>
          </SheetSection>
        </Sheet>
      </div>
    </>
  );
}
