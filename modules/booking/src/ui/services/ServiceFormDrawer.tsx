'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  Drawer,
  FormField,
  Icon,
  Input,
  Notice,
  SegmentedControl,
  Select,
  Textarea,
  Toggle,
} from '@ventora/ui';
import {
  lowDepositMember,
  membersOf,
  parseAmount,
  type FormErrors,
  type ServiceForm,
  type TeamMember,
} from './format';
import { ServiceMembers } from './ServiceMembers';
import { useServiceTexts } from './texts';
import type { ScreenMode } from './BookingServicesView';
import s from './services.module.css';

/* BookingServices (S123): the service form in a Drawer (full screen on a phone). Controlled: the
   page keeps the form and the errors; `framed` draws it inside a gallery frame (contained).
   S129 / S137–S138: „Cine îl face” and each member's duration and price before „Se poate rezerva
   online”; nobody → the toggle off and disabled; a member's price under the deposit → no saving. */

export const NEW_CATEGORY = '__new__';
const NONE = '__none__';

export type ServiceFormDrawerProps = {
  mode: ScreenMode;
  isNew: boolean;
  /** The name of the service being edited (the subtitle). */
  editingName?: string;
  form: ServiceForm;
  onChange: (form: ServiceForm) => void;
  categories: { id: string; name: string }[];
  /** „Categorie nouă…” in the category list. */
  onNewCategory?: () => void;
  errors?: FormErrors;
  /** err.nameDuplicate: the category of the service that already has the name. */
  duplicateCategory?: string;
  busy?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  framed?: boolean;
  isOpen?: boolean;
  /** S129: the members in the calendar. */
  team: TeamMember[];
  /** S129: the category whose members were pre-ticked („Am bifat cine face deja…”). */
  fromCategory?: string;
  /** S137: the service's deposit (B.22), when the business asks for one. */
  depositMinor?: number | null;
  openMember?: string | null;
  onOpenMember?: (id: string | null) => void;
};

