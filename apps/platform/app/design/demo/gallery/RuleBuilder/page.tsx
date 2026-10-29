/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { APPS, RuleBuilder, type RuleCriterion, type RuleRow } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import { RULES_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Extra({ stack: true }) → Frames → ThemeFrame light / dark → States()
const CRITERIA: RuleCriterion[] = [
  {
    value: 'apps_on',
    label: 'Aplicații active',
    operators: ['include', 'nu include'],
    values: Object.keys(APPS).map((a) => ({ value: a, label: APPS[a]!.name })),
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
const RULES: RuleRow[] = [
  { id: 'a', criterion: 'apps_on', operator: 'include', value: 'booking' },
  { id: 'b', criterion: 'apps_on', operator: 'nu include', value: 'crm' },
  { id: 'c', criterion: 'role', operator: 'este', value: 'Proprietar' },
  { id: 'd', criterion: 'age', operator: 'peste', value: '30' },
];
const Cap = ({ children }: { children: React.ReactNode }) => (
  <p className={`caption ${f.muted}`}>{children}</p>
);

function States() {
  return (
    <div className={f.d0}>
      <Cap>Toate condițiile · patru reguli · estimare (număr, niciodată o listă de afaceri)</Cap>
      <RuleBuilder criteria={CRITERIA} rules={RULES} estimate={46} labels={RULES_RO} />
      <Cap>Oricare dintre condiții · țară și limbă</Cap>
      <RuleBuilder
        criteria={CRITERIA}
        match="any"
        rules={[
          { id: 'x', criterion: 'country', operator: 'este', value: 'România' },
          { id: 'y', criterion: 'lang', operator: 'este', value: 'Română' },
        ]}
        estimate={312}
        labels={RULES_RO}
      />
      <Cap>Fără condiții încă: doar „Adaugă condiție”</Cap>
      <RuleBuilder criteria={CRITERIA} rules={[]} labels={RULES_RO} />
    </div>
  );
}

export default function RuleBuilderGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack render={() => <States />} />;
}
