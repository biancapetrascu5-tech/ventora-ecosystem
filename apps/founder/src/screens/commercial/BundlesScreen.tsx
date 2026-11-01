'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogTrigger, FormField, Input, Notice, Toast } from '@ventora/ui';
import {
  BundlesView,
  StopBundleDialog,
  commercialStyles as cs,
  useIsPhone,
  type BundleCardData,
} from '@ventora/screens';
import { createBundle, newOffer, stopBundle, type BundlesData } from '@/server/commercial-actions';
import { FounderShell } from '../shell/FounderShell';
import { currentOffer, useBundleCards } from './bundleText';
import { dayDate } from './labels';

/* FounderBundles (Lotul 3.4, S117, D3-24): bundle-urile cu ofertele lor; „Bundle nou” (numele,
   apoi editorul primei oferte), „Ofertă nouă” / „Editează oferta” (editorul), „Oprește vânzarea”
   (confirmare, toast). Fiecare acțiune are rândul ei de audit pe persoana Founder. */

export function BundlesScreen({
  user,
  data,
  requestsBadge,
}: {
  user: { name: string };
  data: BundlesData;
  requestsBadge: number;
}) {
  const router = useRouter();
  const t = useTranslations('founder.bundles');
  const ui = useTranslations('ui');
  const phone = useIsPhone();
  const cards = useBundleCards()(data);
  const [stop, setStop] = useState<BundleCardData | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<{
    title: string;
    body?: string;
    tone: 'done' | 'danger';
  } | null>(null);

  async function openOffer(b: BundleCardData) {
    const res = await newOffer(b.id);
    if (res.ok) router.push(`/bundles/${res.versionId}`);
    else setToast({ tone: 'danger', title: t('error') });
  }

  async function confirmStop() {
    if (!stop) return;
    setPending(true);
    setFailed(false);
    const res = await stopBundle(stop.id);
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    const count = data.bundles
      .find((b) => b.id === stop.id)!
      .offers.reduce((s, o) => s + o.businesses, 0);
    setToast({
      tone: 'done',
      title: t('stopped', { name: stop.name }),
      body: t('stoppedBody', { count }),
    });
    setStop(null);
    router.refresh();
  }

  async function create() {
    if (!name.trim()) return;
    setPending(true);
    setFailed(false);
    const res = await createBundle(name);
    setPending(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    router.push(`/bundles/${res.versionId}`);
  }

  const stopData = stop ? data.bundles.find((b) => b.id === stop.id) : undefined;
  const stopOffer = stopData ? currentOffer(stopData).offer : null;

  return (
    <FounderShell active="planuri" title={t('title')} user={user} requestsBadge={requestsBadge}>
      <BundlesView
        bundles={cards}
        onNew={() => {
          setName('');
          setFailed(false);
          setCreating(true);
        }}
        onStop={(b) => {
          setFailed(false);
          setStop(b);
        }}
        onNewOffer={(b) => void openOffer(b)}
        onEditOffer={(b) => {
          const o = data.bundles.find((x) => x.id === b.id);
          const scheduled = o && currentOffer(o).offer;
          if (scheduled) router.push(`/bundles/${scheduled.id}`);
        }}
        onOpenVersion={(_, versionId) => router.push(`/bundles/${versionId}`)}
        onBusinesses={() => router.push('/businesses')}
      />
      <DialogTrigger isOpen={!!stop} onOpenChange={(o) => !o && setStop(null)}>
        {stop ? (
          <StopBundleDialog
            name={stop.name}
            body={
              stopOffer?.availableUntil
                ? t('stopDialog.body', {
                    date: new Intl.DateTimeFormat('ro-RO', {
                      day: 'numeric',
                      month: 'long',
                    }).format(dayDate(stopOffer.availableUntil)),
                  })
                : t('stopDialog.bodyOpen')
            }
            keep={t('stopDialog.keep', {
              count: stopData?.offers.reduce((s, o) => s + o.businesses, 0) ?? 0,
            })}
            pending={pending}
            failed={failed}
            mob={phone}
            onCancel={() => setStop(null)}
            onConfirm={() => void confirmStop()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
      <DialogTrigger isOpen={creating} onOpenChange={setCreating}>
        <Dialog
          sheet={phone}
          title={t('newDialog.title')}
          closeLabel={ui('close')}
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="quiet" isDisabled={pending} onPress={() => setCreating(false)}>
                {t('stopDialog.cancel')}
              </Button>
              <Button
                variant="primary"
                icon="plus"
                isPending={pending}
                isDisabled={!name.trim()}
                onPress={() => void create()}
              >
                {t('newDialog.submit')}
              </Button>
            </>
          }
        >
          {failed && <Notice tone="danger">{t('error')}</Notice>}
          <FormField label={t('newDialog.name')} isRequired hint={t('newDialog.nameHelp')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </Dialog>
      </DialogTrigger>
      {toast && (
        <div className={phone ? `${cs.toast} ${cs.toastMob}` : cs.toast}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.body}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </FounderShell>
  );
}
