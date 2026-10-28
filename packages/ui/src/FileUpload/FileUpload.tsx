'use client';

import { useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './FileUpload.module.css';

export interface UploadFile {
  id?: string | number;
  name: string;
  size?: number;
  status: 'done' | 'uploading' | 'error';
  /** 0–100, la `uploading`. */
  progress?: number;
  /** Mesajul afișat la `error`. */
  error?: string;
}

export interface FileUploadLabels {
  /** S.dropFiles, ex. „Trage fișierele aici sau”. */
  dropFiles: string;
  /** S.dropNow, ex. „Dă drumul ca să încarci”. */
  dropNow: string;
  /** S.browse, ex. „alege-le de pe dispozitiv”. */
  browse: string;
  /** S.maxSize, ex. (size) => `Până la ${size} de fiecare fișier`. */
  maxSize: (size: string) => string;
  /** S.uploaded, ex. „Încărcat”. */
  uploaded: string;
  /** S.retry, ex. „Încearcă din nou”. */
  retry: string;
  /** S.remove, ex. „Elimină”. */
  remove: string;
}

export interface FileUploadProps {
  files?: UploadFile[];
  onSelect?: (files: File[]) => void;
  onRemove?: (file: UploadFile) => void;
  onRetry?: (file: UploadFile) => void;
  accept?: string;
  multiple?: boolean;
  /** În octeți; apare în textul de ajutor. */
  maxSize?: number;
  hint?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Stare vizuală forțată; `drag` = zona în care se trage un fișier. */
  state?: ForcedState | 'drag';
  labels: FileUploadLabels;
  /** Limba pentru mărimea fișierelor (ro, en, …). */
  locale?: string;
  id?: string;
  'aria-describedby'?: string;
  className?: string;
}

/* fmtSize din bundle.js */
export function fmtSize(b: number | undefined, locale = 'ro'): string {
  if (b == null) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, { maximumFractionDigits: i ? 1 : 0 }).format(n)} ${u[i]}`;
}

/* FileUpload din bundle.js: .v-upload > zona punctată + lista .v-upload__file. */
export function FileUpload({
  files = [],
  onSelect,
  onRemove,
  onRetry,
  accept,
  multiple = true,
  maxSize,
  hint,
  isDisabled,
  isInvalid,
  state,
  labels,
  locale = 'ro',
  id,
  'aria-describedby': describedBy,
  className,
}: FileUploadProps) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isDrag = drag || state === 'drag';
  const take = (list: FileList | null) => {
    if (!isDisabled && list && list.length) onSelect?.(Array.from(list));
  };
  const hintText = [hint, maxSize ? labels.maxSize(fmtSize(maxSize, locale)) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={cn(styles.root, className)}>
      <div
        className={cn(
          styles.zone,
          isDrag && styles.isDrag,
          isDisabled && styles.isDisabled,
          isInvalid && styles.isError,
          state !== 'drag' && forced(styles, state),
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          take(e.dataTransfer.files);
        }}
      >
        <Icon icon="upload" size={20} className={styles.icon} />
        <p className="body">
          {isDrag ? (
            labels.dropNow
          ) : (
            <>
              {labels.dropFiles}{' '}
              <button
                type="button"
                id={id}
                className={styles.link}
                onClick={() => input.current?.click()}
                disabled={isDisabled}
                aria-describedby={describedBy}
              >
                {labels.browse}
              </button>
            </>
          )}
        </p>
        {hintText && <p className={cn(styles.hint, 'body-small')}>{hintText}</p>}
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className={styles.list}>
          {files.map((f) => (
            <li
              key={f.id ?? f.name}
              className={cn(styles.file, f.status === 'error' && styles.fileError)}
            >
              <Icon
                icon={
                  f.status === 'done'
                    ? 'circle-check'
                    : f.status === 'error'
                      ? 'circle-alert'
                      : 'file'
                }
                size={16}
                className={styles.ficon}
              />
              <div className={styles.fmain}>
                <div className={styles.frow}>
                  <span className={cn('body-strong', styles.truncate)}>{f.name}</span>
                  <span className={cn('body-small', styles.fmeta)}>
                    {f.status === 'done'
                      ? labels.uploaded
                      : f.status === 'uploading'
                        ? `${Math.round(f.progress ?? 0)}%`
                        : fmtSize(f.size, locale)}
                  </span>
                </div>
                {f.status === 'uploading' && (
                  <div
                    className={styles.progress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(f.progress ?? 0)}
                    aria-label={f.name}
                  >
                    <span className={styles.fill} style={{ width: `${f.progress ?? 0}%` }} />
                  </div>
                )}
                {f.status === 'error' && (
                  <p className={cn(styles.ferror, 'caption')}>
                    <span>{f.error}</span>
                  </p>
                )}
              </div>
              {f.status === 'error' && onRetry && (
                <button
                  type="button"
                  className={styles.btn}
                  aria-label={labels.retry}
                  title={labels.retry}
                  onClick={() => onRetry(f)}
                >
                  <Icon icon="rotate-ccw" size={14} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className={styles.btn}
                  aria-label={`${labels.remove} ${f.name}`}
                  title={labels.remove}
                  onClick={() => onRemove(f)}
                >
                  <Icon icon="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
