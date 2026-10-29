/* eslint-disable i18next/no-literal-string -- secțiunile din preview în afara lotului (Profil, Preferințe, Notificări, Recomandări, Dispozitive) */
'use client';

import { useState } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  FormField,
  Icon,
  Input,
  LOCALES,
  Notice,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  StatusDot,
  ThemeSwitcher,
  Toggle,
  type ThemeChoice,
} from '@ventora/ui';
import { SecuritySection } from '@/screens/account/SecurityView';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';
import { THEME_RO } from '../_shared/labels';
import a from './account-demo.module.css';

const NOTIF: [string, number[]][] = [
  ['Programări noi și modificări', [1, 1, 0]],
  ['Facturi scadente și restanțe', [1, 1, 1]],
  ['Cereri de concediu', [1, 0, 0]],
  ['Noutăți de la Ventora', [0, 1, 0]],
];
const CH = ['În aplicație', 'E-mail', 'SMS'];

// Securitate = componenta reală (lotul B); restul paginii = datele primului cadru din preview.
export function HubAccountFrame() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  return (
    <HubSettings active="profil" title="Contul tău">
      <PageHeader
        title="Contul tău"
        description="Datele tale, cum arată Ventora pentru tine și cum îți protejezi contul."
      />
      <Sheet>
        <SheetSection
          title="Profil"
          description="Așa te văd colegii și clienții în notificări."
          actions={<Button variant="primary">Salvează profilul</Button>}
        >
          <div className={a.r}>
            <Avatar name="Bianca Petrașcu" size="xl" />
            <Button icon="upload">Schimbă fotografia</Button>
          </div>
          <div className={a.g2f}>
            <FormField label="Nume complet" isRequired requiredLabel="obligatoriu">
              <Input defaultValue="Bianca Petrașcu" />
            </FormField>
            <FormField label="Telefon" isOptional optionalLabel="opțional">
              <Input
                defaultValue="0740 123 456"
                prefix={<Icon icon="message-square" size={16} />}
              />
            </FormField>
            <FormField label="E-mail" hint="Dacă îl schimbi, îți trimitem un link de confirmare.">
              <Input defaultValue="bianca@salonaurora.ro" icon="mail" />
            </FormField>
          </div>
        </SheetSection>
        <SheetSection
          title="Preferințe"
          description="Se aplică doar contului tău, pe toate dispozitivele."
        >
          <div className={a.g2f}>
            <FormField label="Temă">
              <div>
                <ThemeSwitcher value={theme} onChange={setTheme} labels={THEME_RO} />
              </div>
            </FormField>
            <FormField label="Limbă">
              <Select
                defaultValue="ro"
                options={LOCALES.map((l) => ({ value: l.code, label: l.name }))}
              />
            </FormField>
          </div>
        </SheetSection>
        <SheetSection title="Notificări" description="Alege pe unde vrei să afli de fiecare.">
          <div className={a.ntable}>
            <div className={`${a.nrow} ${a.nhead} caption`}>
              <span /> <span>În aplicație</span>
              <span>E-mail</span>
              <span>SMS</span>
            </div>
            {NOTIF.map(([l, v]) => (
              <div key={l} className={a.nrow}>
                <span className="body">{l}</span>
                {v.map((on, i) => (
                  <span key={i}>
                    <Checkbox defaultSelected={!!on} aria-label={`${l} — ${CH[i]}`} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </SheetSection>
        <SheetSection
          title="Recomandări Ventora"
          description="Sugestii despre aplicații și pachete în plus care se potrivesc cu ce faci deja."
        >
          <div className={a.d0}>
            <Toggle
              defaultSelected
              description="Le vezi în pagini și în notificări, la secțiunea Recomandări."
              labelPosition="end"
            >
              În aplicație
            </Toggle>
            <Toggle isDisabled description="Disponibil în curând" labelPosition="end">
              Pe e-mail
            </Toggle>
            <Notice tone="neutral" icon="info">
              Mesajele despre limitele contului tău rămân active, pentru că sunt informații despre
              cont, nu recomandări.
            </Notice>
          </div>
        </SheetSection>
        <SecuritySection
          owner
          twoFactorEnabled
          passwordChanged="acum 3 luni"
          codesLeft={8}
          onChangePassword={noop}
          onGenerate={noop}
        >
          <p className={`subheading ${a.devHead}`}>Dispozitive conectate</p>
          <div className={a.secrow}>
            <div className={a.r3}>
              <Icon icon="laptop" size={20} />
              <div>
                <p className="body">MacBook · Chrome · Sibiu</p>
                <StatusDot tone="attention" label="Activ acum · acest dispozitiv" />
              </div>
            </div>
          </div>
          <div className={a.secrow}>
            <div className={a.r3}>
              <Icon icon="smartphone" size={20} />
              <div>
                <p className="body">iPhone · Safari · Sibiu</p>
                <p className="body-small muted">Ieri, 21:40</p>
              </div>
            </div>
            <Button variant="quiet">Deconectează</Button>
          </div>
        </SecuritySection>
      </Sheet>
    </HubSettings>
  );
}
