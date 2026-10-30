/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (MEMBERS, INVITES) */
'use client';

import { useTranslations } from 'next-intl';
import { TeamView, type TeamInviteRow, type TeamMemberRow } from '@/screens/admin/TeamView';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';
import d from './team-demo.module.css';

// Primul cadru: echipa Salon Aurora (4 din 10 angajați), o invitație în așteptare și una expirată.
// Locurile, „Invită o persoană” și meniul membrului sunt din design; în aplicație apar odată cu
// contractele lor (F3 pentru locuri).
const MEMBERS: TeamMemberRow[] = [
  {
    id: '1',
    name: 'Bianca Petrașcu',
    email: 'bianca@salonaurora.ro',
    role: 'Proprietar',
    owner: true,
    apps: ['booking', 'crm', 'hr', 'finance', 'projects', 'shifts', 'documents'],
    stopped: false,
  },
  {
    id: '2',
    name: 'Ioana Pavel',
    email: 'ioana@salonaurora.ro',
    role: 'Recepție',
    owner: false,
    apps: ['booking', 'crm', 'shifts'],
    stopped: false,
  },
  {
    id: '3',
    name: 'Mara Enache',
    email: 'mara@salonaurora.ro',
    role: 'Angajat',
    owner: false,
    apps: ['booking', 'shifts'],
    stopped: false,
  },
  {
    id: '4',
    name: 'Radu Matei',
    email: 'radu@salonaurora.ro',
    role: 'Manager',
    owner: false,
    apps: ['booking', 'crm', 'hr', 'finance', 'shifts'],
    stopped: true,
  },
];

const INVITES: TeamInviteRow[] = [
  {
    id: '1',
    email: 'andreea.v@gmail.com',
    role: 'Angajat',
    sent: '22 oct.',
    until: '29 oct.',
    expired: false,
    newLinkRequested: false,
  },
  {
    id: '2',
    email: 'cosmin@salonaurora.ro',
    role: 'Recepție',
    sent: '12 oct.',
    until: '19 oct.',
    expired: true,
    newLinkRequested: false,
  },
];

export function HubAdminTeamFrame() {
  const t = useTranslations('hub.team');
  return (
    <div className={d.frame}>
      <HubSettings active="echipa" title={t('title')}>
        <TeamView
          business="Salon Aurora"
          members={MEMBERS}
          invites={INVITES}
          seats={<span className="body-small muted v-num">4 din 10 angajați</span>}
          onInvite={noop}
          memberActions={(r) =>
            r.owner
              ? [{ label: 'Editează profilul', icon: 'pencil' }]
              : [
                  { label: 'Schimbă rolul', icon: 'key-round' },
                  { label: 'Acces la aplicații', icon: 'layout-grid' },
                  { label: r.stopped ? 'Redă accesul' : 'Oprește accesul', icon: 'lock' },
                  { separator: true },
                  { label: 'Elimină din afacere', icon: 'trash-2', destructive: true },
                ]
          }
          onResend={noop}
          onCopyLink={noop}
          onCancel={noop}
        />
      </HubSettings>
    </div>
  );
}
