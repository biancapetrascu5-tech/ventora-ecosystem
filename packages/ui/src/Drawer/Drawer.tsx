'use client';

import {
  Dialog as RACDialog,
  DialogTrigger as RACDrawerTrigger,
  Modal,
  ModalOverlay,
  Heading,
  Button as RACButton,
} from 'react-aria-components';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import styles from './Drawer.module.css';

export { RACDrawerTrigger as DrawerTrigger };

export function DrawerHeader({ children }: { children: React.ReactNode }) {
  return <div className={styles.header}>{children}</div>;
}

export function DrawerBody({ children }: { children: React.ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export interface DrawerProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isDismissable?: boolean;
  className?: string;
}

export function Drawer({ title, children, footer, isDismissable = true, className }: DrawerProps) {
  return (
    <ModalOverlay className={styles.overlay} isDismissable={isDismissable}>
      <Modal className={cn(styles.modal, className)}>
        <RACDialog className={styles.dialog} aria-label={title}>
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