export function ServiceFormDrawer(p: ServiceFormDrawerProps) {
  const x = useServiceTexts();
  const { t } = x;
  const ui = useTranslations('ui');
  const mob = p.mode === 'mobile';
  const f = p.form;
  const e = p.errors ?? {};
  const set = (patch: Partial<ServiceForm>) => p.onChange({ ...f, ...patch });
  const variable = f.durationKind === 'variable';
  const many = Object.keys(e).length > 1;

  const durationError = (k: 'duration' | 'durationMax') => {
    const err = e[k];
    if (!err) return undefined;
    if (err.code === 'step') return t('err.durationStep', { a: err.a, b: err.b });
    if (err.code === 'order') return t('err.durationOrder');
    return t('err.durationLimits');
  };
  const nameError =
    e.name?.code === 'duplicate'
      ? t('err.nameDuplicate', { name: f.name.trim(), category: p.duplicateCategory ?? '' })
      : e.name
        ? t('err.nameRequired')
        : undefined;
  const priceMaxError = e.priceMax?.code === 'order' ? t('err.priceOrder') : undefined;

  const options = [
    ...p.categories.map((c) => ({ value: c.id, label: c.name })),
    { value: NONE, label: t('uncategorized') },
    { value: NEW_CATEGORY, label: t('form.categoryNew') },
  ];
  const minutes = <span className="body-small muted">{t('form.minutes')}</span>;
  const fromAmount = parseAmount(f.price);
  const nobody = membersOf(f.who, p.team).length === 0;
  const blockSave = lowDepositMember(f, p.team, p.depositMinor) !== null;

  const form = (
    <div className={s.stack}>
      {many && (
        <Notice className={s.notice} tone="danger" icon="circle-alert" title={t('err.summary')} />
      )}
      <FormField
        label={t('form.name')}
        required
        hint={nameError ? undefined : t('form.nameHelp')}
        error={nameError}
      >
        <Input
          value={f.name}
          onChange={(ev) => set({ name: ev.target.value })}
          isInvalid={!!nameError}
        />
      </FormField>
      <FormField label={t('form.category')}>
        <Select
          value={f.categoryId ?? NONE}
          options={options}
          onChange={(v) => {
            if (v === NEW_CATEGORY) p.onNewCategory?.();
            else set({ categoryId: v === NONE ? null : v });
          }}
        />
      </FormField>
      <FormField
        label={t('form.description')}
        isOptional
        optionalLabel={ui('optional')}
        hint={t('form.descriptionHelp')}
      >
        <Textarea
          rows={2}
          value={f.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </FormField>
      <fieldset className={s.fs}>
        <legend className="body-strong">{t('form.duration')}</legend>
        <div className={s.start}>
          <SegmentedControl
            size="sm"
            aria-label={t('form.duration')}
            value={variable ? 'var' : 'fix'}
            onChange={(v) => set({ durationKind: v === 'var' ? 'variable' : 'fixed' })}
            options={[
              { value: 'fix', label: t('form.durationFixed') },
              { value: 'var', label: t('form.durationVariable') },
            ]}
          />
        </div>
        {variable ? (
          <div className={`${s.g2f} ${mob ? s.m : ''}`}>
            <FormField label={t('form.durationMin')} required error={durationError('duration')}>
              <Input
                type="number"
                value={f.duration}
                onChange={(ev) => set({ duration: ev.target.value })}
                suffix={minutes}
                isInvalid={!!e.duration}
              />
            </FormField>
            <FormField label={t('form.durationMax')} required error={durationError('durationMax')}>
              <Input
                type="number"
                value={f.durationMax}
                onChange={(ev) => set({ durationMax: ev.target.value })}
                suffix={minutes}
                isInvalid={!!e.durationMax}
              />
            </FormField>
          </div>
        ) : (
          <div className={s.narrow}>
            <FormField label={t('form.durationValue')} required error={durationError('duration')}>
              <Input
                type="number"
                value={f.duration}
                onChange={(ev) => set({ duration: ev.target.value })}
                suffix={minutes}
                isInvalid={!!e.duration}
              />
            </FormField>
          </div>
        )}
        <p className={`${s.xline} body-small`}>
          <Icon icon="info" size={16} />
          {variable
            ? `${t('form.durationHelp')} ${t('form.durationVariableHelp')}`
            : t('form.durationHelp')}
        </p>
      </fieldset>
      <fieldset className={s.fs}>
        <legend className="body-strong">{t('form.price')}</legend>
        <div className={s.start}>
          <SegmentedControl
            size="sm"
            aria-label={t('form.price')}
            value={f.priceKind}
            onChange={(v) => set({ priceKind: v as ServiceForm['priceKind'] })}
            options={[
              { value: 'fixed', label: t('form.priceFixed') },
              { value: 'from', label: t('form.priceFrom') },
              { value: 'range', label: t('form.priceRange') },
            ]}
          />
        </div>
        <div className={`${s.g2f} ${mob ? s.m : ''}`}>
          {f.priceKind === 'range' ? (
            <>
              <FormField label={t('form.priceMin')} required>
                <Input
                  type="number"
                  value={f.price}
                  onChange={(ev) => set({ price: ev.target.value })}
                  isInvalid={!!e.price}
                />
              </FormField>
              <FormField label={t('form.priceMax')} required error={priceMaxError}>
                <Input
                  type="number"
                  value={f.priceMax}
                  onChange={(ev) => set({ priceMax: ev.target.value })}
                  isInvalid={!!e.priceMax}
                />
              </FormField>
            </>
          ) : (
            <FormField
              label={f.priceKind === 'from' ? t('form.priceMin') : t('form.priceAmount')}
              required
            >
              <Input
                type="number"
                value={f.price}
                onChange={(ev) => set({ price: ev.target.value })}
                isInvalid={!!e.price}
              />
            </FormField>
          )}
          <FormField label={t('form.currency')} hint={t('form.currencyHelp')}>
            <Select
              value={f.currency}
              onChange={(v) => set({ currency: v as ServiceForm['currency'] })}
              options={[
                { value: 'RON', label: t('currency.ron') },
                { value: 'EUR', label: t('currency.eur') },
              ]}
            />
          </FormField>
        </div>
        {f.priceKind !== 'fixed' && (
          <p className={`${s.xline} body-small`}>
            <Icon icon="info" size={16} />
            {f.priceKind === 'from'
              ? t('form.priceFromHelp', { amount: x.money(fromAmount ?? 0, f.currency) })
              : t('form.priceRangeHelp')}
          </p>
        )}
      </fieldset>
      <div className={s.narrow}>
        <FormField label={t('form.capacity')} required hint={t('form.capacityHelp')}>
          <Input
            type="number"
            value={f.capacity}
            onChange={(ev) => set({ capacity: ev.target.value })}
            isInvalid={!!e.capacity}
          />
        </FormField>
      </div>
      <ServiceMembers
        mode={p.mode}
        form={f}
        onChange={p.onChange}
        team={p.team}
        fromCategory={p.fromCategory}
        depositMinor={p.depositMinor}
        openMember={p.openMember}
        onOpenMember={p.onOpenMember}
        invalidMember={
          e.terms && 'staffId' in e.terms && e.terms.code === 'invalid' ? e.terms.staffId : null
        }
      />
      <Toggle
        isSelected={f.bookableOnline && !nobody}
        isDisabled={nobody}
        onChange={(v) => set({ bookableOnline: v })}
        description={nobody ? t('form.membersNone.title') : t('form.onlineHelp')}
      >
        {t('form.online')}
      </Toggle>
    </div>
  );

  const footer = (
    <div className={`${s.foot} ${mob ? s.m : ''}`}>
      {!p.isNew && (
        <Button variant="quiet" onPress={p.onArchive}>
          {t('form.archive')}
        </Button>
      )}
      <span className={s.grow} />
      <Button variant="quiet" onPress={p.onCancel}>
        {t('form.cancel')}
      </Button>
      <Button
        variant="primary"
        icon="check"
        onPress={p.onSubmit}
        isPending={p.busy}
        isDisabled={blockSave}
      >
        {p.isNew ? t('form.create') : t('form.save')}
      </Button>
    </div>
  );

  return (
    <Drawer
      contained={p.framed}
      isOpen={p.framed ? undefined : p.isOpen}
      onOpenChange={(o) => !o && p.onCancel?.()}
      onClose={p.onCancel}
      layout={mob ? 'full' : 'auto'}
      width={520}
      title={p.isNew ? t('form.newTitle') : t('form.editTitle')}
      subtitle={p.isNew ? undefined : p.editingName}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      footer={footer}
    >
      {form}
    </Drawer>
  );
}
