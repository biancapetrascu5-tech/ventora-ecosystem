'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  APP_IDS,
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  FormField,
  Radio,
  RadioGroup,
  Toast,
  AppIcon,
  APPS,
  type AppName,
  type DataTableAction,
} from '@ventora/ui';
import { useDates, useIsPhone } from '@ventora/screens';
import {
  cancelInvite,
  changeMemberRole,
  readTeam,
  removeMember,
  resendInvite,
  sendTeamInvite,
  setMemberAccess,
  setMemberApps,
  type TeamData,
} from '@/server/team-actions';
import { TeamView, type TeamInviteRow, type TeamMemberRow } from './TeamView';
import { TeamInviteDialog, type InviteError, type InviteRole } from './TeamInviteDialog';
import s from './team.module.css';

/* HubAdminTeam (Lot 2.8) cu „Invită o persoană” (HubTeamInvite, S112) și meniul unui membru
   (Lot 2.9b): schimbă rolul, accesul la aplicații, oprește / redă accesul, elimină din afacere.
   Pe server: doar owner și admin, owner-ul neatins, un admin nu face admini; aici rândul
   owner-ului și rândul propriu n-au meniu. Dialogurile din meniu nu au design propriu: sunt
   compuse din textele aprobate ale paginii și ale formularului (raportul 2.9b). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

type MemberDialog =
  | { kind: 'role'; member: TeamData['members'][number] }
  | { kind: 'apps'; member: TeamData['members'][number] }
  | { kind: 'remove'; member: TeamData['members'][number] };

export function TeamScreen({ initial }: { initial: TeamData }) {
  const t = useTranslations('hub.team');
  const roles = useTranslations('roles');
  const ui = useTranslations('ui');
  const dates = useDates();
  const phone = useIsPhone();
  const [data, setData] = useState(initial);

  // HubTeamInvite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  const [selected, setSelected] = useState<AppName[]>([]);
  const [error, setError] = useState<InviteError | null>(null);
  const [invitedId, setInvitedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; date: string } | null>(null);

  // the member menu
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const [dialogRole, setDialogRole] = useState<InviteRole>('member');
  const [dialogApps, setDialogApps] = useState<AppName[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const apps = data.apps.filter(isApp);
  const roleName = (r: string) => (roles.has(r) ? roles(r) : r);
  const members: TeamMemberRow[] = data.members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: roleName(m.role),
    apps: m.applicationIds ? m.applicationIds.filter(isApp) : null,
    stopped: m.status === 'suspended',
    owner: m.role === 'owner',
  }));
  const invites: TeamInviteRow[] = data.invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: roleName(i.role),
    sent: dates.day(new Date(i.createdAt)),
    until: dates.day(new Date(i.expiresAt)),
    expired: i.status === 'expired',
    newLinkRequested: !!i.newLinkRequestedAt,
  }));

  async function reload() {
    const next = await readTeam();
    if (next) setData(next);
  }

  function openInvite() {
    setEmail('');
    setRole('member');
    setSelected([]);
    setError(null);
    setInvitedId(null);
    setInviteOpen(true);
  }

  async function submitInvite() {
    setSending(true);
    setError(null);
    const r = await sendTeamInvite({
      email,
      role,
      applicationIds: role === 'admin' ? [] : selected,
    });
    setSending(false);
    if (r.ok) {
      setInviteOpen(false);
      setSent({ email: r.email, date: dates.day(new Date(r.expiresAt)) });
      await reload();
      return;
    }
    if (r.error === 'invited') {
      setInvitedId(r.invitationId);
      setError({ kind: 'invited', date: dates.day(new Date(r.sentAt)) });
    } else {
      setError({ kind: r.error });
    }
  }

  async function resendExisting() {
    if (!invitedId) return;
    if (await resendInvite(invitedId)) {
      setInviteOpen(false);
      await reload();
    } else {
      setError({ kind: 'failed' });
    }
  }

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setDialog(null);
    await reload();
  }

  const memberActions = (row: TeamMemberRow): DataTableAction[] => {
    const m = data.members.find((x) => x.id === row.id);
    // the owner is never touched here; nobody acts on their own row
    if (!m || row.owner || m.id === data.viewer.id) return [];
    const open = (kind: MemberDialog['kind']) => {
      setFailed(false);
      setDialogRole(m.role === 'admin' ? 'admin' : 'member');
      setDialogApps((m.applicationIds ?? []).filter(isApp));
      setDialog({ kind, member: m });
    };
    return [
      { label: t('action.changeRole'), icon: 'key-round', onClick: () => open('role') },
      ...(m.applicationIds
        ? [
            {
              label: t('action.appAccess'),
              icon: 'layout-grid' as const,
              onClick: () => open('apps'),
            },
          ]
        : []),
      {
        label: row.stopped ? t('action.restore') : t('action.stop'),
        icon: 'lock',
        onClick: () => void run(() => setMemberAccess(m.id, row.stopped ? 'active' : 'stopped')),
      },
      { separator: true },
      {
        label: t('action.remove'),
        icon: 'trash-2',
        destructive: true,
        onClick: () => open('remove'),
      },
    ];
  };

  const who = dialog ? `${dialog.member.name} · ${dialog.member.email}` : '';
  const canMakeAdmin = data.viewer.role === 'owner';

  return (
    <>
      <TeamView
        business={data.business}
        members={members}
        invites={invites}
        onInvite={openInvite}
        memberActions={memberActions}
        onResend={async (r) => {
          await resendInvite(r.id);
          await reload();
        }}
        onCancel={async (r) => {
          await cancelInvite(r.id);
          await reload();
        }}
      />

      <DialogTrigger isOpen={inviteOpen} onOpenChange={setInviteOpen}>
        <TeamInviteDialog
          business={data.business}
          apps={apps}
          email={email}
          onEmailChange={setEmail}
          role={role}
          onRoleChange={setRole}
          selected={selected}
          onSelectedChange={setSelected}
          error={error}
          sending={sending}
          canInviteAdmin={canMakeAdmin}
          mob={phone}
          onCancel={() => setInviteOpen(false)}
          onSubmit={() => void submitInvite()}
          onResend={() => void resendExisting()}
        />
      </DialogTrigger>

      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'role' ? (
          <Dialog
            sheet={phone}
            title={t('action.changeRole')}
            description={who}
            closeLabel={ui('close')}
            footer={
              <>
                <Button variant="quiet" isDisabled={busy} onPress={() => setDialog(null)}>
                  {t('form.cancel')}
                </Button>
                <Button
                  variant="primary"
                  isPending={busy}
                  onPress={() => void run(() => changeMemberRole(dialog.member.id, dialogRole))}
                >
                  {t('save')}
                </Button>
              </>
            }
          >
            <RadioGroup
              label={t('form.role')}
              value={dialogRole}
              onChange={(v) => setDialogRole(v as InviteRole)}
            >
              <Radio value="member" description={t('form.roleMemberDesc')}>
                {t('form.roleMember')}
              </Radio>
              <Radio
                value="admin"
                description={t('form.roleAdminDesc')}
                isDisabled={!canMakeAdmin && dialog.member.role !== 'admin'}
              >
                {t('form.roleAdmin')}
              </Radio>
            </RadioGroup>
            {failed && <p className={`body-small ${s.error}`}>{t('actionError')}</p>}
          </Dialog>
        ) : dialog?.kind === 'apps' ? (
          <Dialog
            sheet={phone}
            title={t('action.appAccess')}
            description={who}
            closeLabel={ui('close')}
            footer={
              <>
                <Button variant="quiet" isDisabled={busy} onPress={() => setDialog(null)}>
                  {t('form.cancel')}
                </Button>
                <Button
                  variant="primary"
                  isPending={busy}
                  isDisabled={dialogApps.length === 0}
                  onPress={() => void run(() => setMemberApps(dialog.member.id, dialogApps))}
                >
                  {t('save')}
                </Button>
              </>
            }
          >
            <FormField
              label={t('form.apps')}
              error={dialogApps.length === 0 ? t('form.errorApps') : undefined}
            >
              <div className={phone ? `${s.appGrid} ${s.appGridMob}` : s.appGrid} role="group">
                {apps.map((a) => (
                  <Checkbox
                    key={a}
                    isSelected={dialogApps.includes(a)}
                    onChange={(on) =>
                      setDialogApps(on ? [...dialogApps, a] : dialogApps.filter((x) => x !== a))
                    }
                  >
                    <span className={s.app}>
                      <AppIcon app={a} size={20} />
                      {APPS[a]?.name}
                    </span>
                  </Checkbox>
                ))}
              </div>
            </FormField>
            {failed && <p className={`body-small ${s.error}`}>{t('actionError')}</p>}
          </Dialog>
        ) : dialog?.kind === 'remove' ? (
          <Dialog
            sheet={phone}
            tone="danger"
            title={t('action.remove')}
            description={who}
            closeLabel={ui('close')}
            footer={
              <>
                <Button variant="quiet" isDisabled={busy} onPress={() => setDialog(null)}>
                  {t('form.cancel')}
                </Button>
                <Button
                  variant="danger"
                  isPending={busy}
                  onPress={() => void run(() => removeMember(dialog.member.id))}
                >
                  {t('action.remove')}
                </Button>
              </>
            }
          >
            {failed && <p className={`body-small ${s.error}`}>{t('actionError')}</p>}
          </Dialog>
        ) : (
          <></>
        )}
      </DialogTrigger>

      {failed && !dialog && (
        <div className={s.toast}>
          <Toast
            tone="danger"
            title={t('actionError')}
            onDismiss={() => setFailed(false)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
      {sent && (
        <div className={s.toast}>
          <Toast
            tone="done"
            title={t('form.sentTitle', { email: sent.email })}
            description={t('form.sentBody', { date: sent.date })}
            onDismiss={() => setSent(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </>
  );
}
