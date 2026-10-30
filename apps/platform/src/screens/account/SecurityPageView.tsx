'use client';

import type { FormEvent, ReactNode } from 'react';
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
  StatusDot,
  StatusPill,
  Toast,
  cn,
  type IconName,
} from '@ventora/ui';
import {
  AppsDialog,
  Line,
  PasswordRequirements,
  QrCode,
  TextLink,
  authStyles as auth,
  groupedKey,
} from '@ventora/screens';
import styles from './account.module.css';

/* HubAccountSecurity (S100, S108): Contul tău · Securitate — vederi fără logică.
   - rândurile: parola, autentificarea în doi pași (proprietar / activă / neactivă), codurile de
     rezervă, dispozitivele conectate;
   - „Schimbă parola” (dialog, foaie pe telefon), cele 3 stări de eroare și salvarea;
   - „Activează” pentru un membru: cei 3 pași ai HubTwoFactorSetup într-un dialog, „Renunță”;
   - „Dezactivează” pentru un membru: confirmarea cu codul din aplicație. */

export type TwoStep = 'owner' | 'on' | 'off';

export type DeviceRow = {
  id: string;
  icon: IconName;
  name: string;
  /** „Activ acum”, „Ieri, 21:40” (deja formatat, S110). */
  when: string;
  current: boolean;
};

function Row({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.secrow}>
      <div className={styles.grow}>
        <p className="body-strong">{title}</p>
        {body && <p className="body-small muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function SecurityRows({
  twoStep,
  passwordChanged,
  codesLeft,
  codesFlow,
  devices,
  onChangePassword,
  onActivate,
  onDisable,
  onGenerate,
  onSignOutDevice,
}: {
  twoStep: TwoStep;
  /** „acum 3 luni”, „azi” (deja formatat). */
  passwordChanged?: string;
  codesLeft?: number;
  /** Fluxul „Generează coduri noi”, sub rândul codurilor, cât e deschis. */
  codesFlow?: ReactNode;
  devices: DeviceRow[];
  onChangePassword?: () => void;
  onActivate?: () => void;
  onDisable?: () => void;
  onGenerate?: () => void;
  onSignOutDevice?: (id: string) => void;
}) {
  const t = useTranslations('account.security');
  const on = twoStep !== 'off';
  return (
    <>
      <Row
        title={t('password.title')}
        body={passwordChanged ? t('password.changed', { when: passwordChanged }) : undefined}
        action={
          <Button icon="key-round" onPress={onChangePassword}>
            {t('password.change')}
          </Button>
        }
      />
      <Row
        title={
          <span className={styles.asRowActions}>
            {t('twoStep.title')}
            <StatusPill tone="neutral" icon={on ? 'shield' : false}>
              {t(on ? 'twoStep.active' : 'twoStep.inactive')}
            </StatusPill>
          </span>
        }
        body={t(
          twoStep === 'owner' ? 'twoStep.ownerBody' : on ? 'twoStep.onBody' : 'twoStep.offBody',
        )}
        action={
          twoStep === 'on' ? (
            <Button variant="quiet" onPress={onDisable}>
              {t('twoStep.disable')}
            </Button>
          ) : twoStep === 'off' ? (
            <Button icon="shield" onPress={onActivate}>
              {t('twoStep.activate')}
            </Button>
          ) : undefined
        }
      />
      {on && (
        <Row
          title={t('codes.title')}
          body={t('codes.body', { n: codesLeft ?? 0 })}
          action={
            codesFlow ? undefined : <Button onPress={onGenerate}>{t('codes.generate')}</Button>
          }
        />
      )}
      {on && codesFlow}
      <p className={cn('subheading', styles.asSub)}>{t('devices.title')}</p>
      {devices.map((d) => (
        <div key={d.id} className={styles.secrow}>
          <div className={styles.dev}>
            <Icon icon={d.icon} size={20} />
            <div>
              <p className="body">
                {d.name} · {d.when}
              </p>
              {d.current && <StatusDot tone="attention" label={t('devices.thisDevice')} />}
            </div>
          </div>
          {!d.current && (
            <Button variant="quiet" onPress={() => onSignOutDevice?.(d.id)}>
              {t('devices.signOut')}
            </Button>
          )}
        </div>
      ))}
    </>
  );
}

