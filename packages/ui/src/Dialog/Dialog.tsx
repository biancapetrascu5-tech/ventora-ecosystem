'use client';

import { useId, type ReactNode } from 'react';
import {
  Dialog as RACDialog,
  DialogTrigger as RACDialogTrigger,
  Modal,
  ModalOverlay,
  Heading,
} from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { cn } from '../lib/cn';
import styles from './Dialog.module.css';

export type DialogTone = 'default' | 'danger' | 'attention' | 'done';

export interface DialogProps {
  title: string;
  /** Propoziția de sub titlu (.v-dialog__desc). */
  description?: ReactNode;
  /** Conținutul (.v-dialog__body); poate lipsi. */
  children?: ReactNode;
  tone?: DialogTone;
  /** Iconița de 20px în cercul de 40px din antet. */
  icon?: IconName;
  size?: 'md' | 'wide';
  /** Fără „x” și fără închidere la Esc / clic pe fundal. */
  isDismissable?: boolean;
  /** Eticheta butonului „x” (S.close). */
  closeLabel?: string;
  footer?: ReactNode;
  /** Panoul fără fundal și fără fereastră modală (documentație, ecrane compuse). */
  inline?: boolean;
  /** Doar la `inline`: apăsarea pe „x”. */
  onClose?: () => void;
  /** Foaie de jos (telefon): lățime întreagă, colțuri doar sus, butoanele unul sub altul. */
  sheet?: boolean;
  className?: string;
}

export { RACDialogTrigger as DialogTrigger };

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className={styles.head}>{children}</div>;
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={styles.foot}>{children}</div>;
}

function Panel({
  descId,
  description,
  children,
  tone,
  icon,
  footer,
  isDismissable,
  closeLabel,
  onClose,
  heading,
}: Omit<DialogProps, 'size' | 'inline' | 'className'> & {
  titleId: string;
  descId: string;
  heading: ReactNode;
}) {
  return (
    <>
      <div className={styles.head}>
        {icon && (
          <span className={cn(styles.icon, tone && styles[`icon-${tone}`])} aria-hidden="true">
            <Icon icon={icon} size={20} />
          </span>
        )}
        <div className={styles.titles}>
          {heading}
          {description && (
            <p id={descId} className={cn(styles.desc, 'body')}>
              {description}
            </p>
          )}
        </div>
        {isDismissable && (
          <span className={styles.x}>
            <IconButton icon="x" label={closeLabel ?? ''} variant="quiet" onPress={onClose} />
          </span>
        )}
      </div>
      {children && <div className={styles.body}>{children}</div>}
      {footer && <div className={styles.foot}>{footer}</div>}
    </>
  );
}

/* Dialog din bundle.js: .v-dialog (raised, shadow-3), antet cu iconiță, corp, subsol cu linie;
   pe telefon devine foaie de jos cu butoanele unul sub altul. */
export function Dialog({
  title,
  description,
  children,
  tone = 'default',
  icon,
  size = 'md',
  isDismissable = true,
  closeLabel,
  footer,
  inline,
  onClose,
  sheet,
  className,
}: DialogProps) {
  const base = 'd' + useId().replace(/:/g, '');
  const titleId = `${base}-t`;
  const descId = `${base}-d`;
  const cls = cn(
    styles.dialog,
    size === 'wide' && styles.wide,
    inline && styles.inline,
    sheet && styles.sheet,
    className,
  );

  if (inline) {
    return (
      <div
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cls}
      >
        <Panel
          titleId={titleId}
          descId={descId}
          title={title}
          description={description}
          tone={tone}
          icon={icon}
          footer={footer}
          isDismissable={isDismissable}
          closeLabel={closeLabel}
          onClose={onClose}
          heading={
            <h2 id={titleId} className="title">
              {title}
            </h2>
          }
        >
          {children}
        </Panel>
      </div>
    );
  }

  return (
    <ModalOverlay className={styles.overlay} isDismissable={isDismissable}>
      <Modal className={styles.modal}>
        <RACDialog
          role={tone === 'danger' ? 'alertdialog' : 'dialog'}
          aria-describedby={description ? descId : undefined}
          className={cls}
        >
          {({ close }) => (
            <Panel
              titleId={titleId}
              descId={descId}
              title={title}
              description={description}
              tone={tone}
              icon={icon}
              footer={footer}
              isDismissable={isDismissable}
              closeLabel={closeLabel}
              onClose={close}
              heading={
                <Heading slot="title" id={titleId} className="title">
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
