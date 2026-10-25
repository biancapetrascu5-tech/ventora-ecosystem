'use client';

import {
  Dialog as RACDialog,
  DialogTrigger as RACDialogTrigger,
  Modal,
  ModalOverlay,
  Heading,
  Button as RACButton,
} from 'react-aria-components';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import styles from './Dialog.module.css';

export type DialogTone = 'default' | 'danger' | 'attention';

export interface DialogProps {
  title: string;
  children: React.ReactNode;
  tone?: DialogTone;
  isDismissable?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

export { RACDialogTrigger as DialogTrigger };

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className={styles.header}>{children}</div>;
}

export function DialogBody({ children }: { children: React.ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export function Dialog({
  title,
  children,
  tone = 'default',
  isDismissable = true,
  footer,
  className,
}: DialogProps) {
  return (
    <ModalOverlay className={styles.overlay} isDismissable={isDismissable}>
      <Modal className={cn(styles.modal, styles[tone])}>
        <RACDialog className={cn(styles.dialog, className)} aria-label={title}>
          {({ close }) => (
            <>
              <div className={styles.header}>
                <Heading slot="title" className={styles.title}>
                  {title}
                </Heading>
                {isDismissable && (
                  <RACButton onPress={close} className={styles.closeBtn} aria-label="Închide">
                    <X size={20} strokeWidth={1.75} />
                  </RACButton>
                )}
              </div>
              <div className={styles.body}>{children}</div>
              {footer && <div className={styles.footer}>{footer}</div>}
            </>
          )}
        </RACDialog>
      </Modal>
    </ModalOverlay>
  );
}
