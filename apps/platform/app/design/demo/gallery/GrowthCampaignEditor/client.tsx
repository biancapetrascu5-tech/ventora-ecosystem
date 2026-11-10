/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (GCampEd, FX_CRITERIA, FX_RULES) */
'use client';

import { useState } from 'react';
import { APPS, type AppName, type RuleCriterion } from '@ventora/ui';
import { GrowthCampaignEditorView, type GrowthCampaignForm } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// GCampEd din preview.html (GrowthCampaignEditor, S136): „EasyBook fără ClientDesk”, activă,
// automat la semnalul „Integrare lipsă”, Launcher + EasyBook · Azi, regulile FX_RULES, estimarea 46.
const CRITERIA: RuleCriterion[] = [
  {
    value: 'apps_on',
    label: 'Aplicații active',
    operators: ['include', 'nu include'],
    values: (Object.keys(APPS) as AppName[]).map((a) => ({ value: a, label: APPS[a]!.name })),
  },
  {
    value: 'plan',
    label: 'Abonament',
    operators: ['este', 'nu este'],
    values: ['Start', 'Business', 'Business Plus'],
  },
  { value: 'usage', label: 'Consum', operators: ['peste', 'sub'], unit: '%' },
  { value: 'age', label: 'Vechimea afacerii', operators: ['peste', 'sub'], unit: 'zile' },
  {
    value: 'onboarding',
    label: 'Stadiul de onboarding',
    operators: ['este'],
    values: ['Început', 'Prima săptămână', 'Activ', 'Matur'],
  },
  { value: 'role', label: 'Rol', operators: ['este'], values: ['Proprietar', 'Admin', 'Membru'] },
  {
    value: 'lang',
    label: 'Limbă',
    operators: ['este', 'nu este'],
    values: ['Română', 'English', 'Français', 'Español', 'Deutsch', 'Italiano'],
  },
  {
    value: 'country',
    label: 'Țară',
    operators: ['este', 'nu este'],
    values: ['România', 'Moldova', 'Italia', 'Germania'],
  },
  { value: 'users', label: 'Număr de utilizatori', operators: ['peste', 'sub'], unit: 'persoane' },
];
const PREVIEW = {
  app: 'crm' as AppName,
  title: 'Ține istoricul clienților în ClientDesk',
  benefit: 'Clienții tăi din programări pot avea istoric, note și follow-up în ClientDesk.',
  cost: '69 lei pe lună · fără cost de implementare',
  actionLabel: 'Vezi opțiunile',
};

export function GrowthCampaignEditorFrame({ phone }: { phone?: boolean }) {
  const [form, setForm] = useState<GrowthCampaignForm>({
    name: 'EasyBook fără ClientDesk',
    mode: 'signal',
    signal: 'missing',
    period: null,
    offerId: 'crm',
    slots: ['azi', 'launcher'],
    match: 'all',
    rules: [
      { id: 'a', criterion: 'apps_on', operator: 'include', value: 'booking' },
      { id: 'b', criterion: 'apps_on', operator: 'nu include', value: 'crm' },
      { id: 'c', criterion: 'role', operator: 'este', value: 'Proprietar' },
      { id: 'd', criterion: 'age', operator: 'peste', value: '30' },
    ],
    priority: '1',
  });
  return (
    // preview: .frame-rel — bara „Salvează / Publică” stă jos în cadru (fixed față de cadru)
    <div className={c.ssFrame} style={{ transform: 'translateZ(0)' }}>
      <div className={c.ssBody}>
        <FounderShellDemo active="campanii" title="EasyBook fără ClientDesk">
          <GrowthCampaignEditorView
            mode={phone ? 'mobile' : 'desktop'}
            title="EasyBook fără ClientDesk"
            stateLabel="Activă"
            stateTone="done"
            form={form}
            onChange={setForm}
            signals={[
              { value: 'missing', label: 'Integrare lipsă: are EasyBook, nu are ClientDesk' },
              { value: 'usage', label: 'Consum peste un prag' },
              { value: 'onboard', label: 'Stadiu de onboarding' },
            ]}
            offers={[
              { value: 'crm', label: 'ClientDesk pentru clienții din EasyBook' },
              { value: 'sms', label: '500 SMS în plus' },
            ]}
            slots={[
              { value: 'azi', label: 'EasyBook · Azi, sub „Au nevoie de tine”' },
              { value: 'launcher', label: 'Launcher · Alte aplicații Ventora Systems' },
              { value: 'notif', label: 'Notificări · Recomandări' },
              { value: 'plan', label: 'Abonament și consum' },
            ]}
            criteria={CRITERIA}
            estimate={46}
            overlap={{
              title: 'Launcher e folosit și de „Analytics de Black Friday”',
              body: 'Între 20 și 30 noiembrie, pentru afacerile din ambele audiențe câștigă campania aceasta (prioritatea 1).',
            }}
            capsNote="Cel mult o recomandare pe zi și 3 pe săptămână pentru fiecare om; după „Nu mă interesează”, 30 de zile pauză. Peste 5% deranj, campania se oprește singură și primești o notificare. Le schimbi din Control."
            previews={['ro', 'en', 'it'].map((locale) => ({ locale, ...PREVIEW }))}
            previewSlots={[
              { value: 'azi', label: 'EasyBook · Azi' },
              { value: 'l', label: 'Launcher' },
            ]}
            roApproved
            onSaveDraft={noop}
            onPublish={noop}
            today={new Date(2026, 9, 24)}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}
