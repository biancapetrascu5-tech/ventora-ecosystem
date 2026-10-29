'use client';

import { useEffect, useRef } from 'react';

/* Forced din preview.html (BarChart/LineChart): hover pe banda `hover` sau click pe
   „Vezi ca tabel”. Benzile și butonul sunt marcate cu data-chart-*. preview.html aplică
   starea după 400ms; aici o aplicăm imediat ce graficul există (măsurat, desenat), ca să nu
   depindă captura de cât durează hidratarea în dev. */
export function Forced({
  hover,
  table,
  children,
}: {
  hover?: number;
  table?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const bands = el.querySelectorAll('[data-chart-band]');
      const toggle = el.querySelector<HTMLElement>('[data-chart-toggle]');
      if ((hover != null && !bands[hover]) || (table && !toggle)) {
        raf = requestAnimationFrame(apply);
        return;
      }
      // Fără relatedTarget: în Next, <body> e randat de React și React ar ignora
      // un mouseover venit „din body” (preview.html montează React doar în #root).
      if (hover != null)
        bands[hover]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      if (table) toggle!.click();
    };
    if (hover != null || table) raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [hover, table]);
  return (
    <div ref={ref} style={{ minWidth: 0 }}>
      {children}
    </div>
  );
}
