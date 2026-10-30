'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { PageHeader, Sheet, SheetSection } from '@ventora/ui';
import {
  authApi,
  downloadCodes,
  groupBackupCode,
  passwordMeetsRules,
  useClock,
  useIsPhone,
} from '@ventora/screens';
import { regenerateCodes } from '@/server/codes-actions';
import {
  disableTwoFactor,
  listDevices,
  signOutDevice,
  startTwoFactor,
  type Device,
} from '@/server/account-actions';
import { BackupCodesFlow, SecurityEmailsRow, type CodesFlowState } from './SecurityView';
import {
  ChangePasswordDialog,
  DisableTwoFactorDialog,
  MemberTwoFactorDialog,
  SecurityOverlay,
  SecurityRows,
  SecurityToast,
  type ChangePasswordState,
  type MemberStepCodeState,
  type TwoStep,
} from './SecurityPageView';
import { describeDevice } from './device';

/* Contul tău · Securitate (Lot 2.7 · D; S100, S108).
   - „Schimbă parola”: /change-password cu revokeOtherSessions (rămâi conectat aici, pleacă E-mailul
     S78 „celelalte dispozitive”); cerințele Hub: 10 caractere, o cifră, o literă mare.
   - Autentificarea în doi pași: obligatorie pentru proprietar (fără comutator); un membru o
     activează (3 pași, „Renunță”) și o dezactivează cu codul din aplicație.
   - „Coduri de rezervă”: confirmate cu codul din aplicație (D3); „Dispozitive conectate”. */

type Dialog = 'password' | 'enable' | 'disable' | null;
type DoneToast = { title: string; body?: string };

const FORGOT_HREF = '/forgot-password';

