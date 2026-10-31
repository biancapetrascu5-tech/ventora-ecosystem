/* eslint-disable i18next/no-literal-string -- secțiunile din preview în afara loturilor (Profil, Preferințe, Dispozitive) */
'use client';

import { useState } from 'react';
import {
  Avatar,
  Button,
  FormField,
  Icon,
  Input,
  LOCALES,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  StatusDot,
  ThemeSwitcher,
  type ThemeChoice,
} from '@ventora/ui';
import { SecuritySection } from '@/screens/account/SecurityView';
import {
  NotificationPrefs,
  type NotificationPrefsValue,
} from '@/screens/account/NotificationPrefsView';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';
import { THEME_RO } from '../_shared/labels';
import a from './account-demo.module.css';

// S114b: datele primului cadru din preview (Concedii: e-mail oprit)
const PREFS: NotificationPrefsValue = {
  email: { bookings: true, phone: true, billing: true, limits: true, leave: false, support: true },
  recommendations: { inApp: true },
  news: { inApp: true, email: false },
};

// Securitate și Notificări = componentele reale (Lot 2.7 · B, Lot 4.4); restul paginii = datele
// primului cadru din preview.
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
        <NotificationPrefs mob={false} value={PREFS} />
        <SecuritySection
          owner
          twoFactorEnabled
          passwordChanged="28 oct., 09:15"
          codesLeft={8}
          onChangePassword={noop}
          onGenerate={noop}
        >
          <p className={`subheading ${a.devHead}`}>Dispozitive conectate</p>
          <div className={a.secrow}>
            <div className={a.r3}>
              <Icon icon="laptop" size={20} />
              <div>
                <p className="body">macOS · Chrome · Activ acum</p>
                <StatusDot tone="attention" label="Acest dispozitiv" />
              </div>
            </div>
          </div>
          <div className={a.secrow}>
            <div className={a.r3}>
              <Icon icon="smartphone" size={20} />
              <div>
                <p className="body">Windows · Chrome · Ieri, 21:40</p>
              </div>
            </div>
            <Button variant="quiet">Deconectează</Button>
          </div>
        </SecuritySection>
      </Sheet>
    </HubSettings>
  );
}
