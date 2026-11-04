'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Avatar,
  cn,
  Badge,
  Icon,
  IconButton,
  Sheet,
  SheetSection,
  fmtSize,
  type IconName,
  type UploadFile,
} from '@ventora/ui';

import s from './support.module.css';

/* Lot 4.6 — what HubSupportThread and FounderSupportInbox share: a message of the thread with its
   attachments (Msg), „Istoricul stării” (History) and the attachments' upload (useSupportUploads).
   The texts come already translated: the Hub in 6 languages, Founder in Romanian. */

export type SupportFileData = {
  id: string;
  name: string;
  /** „1,2 MB” */
  size: string;
  icon: IconName;
  /** The signed link (/files/<token>); without it the file still shows its name and size. */
  href?: string;
};

export type SupportMessageData = {
  id: string;
  /** The team's messages sit on `raised` (S111). */
  team: boolean;
  /** „Tu”, „Mihai Ionescu” */
  name: string;
  /** For the avatar's initials. */
  avatarName: string;
  /** „Echipa Ventora Systems”, „Salon Aurora · proprietar” */
  badge?: string;
  /** „27 oct., 09:14” */
  time: string;
  body: string;
  files: SupportFileData[];
};

export function fileIcon(contentType: string): IconName {
  return contentType === 'application/pdf' ? 'file-text' : 'image';
}

export function SupportMsg({
  m,
  mob,
  downloadLabel,
}: {
  m: SupportMessageData;
  mob?: boolean;
  downloadLabel: (file: string) => string;
}) {
  return (
    <article className={cn(s.msg, m.team && s.team, mob && s.msgMob)}>
      <div className={s.head}>
        <Avatar name={m.avatarName} size="sm" />
        <span className="body-strong">{m.name}</span>
        {m.badge ? <Badge>{m.badge}</Badge> : null}
        <span className={cn('caption', s.time)}>{m.time}</span>
      </div>
      <p className="body">{m.body}</p>
      {m.files.length ? (
        <div className={s.files}>
          {m.files.map((f) => (
            <span key={f.id} className={s.file}>
              <Icon icon={f.icon} size={16} />
              <span className="body-small">
                {f.name}
                <span className="muted"> · {f.size}</span>
              </span>
              <IconButton
                icon="download"
                size="sm"
                variant="quiet"
                label={downloadLabel(f.name)}
                isDisabled={!f.href}
                onPress={() => {
                  if (f.href) window.open(f.href, '_blank', 'noopener');
                }}
              />
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export type SupportHistoryData = { icon: IconName; text: string; time: string };

/** „Istoricul stării”, newest first. */
export function SupportHistory({
  title,
  items,
  mob,
}: {
  title: string;
  items: SupportHistoryData[];
  mob?: boolean;
}) {
  return (
    <Sheet className={mob ? s.sheetMob : undefined}>
      <SheetSection title={title}>
        <ol className={s.hist}>
          {items.map((h, i) => (
            <li key={i}>
              <Icon icon={h.icon} size={16} />
              <div>
                <p className="body-small">{h.text}</p>
                <p className="caption muted">{h.time}</p>
              </div>
            </li>
          ))}
        </ol>
      </SheetSection>
    </Sheet>
  );
}

export const SUPPORT_ACCEPT = '.png,.jpg,.jpeg,.pdf';
export const SUPPORT_MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf']);

export type StartUpload = (file: {
  name: string;
  contentType: string;
  sizeBytes: number;
}) => Promise<{ fileId: string; uploadUrl: string } | { error: 'type' | 'size' | 'failed' }>;
export type FinishUpload = (
  fileId: string,
) => Promise<{ ok: true } | { error: 'type' | 'size' | 'failed' }>;

type Tracked = UploadFile & { fileId?: string; source?: File };

/**
 * The attachments of one message: checked here for the person (PNG / JPEG / PDF, 10 MB — the
 * same rules the server applies again, D4-17), then: a signed upload URL from the server, the
 * bytes straight to the storage, the server's check of what arrived. `fileIds` are the ready ones.
 */
export function useSupportUploads(options: {
  start: StartUpload;
  finish: FinishUpload;
  errors: {
    type: (file: string) => string;
    size: (file: string) => string;
    failed: (file: string) => string;
  };
}) {
  const [files, setFiles] = useState<Tracked[]>([]);
  const seq = useRef(0);
  const { start, finish, errors } = options;

  const update = (id: string | number, patch: Partial<Tracked>) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const upload = useCallback(
    async (id: string | number, file: File) => {
      const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
      if (!TYPES.has(contentType)) {
        update(id, { status: 'error', error: errors.type(file.name), progress: undefined });
        return;
      }
      if (file.size > SUPPORT_MAX_BYTES) {
        update(id, { status: 'error', error: errors.size(file.name), progress: undefined });
        return;
      }
      update(id, { status: 'uploading', progress: 10, error: undefined });
      const started = await start({ name: file.name, contentType, sizeBytes: file.size }).catch(
        () => ({ error: 'failed' as const }),
      );
      if ('error' in started) {
        update(id, { status: 'error', error: errors[started.error](file.name) });
        return;
      }
      update(id, { progress: 40 });
      const put = await fetch(started.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: file,
      }).catch(() => null);
      if (!put?.ok) {
        update(id, { status: 'error', error: errors.failed(file.name) });
        return;
      }
      update(id, { progress: 80 });
      const done = await finish(started.fileId).catch(() => ({ error: 'failed' as const }));
      if ('error' in done) {
        update(id, { status: 'error', error: errors[done.error](file.name) });
        return;
      }
      update(id, { status: 'done', progress: undefined, fileId: started.fileId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, finish],
  );

  return {
    files: files as UploadFile[],
    fileIds: files.filter((f) => f.status === 'done' && f.fileId).map((f) => f.fileId!),
    busy: files.some((f) => f.status === 'uploading'),
    onSelect: (picked: File[]) => {
      for (const file of picked) {
        const id = `u${++seq.current}`;
        setFiles((list) => [
          ...list,
          { id, name: file.name, size: file.size, status: 'uploading', progress: 0, source: file },
        ]);
        void upload(id, file);
      }
    },
    onRemove: (f: UploadFile) => setFiles((list) => list.filter((x) => x.id !== f.id)),
    onRetry: (f: UploadFile) => {
      const tracked = files.find((x) => x.id === f.id);
      if (tracked?.source) void upload(tracked.id!, tracked.source);
    },
    reset: () => setFiles([]),
  };
}

export function sizeLabel(bytes: number, locale: string): string {
  return fmtSize(bytes, locale);
}
