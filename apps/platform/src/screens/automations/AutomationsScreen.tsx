'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale, useIsPhone, useWhen } from '@ventora/screens';
import { saveAutomationSetting, type HubAutomationsData } from '@/server/automations-actions';
import { AutomationsView, V1_CODES, type HubAutomationItem } from './AutomationsView';

/* Lotul 4.10 — HubAutomations din datele afacerii. Setările (S116-D22) se salvează la schimbare;
   o salvare refuzată revine la valoarea de dinainte. „Cere pornirea” / „Cere o schimbare”:
   PLACEHOLDER până la Lotul 4.6 (solicitarea de suport) — un e-mail către echipă. */

type Ready = Extract<HubAutomationsData, { member: false }>;

export function AutomationsScreen({ data }: { data: HubAutomationsData }) {
  const phone = useIsPhone();
  const locale = useLocale();
  const t = useTranslations('automations');
  const when = useWhen();
  const ready = data.member ? null : (data as Ready);
  const [settings, setSettings] = useState(() =>
    Object.fromEntries((ready?.automations ?? []).map((a) => [a.id, a.settings])),
  );
  const month = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long' }).format(new Date());

  const ask = (subject: string) => {
    if (!ready) return;
    window.location.href = `mailto:${ready.supportEmail}?subject=${encodeURIComponent(subject)}`;
  };
  const save = async (id: string, patch: Ready['automations'][number]['settings']) => {
    const before = settings[id];
    setSettings((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    const res = await saveAutomationSetting(id, patch);
    if (!res.ok) setSettings((s) => ({ ...s, [id]: before ?? {} }));
  };

  const items: HubAutomationItem[] = (ready?.automations ?? []).map((a) => {
    const own = settings[a.id] ?? {};
    const item: HubAutomationItem = {
      id: a.id,
      code: a.code,
      name: a.name,
      booking: a.booking,
      on: a.on,
      last: a.lastSentAt ? { when: when(new Date(a.lastSentAt)), n: a.lastSentCount } : null,
    };
    if (a.code === 'winback') {
      item.setting = {
        kind: 'weeks',
        value: own.reactivationWeeks ?? 6,
        onChange: (n) => void save(a.id, { reactivationWeeks: n }),
      };
    } else if (a.code === 'birthday') {
      item.setting = {
        kind: 'discount',
        value: own.birthdayDiscountPercent ?? 0,
        onChange: (n) => void save(a.id, { birthdayDiscountPercent: n === 0 ? null : n }),
      };
    }
    return item;
  });
  const nameOf = (i: HubAutomationItem) =>
    (V1_CODES as readonly string[]).includes(i.code) ? t(`a.${i.code}.name`) : i.name;

  return (
    <AutomationsView
      phone={phone}
      member={data.member}
      items={items}
      usage={{ month, sent: ready?.messagesThisMonth ?? 0 }}
      onAsk={() => ask(t('ask'))}
      onAskOn={(i) => ask(`${t('askOn')} · ${nameOf(i)}`)}
    />
  );
}
