'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  Dialog,
  Drawer,
  FormField,
  Icon,
  Input,
  Notice,
  Radio,
  RadioGroup,
  Select,
  Textarea,
  Toggle,
  cn,
} from '@ventora/ui';
import { thousands as fmt } from './fmt';
import styles from './support.module.css';

/* FounderOwnerRecovery (Lotul 2.5c, S87, S93, S98; docs/ops/PROCEDURA-RECUPERARE-OWNER.md):
   Drawer-ul cu verificările și regula lor live, confirmarea danger și rezultatul.
   Doar română (S57); cheile founder.recovery.* + erorile de cod din auth.2fa.*. */

export type Check = 'email' | 'phone' | 'admin';
/** a / b / c din contractul recoverOwnerAccess (core/access). */
export const CHECK_CODE: Record<Check, 'a' | 'b' | 'c'> = { email: 'a', phone: 'b', admin: 'c' };

export type RecoveryValues = {
  owner?: string;
  ticket: string;
  reason: string;
  checks: Check[];
  compromised: boolean;
  identity: boolean;
  variant: 'A' | 'B';
  code: string;
};

export const EMPTY_RECOVERY: RecoveryValues = {
  ticket: '',
  reason: '',
  checks: [],
  compromised: false,
  identity: false,
  variant: 'B',
  code: '',
};

/** Regula (§4): cel puțin 2 verificări; cu adresa compromisă, telefonul și adminul. */
export function ruleHolds(v: RecoveryValues): boolean {
  return v.compromised
    ? v.checks.includes('phone') && v.checks.includes('admin')
    : v.checks.length >= 2;
}

export function canSubmit(v: RecoveryValues): boolean {
  return (
    ruleHolds(v) &&
    v.identity &&
    !!v.owner &&
    v.code.replace(/\s/g, '').length === 6 &&
    !!v.ticket.trim() &&
    v.reason.trim().length >= 10
  );
}

export type RecoveryFlags = {
  refused?: boolean;
  wrongCode?: boolean;
  /** Ora deblocării (din TwoFactorLocked.lockedUntil), deja formatată. */
  lockedTime?: string;
  loading?: boolean;
};

export function RecoveryForm({
  values,
  onChange,
  owners,
  flags = {},
  mob,
}: {
  values: RecoveryValues;
  onChange?: (v: RecoveryValues) => void;
  owners: { value: string; label: string }[];
  flags?: RecoveryFlags;
  mob?: boolean;
}) {
  const t = useTranslations('founder.recovery');
  const tfa = useTranslations('auth.2fa');
  const ui = useTranslations('ui');
  const set = (patch: Partial<RecoveryValues>) => onChange?.({ ...values, ...patch });
  const ok = ruleHolds(values);
  const locked = !!flags.lockedTime;
  const toggleCheck = (c: Check, on: boolean) =>
    set({ checks: on ? [...values.checks, c] : values.checks.filter((x) => x !== c) });
  const check = (c: Check) => (
    <Checkbox
      isSelected={values.checks.includes(c)}
      onChange={(on) => toggleCheck(c, on)}
      isDisabled={c === 'email' && values.compromised}
      description={t(`check.${c}Help`)}
    >
      {t(`check.${c}`)}
    </Checkbox>
  );
  return (
    <div className={styles.form}>
      <p className="body-small muted">{t('lead')}</p>
      {flags.refused && (
        <Notice tone="danger" title={t('refusedTitle')}>
          {t('refusedBody')}
        </Notice>
      )}
      {locked && (
        <Notice tone="danger" icon="clock" title={tfa('setup.locked.title')}>
          {tfa('setup.locked.body', { time: flags.lockedTime ?? '' })}
        </Notice>
      )}
      <FormField label={t('owner')} isRequired requiredLabel={ui('required')}>
        {(field) => (
          <Select
            id={field.id}
            aria-describedby={field['aria-describedby']}
            options={owners}
            value={values.owner}
            onChange={(owner) => set({ owner })}
            placeholder={t('ownerPlaceholder')}
          />
        )}
      </FormField>
      <FormField
        label={t('ticket')}
        isRequired
        requiredLabel={ui('required')}
        hint={t('ticketHelp')}
      >
        {(field) => (
          <Input
            {...field}
            maxLength={255}
            value={values.ticket}
            onChange={(e) => set({ ticket: e.target.value })}
          />
        )}
      </FormField>
      <FormField
        label={t('reason')}
        isRequired
        requiredLabel={ui('required')}
        hint={t('reasonHelp')}
        counter={`${fmt(values.reason.length)} / ${fmt(1000)}`}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={1000}
            value={values.reason}
            onChange={(e) => set({ reason: e.target.value })}
          />
        )}
      </FormField>
      <fieldset className={styles.fieldset}>
        <legend className={cn('body-strong', styles.legend)}>{t('checks')}</legend>
        {check('email')}
        {check('phone')}
        {check('admin')}
      </fieldset>
      <Toggle
        isSelected={values.compromised}
        onChange={(compromised) => set({ compromised })}
        description={t('compromisedHelp')}
        labelPosition={mob ? 'start' : 'end'}
      >
        {t('compromised')}
      </Toggle>
      <p className={cn('body-small', styles.rule, ok && styles.ruleOk)} aria-live="polite">
        <Icon icon={ok ? 'circle-check' : 'circle-alert'} size={16} />
        {ok ? t('rule.ok') : values.compromised ? t('rule.compromised') : t('rule.min')}
      </p>
      <Checkbox isSelected={values.identity} onChange={(identity) => set({ identity })}>
        {t('identity')}
      </Checkbox>
      <RadioGroup
        label={t('variant')}
        value={values.variant}
        onChange={(variant) => set({ variant: variant as 'A' | 'B' })}
      >
        <Radio value="B" description={t('variantBHelp')}>
          {t('variantB')}
        </Radio>
        <Radio value="A" description={t('variantAHelp')}>
          {t('variantA')}
        </Radio>
      </RadioGroup>
      <FormField
        label={t('code')}
        isRequired
        requiredLabel={ui('required')}
        hint={flags.wrongCode ? undefined : t('codeHelp')}
        error={flags.wrongCode ? tfa('error.wrongCode') : undefined}
      >
        {(field) => (
          <Input
            {...field}
            className={styles.code}
            size="lg"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={values.code}
            onChange={(e) => set({ code: e.target.value })}
            isInvalid={!!flags.wrongCode}
            disabled={locked}
          />
        )}
      </FormField>
      {!canSubmit(values) && !flags.loading && <p className="caption muted">{t('disabledHelp')}</p>}
    </div>
  );
}

