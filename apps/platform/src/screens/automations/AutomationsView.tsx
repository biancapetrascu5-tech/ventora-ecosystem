'use client';

import { useTranslations } from 'next-intl';
import {
  AppIcon,
  Button,
  EmptyState,
  FormField,
  Icon,
  Notice,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  StatusPill,
  UsageMeter,
} from '@ventora/ui';
import { useUsageMeterLabels } from '../labels';
import s from './automations.module.css';

/* HubAutomations (Lotul 4.10, D4-23, D-WF-3, S116): Afacerea · Automatizări. Proprietarul și adminii
   văd automatizările afacerii, dacă sunt pornite și ultima trimitere; nu le pot porni sau opri
   (doar echipa Ventora Systems, din Founder): „Cere pornirea” / „Cere o schimbare” scriu echipei.
   Setările afacerii (săptămânile, reducerea) le alege afacerea (S116-D22). UsageMeter-ul arată
   mesajele automate trimise luna aceasta (S116-D20); în v1 fără plafon (decizia 04.11.2026). */

/** Cele 6 automatizări v1 (D4-24): numele și descrierile lor, în limba cititorului. */
export const V1_CODES = ['thanks', 'winback', 'birthday', 'risk', 'digest', 'quota'] as const;
const isV1 = (code: string) => (V1_CODES as readonly string[]).includes(code);

export const WEEK_OPTIONS = [4, 6, 8, 12];
export const DISCOUNT_OPTIONS = [0, 10, 15, 20];

export type HubAutomationItem = {
  id: string;
  code: string;
  /** Numele dat în Founder, pentru o automatizare care nu e din v1. */
  name: string;
  /** Automatizarea ascultă un eveniment din EasyBook (nu din Hub). */
  booking: boolean;
  on: boolean;
  /** „azi, 13:02” + mesajele ultimei trimiteri; null: „Nu a trimis încă nimic”. */
  last: { when: string; n: number } | null;
  setting?:
    | { kind: 'weeks'; value: number; onChange: (n: number) => void }
    | { kind: 'discount'; value: number; onChange: (n: number) => void };
};

export function AutomationsView({
  phone,
  member,
  items,
  usage,
  onAsk,
  onAskOn,
}: {
  phone: boolean;
  /** Un membru vede doar că pagina e a proprietarului și a adminilor. */
  member?: boolean;
  items: HubAutomationItem[];
  /** „Mesaje automate în {month}”: trimise luna aceasta; `limit` doar dacă există un plafon. */
  usage: { month: string; sent: number; limit?: number; onUpgrade?: () => void };
  onAsk: () => void;
  onAskOn: (item: HubAutomationItem) => void;
}) {
  const t = useTranslations('automations');
  const meterLabels = useUsageMeterLabels();
  const empty = !items.some((i) => i.on);
  const name = (i: HubAutomationItem) => (isV1(i.code) ? t(`a.${i.code}.name`) : i.name);
  const desc = (i: HubAutomationItem) =>
    isV1(i.code)
      ? t(`a.${i.code}.desc`, {
          n: i.setting?.kind === 'weeks' ? i.setting.value : WEEK_OPTIONS[1]!,
        })
      : null;

  let body;
  if (member) {
    body = <EmptyState icon="lock" title={t('title')} description={t('memberNote')} />;
  } else if (empty) {
    body = (
      <EmptyState
        icon="refresh-cw"
        title={t('empty.title')}
        description={t('empty.body')}
        actions={
          <Button variant="primary" icon="life-buoy" onPress={onAsk}>
            {t('ask')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className={s.stack}>
        <Sheet>
          <SheetSection>
            <div className={s.stack}>
              <UsageMeter
                {...meterLabels}
                label={t('usage', { month: usage.month })}
                used={usage.sent}
                limit={usage.limit}
                unlimitedLabel={t('sentN', { n: usage.sent })}
                onUpgrade={usage.onUpgrade}
              />
              <p className={`caption ${s.muted}`}>{t('usageHelp')}</p>
            </div>
          </SheetSection>
        </Sheet>
        <Notice className={s.notice} tone="neutral" icon="info" title={t('who')}>
          <Button size="sm" variant="secondary" icon="life-buoy" onPress={onAsk}>
            {t('ask')}
          </Button>
        </Notice>
        {items.map((i) => (
          <div className={`${s.field} ${s.fieldTop}`} key={i.id}>
            <AppIcon
              app={i.booking ? 'booking' : undefined}
              icon={i.booking ? undefined : 'chart-column'}
              size={32}
              muted={!i.on}
            />
            <div className={`${s.stack} ${s.stack2}`}>
              <div className={s.row}>
                <p className="body-strong">{name(i)}</p>
                <StatusPill
                  size="sm"
                  tone={i.on ? 'done' : 'neutral'}
                  icon={i.on ? 'check' : 'circle'}
                >
                  {t(i.on ? 'on' : 'off')}
                </StatusPill>
              </div>
              {desc(i) ? <p className={`body-small ${s.secondary}`}>{desc(i)}</p> : null}
              {i.setting?.kind === 'weeks' ? (
                <div className={s.narrow}>
                  <FormField label={t('yourSetting')}>
                    <Select
                      size="sm"
                      value={String(i.setting.value)}
                      onChange={(v) => i.setting!.onChange(Number(v))}
                      options={WEEK_OPTIONS.map((n) => ({
                        value: String(n),
                        label: t('weeks', { n }),
                      }))}
                    />
                  </FormField>
                </div>
              ) : null}
              {i.setting?.kind === 'discount' ? (
                <div className={s.narrow}>
                  <FormField label={t('discount')}>
                    <Select
                      size="sm"
                      value={String(i.setting.value)}
                      onChange={(v) => i.setting!.onChange(Number(v))}
                      options={DISCOUNT_OPTIONS.map((n) => ({
                        value: String(n),
                        label: n === 0 ? t('discountNone') : `${n}%`,
                      }))}
                    />
                  </FormField>
                </div>
              ) : null}
              <p className={`caption ${s.muted}`}>
                {i.on && i.last ? t('last', { when: i.last.when, n: i.last.n }) : t('never')}
              </p>
            </div>
            {i.on ? null : (
              <Button size="sm" variant="secondary" icon="send" onPress={() => onAskOn(i)}>
                {t('askOn')}
              </Button>
            )}
          </div>
        ))}
        <p className={`${s.line} body-small`}>
          <Icon icon="calendar-check" size={16} />
          {t('reminderNote')}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('lead')} />
      <div className={`${s.body} ${phone ? s.bodyM : ''}`}>
        {phone ? <div className={s.pad}>{body}</div> : body}
      </div>
    </>
  );
}
