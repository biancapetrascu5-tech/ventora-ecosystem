import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import pill from '../StatusPill/StatusPill.module.css';
import styles from './AccessBadge.module.css';

export type AccessState = 'available' | 'unavailable' | 'notInRole' | 'notInPlan';

/** S.access_available, S.access_unavailable, S.access_notInRole, S.access_notInPlan. */
export type AccessLabels = Record<AccessState, string>;

export const ACCESS_ICON: Record<AccessState, IconName> = {
  available: 'circle-check',
  unavailable: 'wrench',
  notInRole: 'lock',
  notInPlan: 'package',
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
