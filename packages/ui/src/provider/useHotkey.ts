'use client';

import { useEffect } from 'react';

type ModifiedKey = `${'Ctrl' | 'Cmd' | 'Meta' | 'Alt' | 'Shift'}+${string}`;
type HotkeySpec = string | ModifiedKey;

export function useHotkey(key: HotkeySpec, handler: (e: KeyboardEvent) => void): void {
  useEffect(() => {
    const parts = key.split('+');
    const mainKey = parts[parts.length - 1].toLowerCase();
    const needCtrl = parts.includes('Ctrl');
    const needMeta = parts.includes('Cmd') || parts.includes('Meta');
    const needAlt = parts.includes('Alt');
    const needShift = parts.includes('Shift');

    const listener = (e: KeyboardEvent) => {
      if (needCtrl && !e.ctrlKey) return;
      if (needMeta && !e.metaKey) return;
      if (needAlt && !e.altKey) return;
      if (needShift && !e.shiftKey) return;
      if (e.key.toLowerCase() !== mainKey) return;
      handler(e);
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [key, handler]);
}