/* ——— „Schimbă parola” (S100) ——— */

export type ChangePasswordState = 'idle' | 'wrong' | 'emptyCurrent' | 'reqs' | 'loading';

export function ChangePasswordDialog({
  state = 'idle',
  current,
  next,
  onCurrentChange,
  onNextChange,
  forgotHref,
  onCancel,
  onSubmit,
  inline,
  mob,
}: {
  state?: ChangePasswordState;
  current: string;
  next: string;
  onCurrentChange?: (v: string) => void;
  onNextChange?: (v: string) => void;
  forgotHref: string;
  onCancel?: () => void;
  onSubmit?: () => void;
  inline?: boolean;
  mob?: boolean;
}) {
  const t = useTranslations('account.security');
  const r = useTranslations('auth.reset');
  const ui = useTranslations('ui');
  const loading = state === 'loading';
  const currentErr =
    state === 'wrong'
      ? t('password.error.current')
      : state === 'emptyCurrent'
        ? t('password.error.currentEmpty')
        : undefined;
  const nextErr = state === 'reqs' ? r('error.reqs') : undefined;
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('password.change')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={loading} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={loading}
            aria-label={loading ? r('saving') : undefined}
            onPress={onSubmit}
          >
            {t('password.submit')}
          </Button>
        </>
      }
    >
      <form
        className={styles.asForm}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <FormField
          label={t('password.current')}
          error={currentErr}
          counter={
            <a className="v-link caption" href={forgotHref}>
              {t('password.forgot')}
            </a>
          }
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="current-password"
              size={mob ? 'lg' : 'md'}
              value={current}
              onChange={(e) => onCurrentChange?.(e.target.value)}
              isInvalid={!!currentErr}
            />
          )}
        </FormField>
        <FormField label={t('password.new')} error={nextErr}>
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              size={mob ? 'lg' : 'md'}
              value={next}
              onChange={(e) => onNextChange?.(e.target.value)}
              isInvalid={!!nextErr}
              aria-describedby="as-reqs"
            />
          )}
        </FormField>
        <PasswordRequirements
          id="as-reqs"
          password={next}
          labels={{
            length: r('req.length'),
            digit: r('req.digit'),
            upper: r('req.upper'),
          }}
        />
        <Line icon="log-out">{t('password.signOutNote')}</Line>
      </form>
    </Dialog>
  );
}

/* ——— „Activează” pentru un membru (S108, S110): întâi parola actuală, apoi pașii
   HubTwoFactorSetup, „Renunță” ——— */

export type MemberStepCodeState = 'idle' | 'wrong' | 'loading' | 'locked';
/** Parola de la pasul 1: greșită, se verifică, prea multe încercări (limita de la intrare). */
export type MemberPasswordState = 'idle' | 'wrong' | 'loading' | 'limit';

