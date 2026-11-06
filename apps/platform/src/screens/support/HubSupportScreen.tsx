'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { APPS, Toast, type AppName } from '@ventora/ui';
import {
  HubSupportView,
  NewRequestForm,
  supportStyles as s,
  useSupportUploads,
  useWhen,
  type HubSupportRow,
  type NewRequestErrors,
  type NewRequestValues,
} from '@ventora/screens';
import { SUPPORT_APPLICATIONS, initialSupportApplication } from '@ventora/support/apps';
import {
  finishSupportAttachment,
  sendSupportRequest,
  startSupportAttachment,
  type SupportListData,
} from '@/server/support-request-actions';

/* HubSupport (Lotul 4.6): „Solicitările mele” și „Solicitare nouă”. Pe telefon lista (/support)
   și formularul (/support/new) sunt ecrane separate; pe tabletă unul sub altul. Aplicația vine
   precompletată din adresă (?app=, pusă de AccountMenu după pagina de pornire, S-3). */

type Layout = 'desktop' | 'tablet' | 'phone';

function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>('desktop');
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const tablet = window.matchMedia('(max-width: 1099px)');
    const update = () => setLayout(phone.matches ? 'phone' : tablet.matches ? 'tablet' : 'desktop');
    update();
    phone.addEventListener('change', update);
    tablet.addEventListener('change', update);
    return () => {
      phone.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
    };
  }, []);
  return layout;
}

export function useAppOptions() {
  const t = useTranslations('support');
  return SUPPORT_APPLICATIONS.map((id) => ({
    value: id,
    label: id === 'platform' ? t('new.appPlatform') : (APPS[id as AppName]?.name ?? id),
  }));
}

export function useAppName() {
  const t = useTranslations('support');
  return (id: string) =>
    id === 'platform' ? t('new.appPlatform') : (APPS[id as AppName]?.name ?? id);
}

export function HubSupportScreen({
  data,
  initialApp,
  screen,
}: {
  data: SupportListData;
  initialApp: string | null;
  /** /support/new: on phones, the form screen. */
  screen: 'list' | 'new';
}) {
  const router = useRouter();
  const t = useTranslations('support');
  const ui = useTranslations('ui');
  const locale = useLocale();
  const when = useWhen();
  const layout = useLayout();
  const apps = useAppOptions();
  const appName = useAppName();
  const empty: NewRequestValues = {
    applicationId: initialSupportApplication(initialApp),
    subject: '',
    description: '',
    urgency: 'normal',
  };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<NewRequestErrors>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const draftId = data.draftId;
  const uploads = useSupportUploads({
    start: (file) => startSupportAttachment(draftId, file),
    finish: (fileId) => finishSupportAttachment(fileId),
    errors: {
      type: (file) => t('thread.error.type', { file }),
      size: (file) => t('thread.error.size', { file }),
      failed: (file) => t('error.upload', { file }),
    },
  });

  const rows: HubSupportRow[] = data.requests.map((r) => ({
    id: r.id,
    ref: r.ref,
    subject: r.subject,
    app: r.applicationId,
    appName: appName(r.applicationId),
    updated: when(new Date(r.lastMessageAt)),
    status: r.hubStatus,
    ...(data.manager
      ? { from: r.requesterUserId === data.userId ? t('thread.you') : r.requesterName }
      : {}),
  }));

  async function submit() {
    const next: NewRequestErrors = {
      subject: !values.subject.trim(),
      description: !values.description.trim(),
    };
    setErrors(next);
    if (next.subject || next.description || uploads.busy) return;
    setPending(true);
    const res = await sendSupportRequest({ id: draftId, ...values, fileIds: uploads.fileIds });
    setPending(false);
    if (!res.ok) {
      setErrors({ send: true });
      return;
    }
    setValues({ ...empty, applicationId: values.applicationId });
    uploads.reset();
    setSent(true);
    // a fresh list (with the new request) and a new draft id for the next one
    if (layout === 'phone' && screen === 'new') router.push('/support');
    router.refresh();
  }

  const form = (
    <NewRequestForm
      apps={apps}
      values={values}
      errors={errors}
      onChange={(v) => {
        setValues(v);
        if (errors.send) setErrors({});
      }}
      files={uploads.files}
      onFiles={uploads.onSelect}
      onRemoveFile={uploads.onRemove}
      onRetryFile={uploads.onRetry}
      pending={pending}
      onSubmit={() => void submit()}
      locale={locale}
    />
  );

  return (
    <>
      <HubSupportView
        layout={layout === 'phone' ? (screen === 'new' ? 'phone-form' : 'phone-list') : layout}
        rows={rows}
        manager={data.manager}
        form={form}
        onOpen={(row) => router.push(`/support/${row.ref}`)}
        onNew={() => router.push(`/support/new?app=${encodeURIComponent(values.applicationId)}`)}
      />
      {sent ? (
        <div className={layout === 'phone' ? `${s.toast} ${s.toastMob}` : s.toast}>
          <Toast
            tone="done"
            title={t('sent.title')}
            description={t('sent.body')}
            onDismiss={() => setSent(false)}
            dismissLabel={ui('close')}
          />
        </div>
      ) : null}
    </>
  );
}
