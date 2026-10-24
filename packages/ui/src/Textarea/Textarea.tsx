'use client';

import { type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
  noResize?: boolean;
}

export function Textarea({ isInvalid, noResize, className, ...props }: TextareaProps) {
  return (
    <div className={cn(isInvalid && styles.invalid, noResize && styles.noResize)}>
      <textarea
        aria-invalid={isInvalid || undefined}
        className={cn(styles.root, className)}
        {...props}
      />
    </div>
  );
}