export function MemberTwoFactorDialog({
  step,
  password = '',
  passwordState = 'idle',
  onPasswordChange,
  forgotHref = '#',
  onConfirmPassword,
  totpUri,
  keyCopied,
  onCopyKey,
  appsOpen,
  onAppsOpenChange,
  code,
  codeState = 'idle',
  lockedTime,
  onCodeChange,
  codes,
  codesCopied,
  confirmed,
  onConfirmedChange,
  onCopyCodes,
  onDownload,
  onNext,
  onBack,
  onSubmit,
  onDone,
  onCancel,
  inline,
  mob,
}: {
  step: 1 | 2 | 3;
  /** Pasul 1 cere parola până când există totpUri (S110). */
  password?: string;
  passwordState?: MemberPasswordState;
  onPasswordChange?: (v: string) => void;
  forgotHref?: string;
  onConfirmPassword?: () => void;
  totpUri?: string;
  keyCopied?: boolean;
  onCopyKey?: () => void;
  appsOpen?: boolean;
  onAppsOpenChange?: (open: boolean) => void;
  code: string;
  codeState?: MemberStepCodeState;
  lockedTime?: string;
  onCodeChange?: (v: string) => void;
  codes: string[];
  codesCopied?: boolean;
  confirmed: boolean;
  onConfirmedChange?: (v: boolean) => void;
  onCopyCodes?: () => void;
  onDownload?: () => void;
  onNext?: () => void;
  onBack?: () => void;
  onSubmit?: () => void;
  onDone?: () => void;
  onCancel?: () => void;
  inline?: boolean;
  mob?: boolean;
}) {
  const t = useTranslations('auth.2fa');
  const a = useTranslations('account.security');
  const ui = useTranslations('ui');
  const signIn = useTranslations('auth.signIn');
  const wrong = codeState === 'wrong';
  const locked = codeState === 'locked';
  const loading = codeState === 'loading';
  const title = t(step === 1 ? 'setup.s1.title' : step === 2 ? 'setup.s2.title' : 'setup.s3.title');

  let body: ReactNode;
  let footer: ReactNode;
  if (step === 1 && !totpUri) {
    const pwWrong = passwordState === 'wrong';
    const pwLimit = passwordState === 'limit';
    body = (
      <form
        className={styles.asForm}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onConfirmPassword?.();
        }}
      >
        <p className="body">{t('setup.s1.leadMember')}</p>
        <p className="body muted">{a('twoStep.passwordLead')}</p>
        {pwLimit && (
          <Notice tone="danger" title={signIn('limit.title')}>
            {signIn('limit.body')}
          </Notice>
        )}
        <FormField
          label={a('password.current')}
          error={pwWrong ? a('twoStep.error.password') : undefined}
          counter={
            <a className="v-link caption" href={forgotHref}>
              {a('password.forgot')}
            </a>
          }
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="current-password"
              size={mob ? 'lg' : 'md'}
              value={password}
              onChange={(e) => onPasswordChange?.(e.target.value)}
              isInvalid={pwWrong}
              disabled={pwLimit}
            />
          )}
        </FormField>
      </form>
    );
    footer = (
      <>
        <Button variant="quiet" onPress={onCancel}>
          {a('cancel')}
        </Button>
        <Button
          variant="primary"
          isPending={passwordState === 'loading'}
          isDisabled={pwLimit}
          onPress={onConfirmPassword}
        >
          {a('twoStep.confirmPassword')}
        </Button>
      </>
    );
  } else if (step === 1) {
    body = (
      <div className={styles.asForm}>
        <p className="body">{t('setup.s1.leadMember')}</p>
        <p className="body muted">{t('setup.s1.how')}</p>
        <div className={auth.scan}>
          <p className="body-strong">{t('setup.s1.scan')}</p>
          {totpUri && <QrCode value={totpUri} label={t('setup.s1.qrAlt')} size={144} />}
          <TextLink icon="help-circle" onClick={() => onAppsOpenChange?.(true)}>
            {t('setup.s1.whichApp')}
          </TextLink>
        </div>
        <div className={auth.key}>
          <p className={cn('body-small', auth.keyLab)} id="as-tfa-key">
            {t('setup.s1.manual')}
          </p>
          <div className={auth.keyBox}>
            <p className={cn('body', auth.keyText)} aria-labelledby="as-tfa-key">
              {totpUri ? groupedKey(totpUri) : ''}
            </p>
            <Button icon={keyCopied ? 'check' : 'copy'} size="sm" onPress={onCopyKey}>
              {t(keyCopied ? 'copied' : 'copy')}
            </Button>
          </div>
        </div>
        <DialogTrigger isOpen={!!appsOpen} onOpenChange={onAppsOpenChange}>
          <AppsDialog mob={mob} onClose={() => onAppsOpenChange?.(false)} />
        </DialogTrigger>
      </div>
    );
    footer = (
      <>
        <Button variant="quiet" onPress={onCancel}>
          {a('cancel')}
        </Button>
        <Button variant="primary" isDisabled={!totpUri} onPress={onNext}>
          {t('setup.s1.next')}
        </Button>
      </>
    );
  } else if (step === 2) {
    body = (
      <form
        className={styles.asForm}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <p className="body muted">{t('setup.s2.lead')}</p>
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
              maxLength={7}
              value={code}
              onChange={(e) => onCodeChange?.(e.target.value)}
              isInvalid={wrong}
              disabled={locked}
            />
          )}
        </FormField>
      </form>
    );
    footer = (
      <>
        <Button variant="quiet" icon="arrow-left" onPress={onBack}>
          {t('setup.s2.back')}
        </Button>
        <Button
          variant="primary"
          isPending={loading}
          isDisabled={locked}
          aria-label={loading ? t('checking') : undefined}
          onPress={onSubmit}
        >
          {t('setup.s2.submit')}
        </Button>
      </>
    );
  } else {
    body = (
      <div className={styles.asForm}>
        <p className={cn('body-small', auth.done)}>
          <Icon icon="circle-check" size={16} />
          {t('setup.s3.done')}
        </p>
        <p className="body muted">
          {t('setup.s3.lead')} <strong className={auth.once}>{t('setup.s3.once')}</strong>
        </p>
        <ol className={auth.codes} aria-label={t('setup.s3.listLabel')}>
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div className={auth.row}>
          <Button icon="download" onPress={onDownload}>
            {t('download')}
          </Button>
          <Button icon={codesCopied ? 'check' : 'copy'} onPress={onCopyCodes}>
            {t(codesCopied ? 'copied' : 'copy')}
          </Button>
        </div>
        <Checkbox
          isSelected={confirmed}
          onChange={onConfirmedChange}
          description={t('setup.s3.confirmHelp')}
        >
          {t('setup.s3.confirm')}
        </Checkbox>
      </div>
    );
    footer = (
      <Button variant="primary" block={mob} isDisabled={!confirmed} onPress={onDone}>
        {t('setup.s3.next')}
      </Button>
    );
  }
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      size="wide"
      title={title}
      description={t('step', { step })}
      closeLabel={ui('close')}
      isDismissable={step !== 3}
      onClose={onCancel}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}

