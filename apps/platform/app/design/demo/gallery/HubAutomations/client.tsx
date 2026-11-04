/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (LIST) */
'use client';

import { AutomationsView, type HubAutomationItem } from '@/screens/automations/AutomationsView';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';
import d from '../HubAdminTeam/team-demo.module.css';

// Primul cadru din preview.html: proprietarul, cu consumul la 82% (1640 / 2000, exemplul
// designului). În aplicație UsageMeter-ul e fără plafon în v1 (decizia 04.11.2026): doar mesajele
// trimise luna aceasta. Vederea e cea din Hub (/admin/automations).
const LIST: [string, boolean, [string, number] | null, ('weeks' | 'discount')?][] = [
  ['thanks', true, ['azi, 13:02', 6]],
  ['winback', true, ['azi, 10:00', 12], 'weeks'],
  ['birthday', true, ['azi, 09:00', 1], 'discount'],
  ['risk', true, ['azi, 09:50', 1]],
  ['digest', false, null],
  ['quota', true, ['2 nov., 08:14', 1]],
];

const ITEMS: HubAutomationItem[] = LIST.map(([code, on, last, setting]) => ({
  id: code,
  code,
  name: code,
  booking: code !== 'quota',
  on,
  last: last ? { when: last[0], n: last[1] } : null,
  ...(setting === 'weeks'
    ? { setting: { kind: 'weeks' as const, value: 6, onChange: noop } }
    : setting === 'discount'
      ? { setting: { kind: 'discount' as const, value: 10, onChange: noop } }
      : {}),
}));

export function HubAutomationsFrame() {
  return (
    <div className={d.frame}>
      <HubSettings active="automatizari" title="Automatizări">
        <AutomationsView
          phone={false}
          items={ITEMS}
          usage={{ month: 'noiembrie', sent: 1640, limit: 2000, onUpgrade: noop }}
          onAsk={noop}
          onAskOn={noop}
        />
      </HubSettings>
    </div>
  );
}
