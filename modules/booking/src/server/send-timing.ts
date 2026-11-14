/* Lot B.14c — when the reminder and the thanks leave: the limits the founder chose (13.11). Pure
   (no database), so the screen (modules/booking/src/ui) checks the hours with the same numbers. */

export const THANKS_WHEN = ['now', 'after', 'next_day'] as const;
export type ThanksWhen = (typeof THANKS_WHEN)[number];

export const SEND_TIMING_LIMITS = {
  /** The reminder leaves N hours before the visit. */
  reminderHours: { min: 2, max: 72 },
  /** The thanks N hours after the visit ('after'). */
  thanksHours: { min: 1, max: 48 },
  /** „A doua zi, la 10:00”, in the business's zone. */
  nextDayAt: '10:00',
} as const;
