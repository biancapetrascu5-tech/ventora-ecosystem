/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (dispozitivele, parolele) */
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, Sheet, SheetSection } from '@ventora/ui';
import {
  ChangePasswordDialog,
  SecurityOverlay,
  SecurityRows,
} from '@/screens/account/SecurityPageView';
import s from '@/screens/account/account.module.css';
import { HubSettings } from '../_shared/hubSettings';
import { noop } from '../_shared/shell';

// Primul cadru: pagina Securitate a proprietarului, cu „Schimbă parola” deschis, starea
// „Se completează” (parola actuală scrisă, parola nouă fără cifră și literă mare).
export function HubAccountSecurityFrame() {
  const t = useTranslations('account');
  const [current, setCurrent] = useState('Ventora2026');
  const [next, setNext] = useState('aurora2026');
  return (
    <div className={s.frame}>
      <HubSettings active="securitate" title={t('title')}>
        <PageHeader title={t('security.title')} breadcrumbs={[{ label: t('title') }]} />
        <div className={s.asBody}>
          <Sheet>
            <SheetSection>
              <SecurityRows
                twoStep="owner"
                passwordChanged="28 oct., 09:15"
                codesLeft={8}
                devices={[
                  {
                    id: 'a',
                    icon: 'laptop',
                    name: 'macOS · Chrome',
                    when: t('security.when.now'),
                    current: true,
                  },
                  {
                    id: 'b',
                    icon: 'monitor',
                    name: 'Windows · Chrome',
                    when: 'Ieri, 21:40',
                    current: false,
                  },
                  {
                    id: 'c',
                    icon: 'smartphone',
                    name: 'iOS · Safari',
                    when: '28 oct., 09:15',
                    current: false,
                  },
                ]}
                onChangePassword={noop}
                onGenerate={noop}
                onSignOutDevice={noop}
              />
            </SheetSection>
          </Sheet>
        </div>
      </HubSettings>
      <SecurityOverlay>
        <ChangePasswordDialog
          inline
          current={current}
          next={next}
          onCurrentChange={setCurrent}
          onNextChange={setNext}
          forgotHref="#"
          onCancel={noop}
          onSubmit={noop}
        />
      </SecurityOverlay>
    </div>
  );
}
