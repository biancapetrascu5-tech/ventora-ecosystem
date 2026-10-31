'use client';

import { useTranslations } from 'next-intl';
import {
  APPS,
  AppIcon,
  Button,
  Checkbox,
  FormField,
  Input,
  Notice,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  SheetSection,
  Toggle,
  type AppName,
} from '@ventora/ui';
import { useIsPhone } from '../screens/hooks';
import { BundleApps } from './commercial/BundlesView';
import cs from './commercial/commercial.module.css';
import styles from './business.module.css';

/* FounderNewBusiness (Lot 2.8; S117 1.2.0, D3-24): afacerea și adresa proprietarului, apoi
   invitația (E-4, 30 de zile), și „Ce cumpără”: moneda afacerii (lei / euro, D3-2), plata lunară
   sau anuală (D3-3), un bundle din cele în vânzare și / sau aplicații la bucată (cele din bundle
   sunt deja incluse), proba de 14 zile pe tot abonamentul (D3-5) și rezumatul — fiecare linie,
   totalul, implementarea, locurile. CUI, orașul, limba implicită, numele proprietarului și
   previzualizarea invitației nu au încă loc în model (NEFĂCUT în raportul lotului). */

export type NewBusinessState = 'idle' | 'pending' | 'error';

export type NewBusinessBuy = {
  currency: 'RON' | 'EUR';
  interval: 'month' | 'year';
  bundleId: string;
  apps: AppName[];
  trial: boolean;
};

export type NewBusinessOffer = {
  /** Bundle-urile în vânzare acum: valoarea, „Business · v2”, prețul pentru moneda și plata alese. */
  bundles: { value: string; label: string; description: string; apps: AppName[] }[];
  /** Aplicațiile la bucată: prețul și implementarea, pentru moneda și plata alese. */
  apps: { id: AppName; description: string }[];
  /** „Bundle Business · v2” / „CampaignKit · la bucată” și prețul lor; totalul; implementarea. */
  summary: {
    lines: { label: string; amount: string }[];
    total: string;
    setup: string;
    seats: string;
  };
};

export function NewBusinessView({
  name,
  email,
  emailError,
  state,
  buy,
  offer,
  onNameChange,
  onEmailChange,
  onBuyChange,
  onCancel,
  onSubmit,
}: {
  name: string;
  email: string;
  /** Textul erorii de adresă (din auth.*), dacă există. */
  emailError?: string;
  state: NewBusinessState;
  buy?: NewBusinessBuy;
  offer?: NewBusinessOffer;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onBuyChange?: (b: NewBusinessBuy) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('founder.newBusiness');
  const n = useTranslations('founder.new');
  const p = useTranslations('founder.pricing');
  const nav = useTranslations('founder.nav');
  const phone = useIsPhone();
  const set = (patch: Partial<NewBusinessBuy>) => buy && onBuyChange?.({ ...buy, ...patch });
  const bundle = buy && offer?.bundles.find((x) => x.value === buy.bundleId);
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
          {buy && offer && (
            <SheetSection title={n('buy.title')} description={n('buy.desc')}>
              <div className={cs.stack}>
                <div className={phone ? `${cs.prices} ${cs.pricesMob}` : cs.prices}>
                  <FormField label={n('currency')} isRequired hint={n('currencyHelp')}>
                    <SegmentedControl
                      aria-label={n('currency')}
                      value={buy.currency}
                      onChange={(v) => set({ currency: v as 'RON' | 'EUR' })}
                      options={[
                        { value: 'RON', label: p('lei') },
                        { value: 'EUR', label: p('euro') },
                      ]}
                    />
                  </FormField>
                  <FormField label={n('billing')} isRequired hint={n('billingHelp')}>
                    <SegmentedControl
                      aria-label={n('billing')}
                      value={buy.interval}
                      onChange={(v) => set({ interval: v as 'month' | 'year' })}
                      options={[
                        { value: 'month', label: p('monthly') },
                        { value: 'year', label: p('annual') },
                      ]}
                    />
                  </FormField>
                  <FormField label={n('bundle')} hint={n('bundleHelp')}>
                    <Select
                      value={buy.bundleId}
                      onChange={(v) => set({ bundleId: v })}
                      options={[
                        { value: '', label: n('noBundle') },
                        ...offer.bundles.map((b) => ({
                          value: b.value,
                          label: b.label,
                          description: b.description,
                        })),
                      ]}
                    />
                  </FormField>
                  <Toggle isSelected={buy.trial} onChange={(on) => set({ trial: on })}>
                    {t('trial')}
                  </Toggle>
                </div>
                {bundle && <BundleApps apps={bundle.apps} />}
                <div className={cs.stack2}>
                  <p className="subheading">{n('apps')}</p>
                  <p className="body-small muted">{n('appsHelp')}</p>
                </div>
                <div className={phone ? `${cs.fbAppList} ${cs.fbAppListMob}` : cs.fbAppList}>
                  {offer.apps.map((a) => {
                    const inBundle = !!bundle?.apps.includes(a.id);
                    return (
                      <Checkbox
                        key={a.id}
                        isSelected={inBundle || buy.apps.includes(a.id)}
                        isDisabled={inBundle}
                        description={
                          inBundle
                            ? n('inBundle', { name: bundle!.label.split(' · ')[0]! })
                            : a.description
                        }
                        onChange={(on) =>
                          set({
                            apps: on ? [...buy.apps, a.id] : buy.apps.filter((x) => x !== a.id),
                          })
                        }
                      >
                        <span className={cs.fbAppLab}>
                          <AppIcon app={a.id} size={20} />
                          {APPS[a.id]?.name}
                        </span>
                      </Checkbox>
                    );
                  })}
                </div>
                <div className={cs.fbSum}>
                  {offer.summary.lines.map((l) => (
                    <div key={l.label} className={cs.fbLine}>
                      <span className="body">{l.label}</span>
                      <span className="body v-num">{l.amount}</span>
                    </div>
                  ))}
                  <div className={cs.fbLineTot}>
                    <span className="body-strong">
                      {buy.interval === 'year' ? n('totalYear') : n('totalMonth')}
                    </span>
                    <span className="body-strong v-num">{offer.summary.total}</span>
                  </div>
                  <div className={cs.fbLine}>
                    <span className="body-small muted">{n('setupOnce')}</span>
                    <span className="body-small muted v-num">{offer.summary.setup}</span>
                  </div>
                  <div className={cs.fbLine}>
                    <span className="body-small muted">{n('seats')}</span>
                    <span className="body-small muted v-num">{offer.summary.seats}</span>
                  </div>
                </div>
              </div>
            </SheetSection>
          )}
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
