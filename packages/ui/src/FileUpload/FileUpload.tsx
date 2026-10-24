'use client';

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, File, X } from 'lucide-react';
import { cn } from '../lib/cn';
import styles from './FileUpload.module.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FileUploadProps {
  title?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  isDisabled?: boolean;
  isInvalid?: boolean;
  onChange?: (files: File[]) => void;
  removeLabel?: string;
  className?: string;
}

export function FileUpload({
  title,
  hint,
  accept,
  multiple = false,
  maxSize,
  isDisabled,
  isInvalid,
  onChange,
  removeLabel = 'Elimină',
  className,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    const filtered = maxSize ? arr.filter((f) => f.size <= maxSize) : arr;
    const next = multiple ? [...files, ...filtered] : filtered.slice(0, 1);
    setFiles(next);
    onChange?.(next);
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onChange?.(next);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!isDisabled) addFiles(e.dataTransfer.files);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className={cn(styles.root, className)}>
      <label
        className={cn(
          styles.dropzone,
          dragOver && styles.dragOver,
          focused && styles.focused,
          isDisabled && styles.disabled,
          isInvalid && styles.invalid
        )}
        onDragOver={(e) => { e.preventDefault(); if (!isDisabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <UploadCloud size={24} strokeWidth={1.5} className={styles.icon} aria-hidden />
        {title && <span className={styles.title}>{title}</span>}
        {hint && <span className={styles.hint}>{hint}</span>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={isDisabled}
          onChange={handleChange}
          className={styles.input}
        />
      </label>
      {files.length > 0 && (
        <ul className={styles.fileList} aria-label="Fișiere selectate">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className={styles.fileItem}>
              <File size={14} aria-hidden className={styles.icon} />
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatBytes(file.size)}</span>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeFile(i)}
                aria-label={`${removeLabel} ${file.name}`}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
