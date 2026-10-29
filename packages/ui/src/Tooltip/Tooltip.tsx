'use client';

import { Tooltip as RACTooltip, TooltipTrigger, type Placement } from 'react-aria-components';
import { Kbd } from '../Kbd/Kbd';
import { cn } from '../lib/cn';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: string;
  /** Scurtătura afișată după text (Kbd), ex. ["mod", "K"]. */
  shortcut?: string[];
  children: React.ReactElement;
  placement?: Placement;
  /** Întârzierea la hover/focus, în ms (bundle: 400). */
  delay?: number;
  /** Deschis permanent (documentație, galerii). */
  isOpen?: boolean;
  className?: string;
}

/** Bula tooltip-ului, fără poziționare (.v-tooltip static). */
export function TooltipBubble({
  content,
  shortcut,
  className,
}: {
  content: string;
  shortcut?: string[];
  className?: string;
}) {
  return (
    <span role="tooltip" className={cn(styles.tooltip, styles.static, 'caption', className)}>
      {content}
      {shortcut && <Kbd keys={shortcut} />}
    </span>
  );
}

/* Tooltip din bundle.js: bulă inversată (tooltip-bg / tooltip-ink), shadow-2, apare după 400 ms. */
export function Tooltip({
  content,
  shortcut,
  children,
  placement = 'top',
  delay = 400,
  isOpen,
  className,
}: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} isOpen={isOpen}>
      {children}
      <RACTooltip
        placement={placement}
        offset={8}
        className={cn(styles.tooltip, 'caption', className)}
      >
        {content}
        {shortcut && <Kbd keys={shortcut} />}
      </RACTooltip>
    </TooltipTrigger>
  );
}
