'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  Checkbox,
  Dialog,
  FormField,
  Input,
  Radio,
  RadioGroup,
  type AppName,
} from '@ventora/ui';
import s from './team.module.css';

/* HubTeamInvite (S112): „Invită o persoană” — adresa, rolul Membru / Admin, aplicațiile. Un admin
   are toate aplicațiile (bifate și blocate). Erorile stau sub câmpul lor; „invitația e deja
   trimisă” oferă „Retrimite invitația”. Pe telefon, foaie de jos. Vedere fără logică: TeamScreen
   îi dă starea, galeria /design o arată deschisă (inline). */

export type InviteRole = 'member' | 'admin';

export type InviteError =
  | { kind: 'email' }
  | { kind: 'member' }
  | { kind: 'invited'; date: string }
  | { kind: 'apps' }
  | { kind: 'failed' };

export function TeamInviteDialog({
  business,
  apps,
  email,
  onEmailChange,
  role,
  onRoleChange,
  selected,
  onSelectedChange,
  error,
  sending,
  canInviteAdmin = true,
  inline,
  mob,
  onCancel,
  onSubmit,
  onResend,
}: {
  business: string;
  apps: AppName[];
  email: string;
  onEmailChange: (v: string) => void;
  role: InviteRole;
  onRoleChange: (v: InviteRole) => void;
  selected: AppName[];
  onSelectedChange: (v: AppName[]) => void;
  error?: InviteError | null;
  sending?: boolean;
  /** B4: un admin nu poate invita un admin. */
  canInviteAdmin?: boolean;
  inline?: boolean;
  mob?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  onResend?: () => void;
}) {
  const t = useTranslations('hub.team');
  const ui = useTranslations('ui');
  const admin = role === 'admin';
  const emailError =
    error?.kind === 'email'
      ? t('form.errorEmail')
      : error?.kind === 'member'
        ? t('form.errorMember', { email })
        : error?.kind === 'invited'
          ? t('form.errorInvited', { email, date: error.date })
          : undefined;
  const toggle = (app: AppName, on: boolean) =>
    onSelectedChange(on ? [...selected, app] : selected.filter((a) => a !== app));

  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('form.title', { business })}
      description={t('form.lead')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={sending} onPress={onCancel}>
            {t('form.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="send"
            isPending={sending}
            aria-label={sending ? t('form.sending') : undefined}
            onPress={onSubmit}
          >
            {sending ? t('form.sending') : t('form.submit')}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <div>
          <FormField label={t('form.email')} isRequired error={emailError}>
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t('form.emailPlaceholder')}
              isInvalid={!!emailError}
              disabled={sending}
              autoComplete="off"
            />
          </FormField>
          {error?.kind === 'invited' && onResend && (
            <div className={s.errAct}>
              <Button size="sm" icon="send" onPress={onResend}>
                {t('resendInvitation')}
              </Button>
            </div>
          )}
        </div>
        <RadioGroup
          label={t('form.role')}
          value={role}
          onChange={(v) => onRoleChange(v as InviteRole)}
          isDisabled={sending}
        >
          <Radio value="member" description={t('form.roleMemberDesc')}>
            {t('form.roleMember')}
          </Radio>
          <Radio value="admin" description={t('form.roleAdminDesc')} isDisabled={!canInviteAdmin}>
            {t('form.roleAdmin')}
          </Radio>
        </RadioGroup>
        <FormField
          label={t('form.apps')}
          hint={
            error?.kind === 'apps' ? undefined : admin ? t('form.appsAdmin') : t('form.appsHelp')
          }
          error={error?.kind === 'apps' ? t('form.errorApps') : undefined}
        >
          <div className={mob ? `${s.appGrid} ${s.appGridMob}` : s.appGrid} role="group">
            {apps.map((a) => (
              <Checkbox
                key={a}
                isInvalid={error?.kind === 'apps'}
                isSelected={admin || selected.includes(a)}
                isDisabled={admin || sending}
                onChange={(on) => toggle(a, on)}
              >
                <span className={s.app}>
                  <AppIcon app={a} size={20} />
                  {APPS[a]?.name}
                </span>
              </Checkbox>
            ))}
          </div>
        </FormField>
        {error?.kind === 'failed' && <p className={`body-small ${s.error}`}>{t('actionError')}</p>}
      </div>
    </Dialog>
  );
}
