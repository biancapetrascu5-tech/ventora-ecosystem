'use client';

import { useState } from 'react';
import type { AppName } from '@ventora/ui';
import { TeamInviteDialog, type InviteRole } from '@/screens/admin/TeamInviteDialog';
import { HubAdminTeamFrame } from '../HubAdminTeam/client';
import { noop } from '../_shared/shell';
import d from './invite-demo.module.css';

// Primul cadru: pagina Echipă (ca HubAdminTeam) cu „Invită o persoană” deschis — un membru cu
// două aplicații (starea `fill` din preview.html). Aplicațiile afacerii: BIZ_APPS din preview.
const BIZ_APPS: AppName[] = ['booking', 'crm', 'hr', 'finance', 'projects', 'shifts', 'documents'];

export function HubTeamInviteFrame() {
  const [email, setEmail] = useState('andrei.popa@gmail.com');
  const [role, setRole] = useState<InviteRole>('member');
  const [selected, setSelected] = useState<AppName[]>(['booking', 'shifts']);
  return (
    <div className={d.frame}>
      <HubAdminTeamFrame />
      <div className={d.overlay}>
        <TeamInviteDialog
          inline
          business="Salon Aurora"
          apps={BIZ_APPS}
          email={email}
          onEmailChange={setEmail}
          role={role}
          onRoleChange={setRole}
          selected={selected}
          onSelectedChange={setSelected}
          onCancel={noop}
          onSubmit={noop}
        />
      </div>
    </div>
  );
}