/** Drawer-ul (ecran întreg pe telefon). `contained`: în galerie, peste pagina din cadru. */
export function RecoveryDrawer({
  businessName,
  values,
  onChange,
  owners,
  flags = {},
  mob,
  contained,
  isOpen,
  onOpenChange,
  onCancel,
  onSubmit,
}: {
  businessName: string;
  values: RecoveryValues;
  onChange?: (v: RecoveryValues) => void;
  owners: { value: string; label: string }[];
  flags?: RecoveryFlags;
  mob?: boolean;
  contained?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
}) {
  const t = useTranslations('founder.recovery');
  const ui = useTranslations('ui');
  const ready = canSubmit(values) && !flags.lockedTime;
  return (
    <Drawer
      contained={contained}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onCancel}
      layout={mob ? 'full' : 'side'}
      width={560}
      title={t('title')}
      subtitle={businessName}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            icon="key-round"
            isDisabled={!ready && !flags.loading}
            isPending={!!flags.loading}
            onPress={onSubmit}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <RecoveryForm values={values} onChange={onChange} owners={owners} flags={flags} mob={mob} />
    </Drawer>
  );
}

/** Confirmarea danger: „Recuperezi accesul pentru {ownerName}?” */
export function RecoveryConfirmDialog({
  ownerName,
  email,
  variant,
  inline,
  mob,
  onCancel,
  onConfirm,
}: {
  ownerName: string;
  email: string;
  variant: 'A' | 'B';
  inline?: boolean;
  mob?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations('founder.recovery');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      tone="danger"
      title={t('confirmTitle', { ownerName })}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="danger" icon="key-round" onPress={onConfirm}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <ul className={cn('body', styles.list)}>
        <li>{t('confirmSessions', { ownerName })}</li>
        <li>{t('confirm2fa')}</li>
        {variant === 'B' && <li>{t('confirmPassword', { email })}</li>}
      </ul>
      <p className={cn('body-small muted', styles.after)}>{t('confirmLog')}</p>
    </Dialog>
  );
}

/** Rezultatul: ce urmează pentru proprietar. */
export function RecoveryDone({
  businessName,
  ownerName,
  email,
  variant,
  mob,
  contained,
  isOpen,
  onBack,
}: {
  businessName: string;
  ownerName: string;
  email: string;
  variant: 'A' | 'B';
  mob?: boolean;
  contained?: boolean;
  isOpen?: boolean;
  onBack?: () => void;
}) {
  const t = useTranslations('founder.recovery');
  const ui = useTranslations('ui');
  return (
    <Drawer
      contained={contained}
      isOpen={isOpen}
      onClose={onBack}
      layout={mob ? 'full' : 'side'}
      width={560}
      title={t('title')}
      subtitle={businessName}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      footer={
        <Button variant="primary" icon="arrow-left" onPress={onBack}>
          {t('back')}
        </Button>
      }
    >
      <div className={styles.form}>
        <p className={cn('body-strong', styles.done)}>
          <Icon icon="circle-check" size={16} />
          {t('doneTitle')}
        </p>
        <p className="body">
          {variant === 'B' ? t('doneB', { ownerName, email }) : t('doneA', { ownerName })}
        </p>
        <p className="body-small muted">{t('doneLog')}</p>
      </div>
    </Drawer>
  );
}
