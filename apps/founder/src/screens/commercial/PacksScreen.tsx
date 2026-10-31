'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS, Button, Dialog, DialogTrigger, Toast, type AppName } from '@ventora/ui';
import {
  PackDialog,
  PacksView,
  amountInput,
  commercialStyles as cs,
  money,
  parseAmount,
  parseCount,
  useIsPhone,
  type PackFormErrors,
  type PackFormValues,
  type PackRow,
} from '@ventora/screens';
import { savePack, stopPack, type PacksData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { useQuotaText } from './labels';

/* FounderPacks (Lotul 3.4): „Pachete în plus” — prețurile în lei și în euro, implementarea, cum
   se plătește, „direct / la cerere” (D3-7; cu implementare → la cerere, D3-23), „Oprește
   vânzarea”. Fiecare schimbare trece prin core/commercial, cu auditul ei pe persoana Founder. */

const EMPTY: PackFormValues = {
  name: '',
  quotaKey: '',
  quantity: '',
  priceLei: '',
  priceEur: '',
  setupLei: '0',
  setupEur: '0',
  validity: 'current_month',
  purchaseMode: 'direct',
};

export function PacksScreen({
  user,
  data,
  requestsBadge,
}: {
  user: { name: string };
  data: PacksData;
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.packs');
  const ui = useTranslations('ui');
  const q = useQuotaText();
  const phone = useIsPhone();
  const [dialog, setDialog] = useState<{ id?: string; title: string } | null>(null);
  const [values, setValues] = useState<PackFormValues>(EMPTY);
  const [errors, setErrors] = useState<PackFormErrors>({});
  const [stop, setStop] = useState<PackRow | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rows: PackRow[] = data.packs.map((p) => {
    const ron = p.prices.find((x) => x.currency === 'RON');
    const eur = p.prices.find((x) => x.currency === 'EUR');
    const price = [ron && money(ron.amountMinor, 'RON'), eur && money(eur.amountMinor, 'EUR')]
      .filter(Boolean)
      .join(' · ');
    const setup =
      (ron?.setupMinor ?? 0) > 0 || (eur?.setupMinor ?? 0) > 0
        ? [ron && money(ron.setupMinor, 'RON'), eur && money(eur.setupMinor, 'EUR')]
            .filter(Boolean)
            .join(' · ')
        : t('none');
    return {
      id: p.id,
      name: p.name,
      price,
      period: p.validity === 'monthly' ? t('period.monthly') : t('period.once'),
      setup,
      availableFor: p.applicationId
        ? t('availableWith', { app: APPS[p.applicationId as AppName]?.name ?? p.applicationId })
        : t('availableAll'),
      direct: p.purchaseMode === 'direct',
      stopped: p.stopped,
    };
  });

  function openEdit(row: PackRow) {
    const p = data.packs.find((x) => x.id === row.id)!;
    const ron = p.prices.find((x) => x.currency === 'RON');
    const eur = p.prices.find((x) => x.currency === 'EUR');
    setValues({
      name: p.name,
      quotaKey: p.quotaKey,
      quantity: String(p.quantity),
      priceLei: amountInput(ron?.amountMinor),
      priceEur: amountInput(eur?.amountMinor),
      setupLei: amountInput(ron?.setupMinor ?? 0),
      setupEur: amountInput(eur?.setupMinor ?? 0),
      validity: p.validity,
      purchaseMode: p.purchaseMode,
    });
    setErrors({});
    setFailed(false);
    setDialog({ id: p.id, title: t('edit.title', { name: p.name }) });
  }

  function openNew() {
    setValues({ ...EMPTY, quotaKey: data.quotas[0]?.key ?? '' });
    setErrors({});
    setFailed(false);
    setDialog({ title: t('newTitle') });
  }

  async function save() {
    const e: PackFormErrors = {};
    const priceLei = parseAmount(values.priceLei);
    const priceEur = parseAmount(values.priceEur);
    const setupLei = parseAmount(values.setupLei || '0');
    const setupEur = parseAmount(values.setupEur || '0');
    const quantity = parseCount(values.quantity);
    const required = t('edit.errorRequired');
    if (priceLei === null) e.priceLei = required;
    if (priceEur === null) e.priceEur = t('edit.errorEur');
    if (setupLei === null) e.setupLei = required;
    if (setupEur === null) e.setupEur = required;
    if (!dialog?.id) {
      if (!values.name.trim()) e.name = required;
      if (!values.quotaKey) e.quotaKey = required;
      if (!quantity) e.quantity = required;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFailed(false);
    const res = await savePack({
      id: dialog?.id,
      name: values.name.trim(),
      quotaKey: values.quotaKey,
      quantity: quantity ?? 0,
      validity: values.validity,
      purchaseMode: values.purchaseMode,
      prices: [
        { currency: 'RON', amountMinor: priceLei!, setupMinor: setupLei! },
        { currency: 'EUR', amountMinor: priceEur!, setupMinor: setupEur! },
      ],
    });
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setDialog(null);
    setToast(t('saved', { name: values.name }));
    router.refresh();
  }

  async function confirmStop() {
    if (!stop) return;
    setPending(true);
    setFailed(false);
    const res = await stopPack(String(stop.id));
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setStop(null);
    router.refresh();
  }

  return (
    <FounderShell active="pachete" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <PacksView
        rows={rows}
        onNew={openNew}
        onEdit={openEdit}
        onStop={(r) => {
          setFailed(false);
          setStop(r);
        }}
      />
      <DialogTrigger isOpen={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog ? (
          <PackDialog
            mode={dialog.id ? 'edit' : 'new'}
            title={dialog.title}
            values={values}
            errors={errors}
            resources={data.quotas.map((x) => ({ value: x.key, label: q.label(x.key) }))}
            pending={pending}
            failed={failed}
            mob={phone}
            onChange={setValues}
            onCancel={() => setDialog(null)}
            onSave={() => void save()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      <DialogTrigger isOpen={!!stop} onOpenChange={(o) => !o && setStop(null)}>
        {stop ? (
          <Dialog
            sheet={phone}
            tone="danger"
            title={t('stopTitle', { name: stop.name })}
            closeLabel={ui('close')}
            onClose={() => setStop(null)}
            footer={
              <>
                <Button variant="quiet" isDisabled={pending} onPress={() => setStop(null)}>
                  {t('edit.cancel')}
                </Button>
                <Button
                  variant="danger"
                  icon="lock"
                  isPending={pending}
                  onPress={() => void confirmStop()}
                >
                  {t('stopSubmit')}
                </Button>
              </>
            }
          >
            <p className="body">{t('stopBody')}</p>
            {failed && <p className="body-small">{t('edit.error')}</p>}
          </Dialog>
        ) : (
          <></>
        )}
      </DialogTrigger>
      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone="done"
            title={toast}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </FounderShell>
  );
}
