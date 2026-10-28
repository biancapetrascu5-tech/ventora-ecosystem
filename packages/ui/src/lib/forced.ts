/** Stare vizuală forțată, ca `state` din bundle.js (galerii, documentație, capturi). */
export type ForcedState = 'hover' | 'focus' | 'pressed';

/** Clasa CSS-module pentru o stare forțată: `isHover` / `isFocus` / `isPressed`. */
export function forced(styles: Record<string, string>, state?: ForcedState): string | undefined {
  if (!state) return undefined;
  return styles[`is${state[0]!.toUpperCase()}${state.slice(1)}`];
}
