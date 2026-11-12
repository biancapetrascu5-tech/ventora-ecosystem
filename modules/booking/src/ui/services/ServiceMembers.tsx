'use client';

import { Avatar, Button, Checkbox, Icon, Input, Notice, SegmentedControl } from '@ventora/ui';
import {
  lowDepositMember,
  membersOf,
  parseAmount,
  type MemberTermsForm,
  type ServiceForm,
  type TeamMember,
} from './format';
import { useServiceTexts } from './texts';
import s from './services.module.css';

/* BookingServices: „Cine îl face” in the service form (S129) — the whole team or the members ticked
   one by one, the Notice for nobody — and each ticked member's own duration and price (S137–S138,
   B.2c): a summary line, „Durată și preț” opens the same controls as the service, „Folosește
   valorile serviciului” goes back to the service's values. preview.html: WhoField, MemberOvr. */

type Terms = Pick<
  MemberTermsForm,
  'durationKind' | 'duration' | 'durationMax' | 'priceKind' | 'price' | 'priceMax'
>;

/** The service's own values in the shape of a member's terms. */
const serviceTerms = (f: ServiceForm): Terms => ({
  durationKind: f.durationKind,
  duration: f.duration,
  durationMax: f.durationMax,
  priceKind: f.priceKind,
  price: f.price,
  priceMax: f.priceMax,
});

function useTermTexts(currency: ServiceForm['currency']) {
  const x = useServiceTexts();
  const n = (v: string) => Number(v.trim());
  const minor = (v: string) => parseAmount(v) ?? 0;
  return {
    duration: (t: Terms) =>
      x.duration({
        durationMinutes: n(t.duration),
        durationMaxMinutes: t.durationKind === 'variable' ? n(t.durationMax) : null,
      }),
    price: (t: Terms) =>
      x.price({
        priceKind: t.priceKind,
        priceMinor: minor(t.price),
        priceMaxMinor: t.priceKind === 'range' ? minor(t.priceMax) : null,
        currency,
      }),
  };
}

type MemberProps = {
  form: ServiceForm;
  member: TeamMember;
  mob: boolean;
  open: boolean;
  /** The member's terms are not valid: every input in error. */
  invalid: boolean;
  /** S137: the member's price is under the deposit: only the price in error. */
  lowPrice: boolean;
  onOpen?: () => void;
  onChange?: (terms: MemberTermsForm | null) => void;
};

function MemberTerms({
  form,
  member,
  mob,
  open,
  invalid,
  lowPrice,
  onOpen,
  onChange,
}: MemberProps) {
  const x = useServiceTexts();
  const { t } = x;
  const tt = useTermTexts(form.currency);
  const own = form.terms[member.id];
  const svc = serviceTerms(form);
  const m: MemberTermsForm = own ?? svc;
  const set = (patch: Partial<MemberTermsForm>) => onChange?.({ ...m, ...patch });
  const line = (
    <span className={s.ovrline}>
      <span className={own ? 'caption' : 'caption muted'}>
        {own
          ? t('member.own', {
              d: tt.duration(m),
              p: tt.price(m),
              sd: tt.duration(svc),
              sp: tt.price(svc),
            })
          : t('member.same', { d: tt.duration(svc), p: tt.price(svc) })}
      </span>
      {!open && (
        <Button size="sm" variant="quiet" icon="pencil" onPress={onOpen}>
          {t('member.edit')}
        </Button>
      )}
    </span>
  );
  if (!open) return <div className={`${s.ovr} ${mob ? s.m : ''}`}>{line}</div>;
  const minutes = <span className="body-small muted">{t('form.minutes')}</span>;
  const cur = (
    // the currency without an amount ("lei", "€"), from money.* as preview.html does
    <span className="body-small muted">{t(`money.${form.currency}`, { amount: '' }).trim()}</span>
  );
  const variable = m.durationKind === 'variable';
  return (
    <div className={s.ovrbox}>
      <div className={s.row}>
        <span className="body-strong">{t('member.boxTitle', { name: member.name })}</span>
        <span className={s.grow} />
        <Button size="sm" variant="quiet" onPress={() => onChange?.(null)}>
          {t('member.reset')}
        </Button>
      </div>
      <div className={`${s.ovrgrid} ${mob ? s.m : ''}`}>
        <div className={s.stack}>
          <SegmentedControl
            size="sm"
            aria-label={t('member.duration', { name: member.name })}
            value={variable ? 'var' : 'fix'}
            onChange={(v) =>
              set({
                durationKind: v === 'var' ? 'variable' : 'fixed',
                durationMax: v === 'var' ? m.durationMax || m.duration : '',
              })
            }
            options={[
              { value: 'fix', label: t('form.durationFixed') },
              { value: 'var', label: t('form.durationVariable') },
            ]}
          />
          <div className={s.ovrin}>
            <Input
              size="sm"
              type="number"
              aria-label={
                variable ? t('form.durationMin') : t('member.duration', { name: member.name })
              }
              value={m.duration}
              onChange={(e) => set({ duration: e.target.value })}
              suffix={minutes}
              isInvalid={invalid}
            />
            {variable && (
              <Input
                size="sm"
                type="number"
                aria-label={t('form.durationMax')}
                value={m.durationMax}
                onChange={(e) => set({ durationMax: e.target.value })}
                suffix={minutes}
                isInvalid={invalid}
              />
            )}
          </div>
        </div>
        <div className={s.stack}>
          <SegmentedControl
            size="sm"
            aria-label={t('member.price', { name: member.name })}
            value={m.priceKind}
            onChange={(v) => set({ priceKind: v as MemberTermsForm['priceKind'] })}
            options={[
              { value: 'fixed', label: t('form.priceFixed') },
              { value: 'from', label: t('form.priceFrom') },
              { value: 'range', label: t('form.priceRange') },
            ]}
          />
          <div className={s.ovrin}>
            <Input
              size="sm"
              type="number"
              aria-label={
                m.priceKind === 'fixed'
                  ? t('member.price', { name: member.name })
                  : t('form.priceMin')
              }
              value={m.price}
              onChange={(e) => set({ price: e.target.value })}
              suffix={cur}
              isInvalid={invalid || lowPrice}
            />
            {m.priceKind === 'range' && (
              <Input
                size="sm"
                type="number"
                aria-label={t('form.priceMax')}
                value={m.priceMax}
                onChange={(e) => set({ priceMax: e.target.value })}
                suffix={cur}
                isInvalid={invalid}
              />
            )}
          </div>
        </div>
      </div>
      {line}
    </div>
  );
}

