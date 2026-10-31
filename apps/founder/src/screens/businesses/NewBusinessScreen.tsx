'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, APP_IDS, type AppName } from '@ventora/ui';
import {
  NewBusinessView,
  emailProblem,
  money,
  type NewBusinessBuy,
  type NewBusinessOffer,
  type NewBusinessState,
} from '@ventora/screens';
import { createBusiness } from '@/server/business-actions';
import type { BundlesData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { MEMBERS, appPrice, currentOffer, priceOf } from '../commercial/bundleText';

/* „Afacere nouă” (Lot 2.8; S117 / D3-24): createBusinessAsFounder — afacerea și invitația
   proprietarului (E-4), cu auditul pe persoana Founder — apoi „Ce cumpără”: moneda, abonamentul
   cu sau fără bundle (doar cele în vânzare acum), aplicațiile la bucată și proba (business-actions).
   Erorile de adresă folosesc textele existente (auth.reset.error.*). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

export function NewBusinessScreen({
  user,
  catalog,
}: {
  user: { name: string };
  catalog: BundlesData | null;
}) {
  const router = useRouter();
  const t = useTranslations('founder.newBusiness');
  const n = useTranslations('founder.new');
  const reset = useTranslations('auth.reset');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<'empty' | 'format' | null>(null);
  const [state, setState] = useState<NewBusinessState>('idle');
  const [buy, setBuy] = useState<NewBusinessBuy>({
    currency: 'RON',
    interval: 'month',
    bundleId: '',
    apps: [],
    trial: true,
  });

  const kind = buy.interval;
  const per = (amount: number) =>
    kind === 'year'
      ? n('perYear', { amount: money(amount, buy.currency) })
      : n('perMonth', { amount: money(amount, buy.currency) });
  const selling = (catalog?.bundles ?? [])
    .map((b) => ({ b, ...currentOffer(b) }))
    .filter(
      (x) => x.status === 'selling' && x.offer && priceOf(x.offer, buy.currency, kind) !== null,
    );
  const chosen = selling.find((x) => x.b.id === buy.bundleId) ?? null;
  const inBundle = new Set(chosen?.offer?.applications ?? []);
  const extra = buy.apps.filter((a) => !inBundle.has(a));
  const lines = [
    ...(chosen?.offer
      ? [
          {
            label: n('line.bundle', { name: chosen.b.name, v: `v${chosen.offer.number}` }),
            price: priceOf(chosen.offer, buy.currency, kind) ?? 0,
            setup: priceOf(chosen.offer, buy.currency, 'setup') ?? 0,
          },
        ]
      : []),
    ...extra.map((a) => ({
      label: n('line.app', { app: APPS[a as AppName]?.name ?? a }),
      price: appPrice(catalog?.apps ?? [], a, buy.currency, kind),
      setup: appPrice(catalog?.apps ?? [], a, buy.currency, 'setup'),
    })),
  ];
  const offer: NewBusinessOffer | undefined = catalog
    ? {
        bundles: selling.map((x) => ({
          value: x.b.id,
          label: `${x.b.name} · v${x.offer!.number}`,
          description: per(priceOf(x.offer, buy.currency, kind) ?? 0),
          apps: (x.offer!.applications as AppName[]).filter(isApp),
        })),
        apps: catalog.apps
          .filter((a) => isApp(a.id) && appPrice(catalog.apps, a.id, buy.currency, kind) > 0)
          .map((a) => {
            const setup = appPrice(catalog.apps, a.id, buy.currency, 'setup');
            return {
              id: a.id as AppName,
              description: `${per(appPrice(catalog.apps, a.id, buy.currency, kind))} · ${
                setup ? n('setupShort', { amount: money(setup, buy.currency) }) : n('noSetupLower')
              }`,
            };
          }),
        summary: {
          lines: lines.map((l) => ({ label: l.label, amount: money(l.price, buy.currency) })),
          total: money(
            lines.reduce((s, l) => s + l.price, 0),
            buy.currency,
          ),
          setup: lines.some((l) => l.setup)
            ? money(
                lines.reduce((s, l) => s + l.setup, 0),
                buy.currency,
              )
            : n('noSetupValue'),
          seats: String(catalog.includedMembers + (chosen?.offer?.quotas[MEMBERS] ?? 0)),
        },
      }
    : undefined;

  async function submit() {
    const p = emailProblem(email);
    setProblem(p);
    if (p || !name.trim()) return;
    setState('pending');
    const res = await createBusiness(
      name.trim(),
      email.trim(),
      catalog
        ? {
            currency: buy.currency,
            interval: buy.interval,
            bundleVersionId: chosen?.offer?.id ?? null,
            applications: extra,
            trial: buy.trial,
          }
        : undefined,
    );
    if (res.ok) {
      router.push(
        `/businesses/${res.organizationId}${res.commercialFailed ? '?purchaseFailed=1&tab=billing' : ''}`,
      );
      return;
    }
    if (res.field === 'email') {
      setProblem('format');
      setState('idle');
    } else setState('error');
  }

  return (
    <FounderShell active="afaceri" title={t('title')} user={user}>
      <NewBusinessView
        name={name}
        email={email}
        emailError={problem ? reset(`error.${problem}`) : undefined}
        state={state}
        buy={catalog ? buy : undefined}
        offer={offer}
        onBuyChange={setBuy}
        onNameChange={setName}
        onEmailChange={(v) => {
          setEmail(v);
          if (problem) setProblem(null);
        }}
        onCancel={() => router.push('/businesses')}
        onSubmit={() => void submit()}
      />
    </FounderShell>
  );
}
