'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Dialog,
  DialogTrigger,
  FileUpload,
  fmtSize,
  OrgSwitcher,
  PageHeader,
  Sheet,
  SheetSection,
  Toast,
  type UploadFile,
} from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import { confirmPhoto, removePhoto, startPhotoUpload } from '@/server/brand-actions';
import s from './profile-photo.module.css';

/*
 * S147 (HubAccount, „Poza de profil”, 13.11): Contul tău › Profil și preferințe — the photo:
 * upload, replace, remove (with confirmation); PNG or JPG, at most 5 MB, cut round. It shows in the
 * account menu and, when the business has no logo, in the business switcher (the preview below).
 * The rest of „Profil și preferințe” (theme, language) is not built yet: this page has the photo.
 */

const TYPES = ['image/png', 'image/jpeg'];
const MAX_BYTES = 5 * 1024 * 1024;

export type ProfilePhotoData = {
  name: string;
  /** `/account/photo/<id>` or null. */
  photo: string | null;
  /** The active business, for the switcher preview. */
  org: { name: string; role: string; logo?: string } | null;
};

export function ProfilePhotoScreen({ data }: { data: ProfilePhotoData }) {
  const t = useTranslations('hub.account.photo');
  const nav = useTranslations('hub.nav');
  const biz = useTranslations('hub.business');
  const ui = useTranslations('ui');
  const up = useTranslations('ui.upload');
  const locale = useLocale();
  const phone = useIsPhone();
  const router = useRouter();
  const [photo, setPhoto] = useState(data.photo);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; title: string } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const row = (patch: Partial<UploadFile>): UploadFile => ({
      id: file.name,
      name: file.name,
      size: file.size,
      status: 'uploading',
      ...patch,
    });
    const failed = (error: string) => setFiles([row({ status: 'error', error })]);
    if (!TYPES.includes(file.type)) return failed(t('errType', { name: file.name }));
    if (file.size > MAX_BYTES) {
      return failed(t('errSize', { name: file.name, size: fmtSize(file.size, locale) }));
    }
    setFiles([row({ progress: 30 })]);
    const start = await startPhotoUpload({ contentType: file.type, sizeBytes: file.size });
    if (!start.ok) {
      return failed(
        start.reason === 'type'
          ? t('errType', { name: file.name })
          : start.reason === 'size'
            ? t('errSize', { name: file.name, size: fmtSize(file.size, locale) })
            : biz('logo.uploadFailed'),
      );
    }
    try {
      const res = await fetch(start.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      return failed(biz('logo.uploadFailed'));
    }
    setFiles([row({ progress: 80 })]);
    const done = await confirmPhoto(start.fileId);
    if (!done.ok) {
      return failed(
        done.reason === 'type' ? t('errType', { name: file.name }) : biz('logo.uploadFailed'),
      );
    }
    setFiles([]);
    setPhoto(done.src);
    setToast({ tone: 'done', title: t('saved') });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await removePhoto();
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setToast({ tone: 'danger', title: biz('logo.uploadFailed') });
      return;
    }
    setPhoto(null);
    setToast({ tone: 'done', title: t('removed') });
    router.refresh();
  }

  return (
    <div className={s.wrap}>
      <PageHeader title={nav('profile')} />
      <div className={s.body}>
        <Sheet>
          <SheetSection title={t('title')} description={t('lead')}>
            <div className={s.stack}>
              <div className={s.pic}>
                <div className={s.preview}>
                  {photo ? <img src={photo} alt="" /> : <Avatar name={data.name} size="xl" />}
                </div>
                <div className={s.text}>
                  <p className={`body-small ${s.m0} ${s.secondary}`}>
                    {photo ? t('rules') : t('none')}
                  </p>
                  {!photo && <p className={`caption ${s.m0} ${s.muted}`}>{t('rules')}</p>}
                  {files.length === 0 &&
                    (photo ? (
                      <div className={s.buttons}>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="upload"
                          onPress={() => pick.current?.click()}
                        >
                          {t('replace')}
                        </Button>
                        <Button
                          variant="quiet"
                          size="sm"
                          icon="trash-2"
                          onPress={() => setConfirming(true)}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button
                          variant="primary"
                          size="sm"
                          icon="upload"
                          onPress={() => pick.current?.click()}
                        >
                          {t('upload')}
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
              {files.length > 0 && (
                <FileUpload
                  accept="image/png,image/jpeg"
                  hint={t('rules')}
                  isInvalid={files.some((f) => f.status === 'error')}
                  files={files}
                  locale={locale}
                  onSelect={(list) => list[0] && void upload(list[0])}
                  onRemove={() => setFiles([])}
                  onRetry={() => {
                    setFiles([]);
                    pick.current?.click();
                  }}
                  labels={{
                    dropFiles: up('dropFiles'),
                    dropNow: up('dropNow'),
                    browse: up('browse'),
                    maxSize: (size) => up('maxSize', { size }),
                    uploaded: up('uploaded'),
                    retry: up('retry'),
                    remove: up('remove'),
                  }}
                />
              )}
              <input
                ref={pick}
                type="file"
                accept="image/png,image/jpeg"
                className={s.hidden}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
              {data.org && (
                <div className={s.switcher}>
                  <p className={`caption ${s.m0} ${s.muted}`}>{biz('preview')}</p>
                  <div className={s.switcherBox}>
                    <OrgSwitcher
                      orgs={[{ id: 'a', ...data.org }]}
                      currentId="a"
                      avatar={photo ?? undefined}
                      labels={{
                        switchBusiness: ui('switchBusiness'),
                        yourBusinesses: ui('yourBusinesses'),
                        findBusiness: ui('findBusiness'),
                        noResultsFor: (q: string) => ui('noResultsFor', { q }),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </SheetSection>
        </Sheet>
      </div>

      <DialogTrigger isOpen={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <Dialog
          sheet={phone}
          title={t('removeTitle')}
          description={t('removeBody')}
          closeLabel={ui('close')}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="quiet" isDisabled={busy} onPress={() => setConfirming(false)}>
                {biz('cancel')}
              </Button>
              <Button
                variant="danger"
                icon="trash-2"
                isPending={busy}
                onPress={() => void remove()}
              >
                {t('remove')}
              </Button>
            </>
          }
        />
      </DialogTrigger>

      {toast && (
        <div className={s.toast}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </div>
  );
}
