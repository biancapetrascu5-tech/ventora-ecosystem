/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (GOfferEd, FX_LANGS) */
'use client';

import { APPS, type AppName } from '@ventora/ui';
import { GrowthOfferEditorView, type GrowthOfferTextRow } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import c from '../_shared/founderCommercial.module.css';
import { noop } from '../_shared/shell';

// GOfferEd din preview.html (GrowthOfferEditor, S136): „DataView, 14 zile gratuit”, în revizuire,
// textele FX_LANGS (RO, EN, DE aprobate; FR, ES în revizuire; IT lipsește).
const COST =
  'Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui. Fără cost de implementare.';
const TEXTS: GrowthOfferTextRow[] = [
  {
    code: 'RO',
    locale: 'ro',
    state: 'approved',
    text: 'Vezi ce aduce fiecare serviciu · DataView îți arată venitul pe servicii și pe angajați, din programările pe care le ai deja.',
  },
  {
    code: 'EN',
    locale: 'en',
    state: 'approved',
    text: 'See what each service brings in · DataView shows revenue by service and by team member, from the appointments you already have.',
  },
  {
    code: 'FR',
    locale: 'fr',
    state: 'draft',
    text: 'Voyez ce que rapporte chaque prestation · DataView vous montre le chiffre d’affaires par prestation et par collaborateur.',
  },
  {
    code: 'ES',
    locale: 'es',
    state: 'draft',
    text: 'Mira lo que aporta cada servicio · DataView te muestra los ingresos por servicio y por persona del equipo.',
  },
  {
    code: 'DE',
    locale: 'de',
    state: 'approved',
    text: 'Sehen Sie, was jede Leistung einbringt · DataView zeigt den Umsatz nach Leistung und Mitarbeitenden.',
  },
  { code: 'IT', locale: 'it', state: 'missing', text: null },
];
const PREVIEW = {
  app: 'analytics' as AppName,
  title: 'Vezi ce aduce fiecare serviciu',
  benefit:
    'DataView îți arată venitul pe servicii și pe angajați, din programările pe care le ai deja.',
  cost: COST,
  actionLabel: 'Încearcă gratuit 14 zile',
};

export function GrowthOfferEditorFrame({ phone }: { phone?: boolean }) {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="oferte" title="DataView, 14 zile gratuit">
          <GrowthOfferEditorView
            mode={phone ? 'mobile' : 'desktop'}
            name="DataView, 14 zile gratuit"
            stateLabel="În revizuire · 3 din 6 limbi aprobate"
            type="trial"
            objects={(Object.keys(APPS) as AppName[]).map((a) => ({
              value: a,
              label: APPS[a]!.name,
            }))}
            object="analytics"
            cost={COST}
            texts={TEXTS}
            previews={['ro', 'en', 'de'].map((locale) => ({ locale, ...PREVIEW }))}
            onType={noop}
            onObject={noop}
            onEditText={noop}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}
