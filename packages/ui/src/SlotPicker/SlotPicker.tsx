'use client';

import { cn } from '../lib/cn';
import styles from './SlotPicker.module.css';

export interface SlotItem {
  time: string;
  available: boolean;
}

export interface SlotPickerProps {
  label: string;
  slots: SlotItem[];
  value?: string;
  onChange?: (time: string) => void;
  className?: string;
}

/* SlotPicker din bundle.js: grilă de ore (.v-slots), ora aleasă pe primary, cele ocupate tăiate. */
export function SlotPicker({ slots, value, onChange, label, className }: SlotPickerProps) {
  return (
    <div className={cn(styles.slots, className)} role="radiogroup" aria-label={label}>
      {slots.map((s) => {
        const on = s.time === value;
        return (
          <button
            key={s.time}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!s.available}
            className={cn(styles.slot, 'v-num', on && styles.isOn)}
            onClick={() => onChange?.(s.time)}
          >
            <span className="body-strong">{s.time}</span>
          </button>
        );
      })}
    </div>
  );
}
