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

export function SlotPicker({ label, slots, value, onChange, className }: SlotPickerProps) {
  return (
    <div className={cn(styles.root, className)} role="listbox" aria-label={label}>
      {slots.map((slot) => {
        const selected = slot.time === value;
        return (
          <button
            key={slot.time}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={!slot.available}
            disabled={!slot.available}
            className={cn(
              styles.slot,
              selected && styles.selected,
              !slot.available && styles.unavailable,
            )}
            onClick={() => slot.available && onChange?.(slot.time)}
          >
            {slot.time}
          </button>
        );
      })}
    </div>
  );
}