export function AccountSecurityScreen({
  owner,
  twoFactorEnabled,
  codesLeft: initialLeft,
  passwordChangedAt: initialChanged,
  devices: initialDevices,
}: {
  owner: boolean;
  twoFactorEnabled: boolean;
  codesLeft?: number;
  passwordChangedAt?: string;
  devices: Device[];
}) {
  const router = useRouter();
  const t = useTranslations('account');
  const tfa = useTranslations('auth.2fa');
  const format = useFormatter();
  const clock = useClock();
  const phone = useIsPhone();

  const [enabled, setEnabled] = useState(twoFactorEnabled);
  const [left, setLeft] = useState(initialLeft);
  const [changedAt, setChangedAt] = useState(initialChanged);
  const [devices, setDevices] = useState(initialDevices);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<DoneToast | null>(null);

  // „Schimbă parola”
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwState, setPwState] = useState<ChangePasswordState>('idle');

  // „Activează” (membru)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // codul din aplicație: pasul 2 al activării și „Dezactivează”
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<MemberStepCodeState>('idle');
  const [lockedTime, setLockedTime] = useState<string>();

  // „Generează coduri noi” (D3)
  const [flow, setFlow] = useState<CodesFlowState | null>(null);
  const [flowCode, setFlowCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [flowLocked, setFlowLocked] = useState<string>();
  const [flowCopied, setFlowCopied] = useState(false);
  const [flowConfirmed, setFlowConfirmed] = useState(false);

  const twoStep: TwoStep = enabled ? (owner ? 'owner' : 'on') : 'off';
  const shownSetupCodes = (setup?.backupCodes ?? []).map(groupBackupCode);
  const shownNewCodes = newCodes.map(groupBackupCode);

  const when = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today ? format.relativeTime(d, { unit: 'day' }) : format.relativeTime(d);
  };

  function close() {
    setDialog(null);
    setCurrent('');
    setNext('');
    setPwState('idle');
    setStep(1);
    setSetup(null);
    setKeyCopied(false);
    setAppsOpen(false);
    setCodesCopied(false);
    setConfirmed(false);
    setCode('');
    setCodeState('idle');
  }

  async function refreshDevices() {
    setDevices(await listDevices());
  }

  async function changePassword() {
    if (!current) return setPwState('emptyCurrent');
    if (!passwordMeetsRules(next)) return setPwState('reqs');
    setPwState('loading');
    const res = await authApi.changePassword(current, next);
    if (res.ok) {
      close();
      setChangedAt(new Date().toISOString());
      setToast({
        title: t('security.password.done.title'),
        body: t('security.password.done.body'),
      });
      await refreshDevices();
      return;
    }
    if (res.kind === 'error' && res.code === 'INVALID_PASSWORD') return setPwState('wrong');
    if (res.kind === 'error' && res.status === 400) return setPwState('reqs');
    setPwState('idle');
  }

  async function activate() {
    setDialog('enable');
    const res = await startTwoFactor();
    if (res.ok) setSetup({ totpURI: res.totpURI, backupCodes: res.backupCodes });
    else close();
  }

  async function verifySetupCode() {
    setCodeState('loading');
    const res = await authApi.verifyTotp(code.replace(/\s/g, ''));
    if (res.ok) {
      setCode('');
      setCodeState('idle');
      setStep(3);
      return;
    }
    if (res.kind === 'rateLimited' && res.retryAt) {
      setLockedTime(clock(res.retryAt));
      return setCodeState('locked');
    }
    setCodeState('wrong');
  }

  function finishSetup() {
    const count = setup?.backupCodes.length;
    close();
    setEnabled(true);
    setLeft(count);
    setToast({ title: tfa('setup.s3.done') });
    router.refresh();
    void refreshDevices();
  }

  async function disable() {
    setCodeState('loading');
    const res = await disableTwoFactor(code.replace(/\s/g, ''));
    if (res.ok) {
      close();
      setEnabled(false);
      setLeft(undefined);
      setToast({ title: t('security.twoStep.disabled') });
      return;
    }
    if (res.reason === 'locked') {
      setLockedTime(clock(new Date(res.lockedUntil)));
      return setCodeState('locked');
    }
    setCodeState(res.reason === 'wrong' ? 'wrong' : 'idle');
  }

  function closeFlow() {
    setFlow(null);
    setFlowCode('');
    setNewCodes([]);
    setFlowCopied(false);
    setFlowConfirmed(false);
  }

  async function regenerate() {
    setFlow('loading');
    const res = await regenerateCodes(flowCode.replace(/\s/g, ''));
    if (res.ok) {
      setNewCodes(res.codes);
      setLeft(res.codes.length);
      setFlow('new');
    } else if (res.reason === 'locked') {
      setFlowLocked(clock(new Date(res.lockedUntil)));
      setFlow('locked');
    } else setFlow(res.reason === 'wrong' ? 'wrong' : 'confirm');
  }

  const copy = async (text: string, done: () => void) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    done();
  };

  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <Sheet>
        <SheetSection title={t('notifications.title')} description={t('notifications.lead')}>
          <SecurityEmailsRow />
        </SheetSection>
        <SheetSection title={t('security.title')}>
          <SecurityRows
            twoStep={twoStep}
            passwordChanged={changedAt ? when(changedAt) : undefined}
            codesLeft={left}
            devices={devices.map((d) => ({
              id: d.id,
              ...describeDevice(d.userAgent),
              meta: d.current ? undefined : format.relativeTime(new Date(d.lastActiveAt)),
              current: d.current,
            }))}
            onChangePassword={() => setDialog('password')}
            onActivate={activate}
            onDisable={() => setDialog('disable')}
            onGenerate={() => setFlow('confirm')}
            onSignOutDevice={async (id) => {
              if (await signOutDevice(id)) await refreshDevices();
            }}
            codesFlow={
              flow ? (
                <BackupCodesFlow
                  state={flow}
                  code={flowCode}
                  onCodeChange={(v) => {
                    setFlowCode(v);
                    if (flow === 'wrong') setFlow('confirm');
                  }}
                  lockedTime={flowLocked}
                  codes={shownNewCodes}
                  copied={flowCopied}
                  confirmed={flowConfirmed}
                  onConfirmedChange={setFlowConfirmed}
                  onCopy={() => copy(shownNewCodes.join('\n'), () => setFlowCopied(true))}
                  onDownload={() => downloadCodes(tfa('setup.s3.fileName'), shownNewCodes)}
                  onContinue={closeFlow}
                  onSubmit={regenerate}
                  onCancel={closeFlow}
                  mob={phone}
                />
              ) : undefined
            }
          />
        </SheetSection>
      </Sheet>

      {dialog && (
        <SecurityOverlay mob={phone} fixed>
          {dialog === 'password' && (
            <ChangePasswordDialog
              inline
              mob={phone}
              state={pwState}
              current={current}
              next={next}
              onCurrentChange={(v) => {
                setCurrent(v);
                if (pwState === 'wrong' || pwState === 'emptyCurrent') setPwState('idle');
              }}
              onNextChange={(v) => {
                setNext(v);
                if (pwState === 'reqs') setPwState('idle');
              }}
              forgotHref={FORGOT_HREF}
              onCancel={close}
              onSubmit={changePassword}
            />
          )}
          {dialog === 'enable' && (
            <MemberTwoFactorDialog
              inline
              mob={phone}
              step={step}
              totpUri={setup?.totpURI}
              keyCopied={keyCopied}
              onCopyKey={() =>
                copy(new URL(setup!.totpURI).searchParams.get('secret') ?? '', () =>
                  setKeyCopied(true),
                )
              }
              appsOpen={appsOpen}
              onAppsOpenChange={setAppsOpen}
              code={code}
              codeState={codeState}
              lockedTime={lockedTime}
              onCodeChange={(v) => {
                setCode(v);
                if (codeState === 'wrong') setCodeState('idle');
              }}
              codes={shownSetupCodes}
              codesCopied={codesCopied}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              onCopyCodes={() => copy(shownSetupCodes.join('\n'), () => setCodesCopied(true))}
              onDownload={() => downloadCodes(tfa('setup.s3.fileName'), shownSetupCodes)}
              onNext={() => setStep(2)}
              onBack={() => setStep(1)}
              onSubmit={verifySetupCode}
              onDone={finishSetup}
              onCancel={close}
            />
          )}
          {dialog === 'disable' && (
            <DisableTwoFactorDialog
              inline
              mob={phone}
              code={code}
              state={codeState}
              lockedTime={lockedTime}
              onCodeChange={(v) => {
                setCode(v);
                if (codeState === 'wrong') setCodeState('idle');
              }}
              onCancel={close}
              onSubmit={disable}
            />
          )}
        </SecurityOverlay>
      )}
      {toast && (
        <SecurityToast
          fixed
          mob={phone}
          title={toast.title}
          body={toast.body}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
