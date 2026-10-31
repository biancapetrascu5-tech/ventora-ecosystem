'use client';

import { useTranslations } from 'next-intl';
import { Button, FormField, Input, Notice, PageHeader, Sheet, SheetSection } from '@ventora/ui';
import { useIsPhone } from '../screens/hooks';
import styles from './business.module.css';

/* FounderNewBusiness (Lot 2.8, doar română, S57), fără partea comercială: afacerea și adresa
   proprietarului, apoi invitația (E-4, 30 de zile). Abonamentul, perioada de probă și aplicațiile
   incluse vin din Lotul 3.4. CUI, orașul, limba implicită, numele proprietarului și previzualizarea
   invitației nu au încă loc în model (NEFĂCUT în raportul lotului). */

export type NewBusinessState = 'idle' | 'pending' | 'error';

export function NewBusinessView({
  name,
  email,
  emailError,
  state,
  onNameChange,
  onEmailChange,
  onCancel,
  onSubmit,
}: {
  name: string;
  email: string;
  /** Textul erorii de adresă (din auth.*), dacă există. */
  emailError?: string;
  state: NewBusinessState;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('founder.newBusiness');
  const nav = useTranslations('founder.nav');
  const phone = useIsPhone();
  return (
    <>
      <PageHeader
        title={t('title')}
        breadcrumbs={
          phone
            ? undefined
            : [{ label: nav('businesses'), href: '/businesses' }, { label: t('title') }]
        }
        description={phone ? undefined : t('lead')}
      />
      <Sheet>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          noValidate
        >
          {state === 'error' && <Notice tone="danger">{t('error')}</Notice>}
          <SheetSection title={t('sectionBusiness')}>
            <FormField label={t('name')} isRequired>
              <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
            </FormField>
          </SheetSection>
          <SheetSection title={t('sectionOwner')}>
            <FormField label={t('email')} isRequired hint={t('emailHelp')} error={emailError}>
              <Input
                type="email"
                icon="mail"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
              />
            </FormField>
          </SheetSection>
          <div className={styles.formActions}>
            <Button variant="quiet" onPress={onCancel}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon="send"
              isDisabled={!name.trim()}
              isPending={state === 'pending'}
            >
              {phone ? t('submitShort') : t('submit')}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
