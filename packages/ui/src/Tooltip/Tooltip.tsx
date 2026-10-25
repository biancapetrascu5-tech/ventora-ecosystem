'use client';

import { Tooltip as RACTooltip, TooltipTrigger, type Placement } from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
  placement?: Placement;
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 700,
  className,
}: TooltipProps) {
  return (
    <TooltipTrigger delay={delay}>
      {children}
      <RACTooltip placement={placement} className={cn(styles.tooltip, className)}>
        {content}
      </RACTooltip>
    </TooltipTrigger>
  );
}