/* ——— „Dezactivează” pentru un membru: confirmarea cu codul din aplicație ——— */

export function DisableTwoFactorDialog({
  code,
  state = 'idle',
  lockedTime,
  onCodeChange,
  onCancel,
  onSubmit,
  inline,
  mob,
}: {
  code: string;
  state?: MemberStepCodeState;
  lockedTime?: string;
  onCodeChange?: (v: string) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  inline?: boolean;
  mob?: boolean;
}) {
  const t = useTranslations('account.security');
  const tfa = useTranslations('auth.2fa');
  const ui = useTranslations('ui');
  const wrong = state === 'wrong';
  const locked = state === 'locked';
  const loading = state === 'loading';
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('twoStep.disableTitle')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={loading} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            isPending={loading}
            isDisabled={locked}
            aria-label={loading ? tfa('checking') : undefined}
            onPress={onSubmit}
          >
            {t('twoStep.disable')}
          </Button>
        </>
      }
    >
      <form
        className={styles.asForm}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <p className="body">{t('twoStep.disableBody')}</p>
        {locked && (
          <Notice tone="danger" icon="clock" title={tfa('setup.locked.title')}>
            {tfa('setup.locked.body', { time: lockedTime ?? '' })}
          </Notice>
        )}
        <FormField label={tfa('codeLabel')} error={wrong ? tfa('error.wrongCode') : undefined}>
          {(field) => (
            <Input
              {...field}
              className={auth.code}
              size="lg"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => onCodeChange?.(e.target.value)}
              isInvalid={wrong}
              disabled={locked}
            />
          )}
        </FormField>
      </form>
    </Dialog>
  );
}

/** Fundalul dialogului peste pagină (.ss-overlay); `fixed` în aplicație, absolut în galerie. */
export function SecurityOverlay({
  mob,
  fixed,
  children,
}: {
  mob?: boolean;
  fixed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(styles.overlay, mob && styles.overlayM, fixed && styles.fixed)}>
      {children}
    </div>
  );
}

/** Toastul „gata” (.ss-toast): parola schimbată, 2FA activă sau dezactivată. */
export function SecurityToast({
  title,
  body,
  mob,
  fixed,
  onDismiss,
}: {
  title: string;
  body?: string;
  mob?: boolean;
  fixed?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className={cn(styles.toast, mob && styles.toastM, fixed && styles.fixed)}>
      <Toast tone="done" title={title} description={body} onDismiss={onDismiss} />
    </div>
  );
}