export type ServiceMembersProps = {
  mode: 'desktop' | 'tablet' | 'mobile';
  form: ServiceForm;
  onChange: (form: ServiceForm) => void;
  team: TeamMember[];
  /** S129: the category whose members were pre-ticked (a new service). */
  fromCategory?: string;
  /** S137: the service's deposit (B.22), for the check of a member's lowest price. */
  depositMinor?: number | null;
  /** The member whose duration and price are open. */
  openMember?: string | null;
  onOpenMember?: (id: string | null) => void;
  /** A member's terms that are not valid (the inputs in error). */
  invalidMember?: string | null;
};

export function ServiceMembers(p: ServiceMembersProps) {
  const x = useServiceTexts();
  const { t } = x;
  const f = p.form;
  const mob = p.mode === 'mobile';
  const all = f.who === 'all';
  const list = membersOf(f.who, p.team);
  const low = lowDepositMember(f, p.team, p.depositMinor);
  const set = (patch: Partial<ServiceForm>) => p.onChange({ ...f, ...patch });
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...list, id] : list.filter((x2) => x2 !== id);
    set({ who: p.team.map((m) => m.id).filter((m) => next.includes(m)) });
  };
  const tt = useTermTexts(f.currency);
  const svc = serviceTerms(f);
  return (
    <fieldset className={s.fs}>
      <legend className="body-strong">{t('form.members')}</legend>
      <p className={`body-small muted ${s.lead}`}>{t('form.membersLead')}</p>
      <Checkbox
        isSelected={all}
        isIndeterminate={!all && list.length > 0}
        onChange={(on) => set({ who: on ? 'all' : [] })}
        description={t('form.membersAllHelp')}
      >
        {t('form.membersAll')}
      </Checkbox>
      {list.length > 0 && (
        <p className={`body-small muted ${s.lead}`}>
          {t('member.lead', { d: tt.duration(svc), p: tt.price(svc) })}
        </p>
      )}
      <ul className={`${s.team} ${s.pm}`}>
        {p.team.map((m) => (
          <li key={m.id}>
            <span className={s.pmwho}>
              <Avatar name={m.name} size="sm" />
              <Checkbox
                isSelected={list.includes(m.id)}
                isDisabled={all}
                onChange={(on) => toggle(m.id, on)}
                description={m.role}
              >
                {m.name}
              </Checkbox>
            </span>
            {list.includes(m.id) && (
              <MemberTerms
                form={f}
                member={m}
                mob={mob}
                open={p.openMember === m.id}
                invalid={p.invalidMember === m.id}
                lowPrice={low?.staffId === m.id}
                onOpen={() => p.onOpenMember?.(m.id)}
                onChange={(terms) => {
                  const next = { ...f.terms };
                  if (terms) next[m.id] = terms;
                  else delete next[m.id];
                  set({ terms: next });
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {low && p.depositMinor ? (
        <Notice
          className={s.notice}
          tone="attention"
          icon="circle-alert"
          title={t('member.lowDeposit.title', {
            name: p.team.find((m) => m.id === low.staffId)?.name ?? '',
            p: x.money(low.priceMinor, f.currency),
            dep: x.money(p.depositMinor, f.currency),
          })}
        >
          {t('member.lowDeposit.body')}
        </Notice>
      ) : null}
      {list.length === 0 && (
        <Notice
          className={s.notice}
          tone="attention"
          icon="users"
          title={t('form.membersNone.title')}
        >
          {t('form.membersNone.body')}
        </Notice>
      )}
      <p className={`${s.xline} body-small`}>
        <Icon icon="info" size={16} />
        {p.fromCategory
          ? `${t('form.membersFromCategory', { category: p.fromCategory })} ${t('form.membersSchedule')}`
          : t('form.membersSchedule')}
      </p>
    </fieldset>
  );
}
