import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import pill from '../StatusPill/StatusPill.module.css';
import styles from './AccessBadge.module.css';

/**
 * S147 (13.11): `suspended` („Oprită temporar”, afacerea e suspendată) și `soon` („În curând”);
 * `notInRole` se citește „Acces la cerere”, `notInPlan` „Disponibilă pentru activare”.
 */
export type AccessState =
  'available' | 'unavailable' | 'notInRole' | 'notInPlan' | 'suspended' | 'soon';

/** S.access_available … S.access_soon. */
export type AccessLabels = Record<AccessState, string>;

export const ACCESS_ICON: Record<AccessState, IconName> = {
  available: 'circle-check',
  unavailable: 'wrench',
  notInRole: 'lock',
  notInPlan: 'package',
  suspended: 'circle-alert',
  soon: 'clock',
};

export interface AccessBadgeProps {
  state?: AccessState;
  labels: AccessLabels;
  className?: string;
}

/* AccessBadge din bundle.js: pastila neutră cu starea accesului la o aplicație; pe lățimi mici
   textul trece pe rândul următor. */
export function AccessBadge({ state = 'available', labels, className }: AccessBadgeProps) {
  return (
    <span className={cn(pill.root, styles.access, 'caption', className)}>
      <Icon icon={ACCESS_ICON[state]} size={12} strokeWidth={2.25} />
      <span>{labels[state]}</span>
    </span>
  );
}
