'use client';

import { useId, type ReactNode } from 'react';
import {
  Dialog as RACDialog,
  DialogTrigger as RACDrawerTrigger,
  Modal,
  ModalOverlay,
  Heading,
} from 'react-aria-components';
import { IconButton } from '../IconButton/IconButton';
import { cn } from '../lib/cn';
import styles from './Drawer.module.css';

export { RACDrawerTrigger as DrawerTrigger };

export function DrawerHeader({ children }: { children: ReactNode }) {
  return <div className={styles.head}>{children}</div>;
}

export function DrawerBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <div className={styles.foot}>{children}</div>;
}

export interface DrawerProps {
  title: string;
  /** Rândul de sub titlu (.v-drawer__sub). */
  subtitle?: ReactNode;
  /** Butoane în antet, înainte de „x”. */
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Lățimea panoului (implicit --drawer-width). */
  width?: number | string;
  /** `side` = lățimea de tabletă; `full` = tot ecranul, cu săgeată înapoi; `auto` = după ecran. */
  layout?: 'auto' | 'side' | 'full';
  isDismissable?: boolean;
  /** Panoul stă în containerul părinte (position: relative), nu peste pagină. */
  contained?: boolean;
  /** Doar la `contained`: închiderea (x, săgeată, clic pe fundal). */
  onClose?: () => void;
  /** Varianta modală fără DialogTrigger: deschiderea controlată. */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** S.close / S.back. */
  closeLabel?: string;
  backLabel?: string;
  className?: string;
}

function Panel({
  subtitle,
  actions,
  children,
  footer,
  isDismissable,
  closeLabel,
  backLabel,
  onClose,
  heading,
}: Omit<DrawerProps, 'width' | 'layout' | 'contained' | 'className' | 'isOpen' | 'onOpenChange'> & {
  heading: ReactNode;
}) {
  return (
    <>
      <div className={styles.head}>
        <span className={styles.back}>
          <IconButton
            icon="arrow-left"
            label={backLabel ?? ''}
            size="lg"
            variant="quiet"
            onPress={onClose}
          />
        </span>
        <div className={styles.titles}>
          {heading}
          {subtitle && <p className={cn(styles.sub, 'body-small')}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
        {isDismissable && (
          <span className={styles.x}>
            <IconButton icon="x" label={closeLabel ?? ''} variant="quiet" onPress={onClose} />
          </span>
        )}
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.foot}>{footer}</div>}
    </>
  );
}

/* Drawer din bundle.js: panou lateral (.v-drawer) cu antet de 56px, corp și subsol cu linie;
   sub 768px (sau layout="full") ia tot ecranul, cu săgeată înapoi în locul lui „x”. */
export function Drawer({
  title,
  subtitle,
  actions,
  children,
  footer,
  width,
  layout = 'auto',
  isDismissable = true,
  contained,
  onClose,
  isOpen,
  onOpenChange,
  closeLabel,
  backLabel,
  className,
}: DrawerProps) {
  const base = 'dr' + useId().replace(/:/g, '');
  const cls = cn(
    styles.drawer,
    layout === 'side' && styles.side,
    layout === 'full' && styles.full,
    className,
  );
  const style = width != null ? { width } : undefined;
  const common = { title, subtitle, actions, footer, isDismissable, closeLabel, backLabel };

  if (contained) {
    return (
      <div
        className={cn(styles.overlay, styles.contained)}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <aside role="dialog" aria-labelledby={`${base}-t`} className={cls} style={style}>
          <Panel
            {...common}
            onClose={onClose}
            heading={
              <h2 id={`${base}-t`} className={cn('title', styles.truncate)}>
                {title}
              </h2>
            }
          >
            {children}
          </Panel>
        </aside>
      </div>
    );
  }

  return (
    <ModalOverlay
      className={styles.overlay}
      isDismissable={isDismissable}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal className={styles.modal}>
        <RACDialog className={cls} style={style}>
          {({ close }) => (
            <Panel
              {...common}
              onClose={close}
              heading={
                <Heading slot="title" className={cn('title', styles.truncate)}>
                  {title}
                </Heading>
              }
            >
              {children}
            </Panel>
          )}
        </RACDialog>
      </Modal>
    </ModalOverlay>
  );
}
