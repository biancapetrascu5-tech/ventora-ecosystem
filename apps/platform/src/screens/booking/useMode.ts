'use client';

import { useEffect, useState } from 'react';
import type { ScreenMode } from '@ventora/booking/ui';

/** desktop ≥ 1024, tablet ≥ 768 (the AppShell breakpoints), phone below. */
export function useMode(): ScreenMode {
  const [mode, setMode] = useState<ScreenMode>('desktop');
  useEffect(() => {
    const desk = window.matchMedia('(min-width: 1024px)');
    const tab = window.matchMedia('(min-width: 768px)');
    const update = () => setMode(desk.matches ? 'desktop' : tab.matches ? 'tablet' : 'mobile');
    update();
    desk.addEventListener('change', update);
    tab.addEventListener('change', update);
    return () => {
      desk.removeEventListener('change', update);
      tab.removeEventListener('change', update);
    };
  }, []);
  return mode;
}
