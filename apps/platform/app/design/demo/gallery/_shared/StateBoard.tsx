import type { ReactNode } from 'react';
import { RoIntl } from './ScreenFrames';
import s from './states.module.css';

export type StateBox = [label: string, content: ReactNode, wide?: boolean];

/* Panoul „Stări” din preview.html (.sms-states > .tfa-states > .sms-box): fiecare stare în
   coloana formularului, în light și dark. Pentru revizuire; nu intră în visual-check. */
export function StateBoard({
  title,
  boxes,
  column = 400,
  founder,
}: {
  title: string;
  boxes: (theme: 'light' | 'dark') => StateBox[];
  column?: number;
  founder?: boolean;
}) {
  return (
    <RoIntl founder={founder}>
      {(['light', 'dark'] as const).map((th) => (
        <div key={th} className={s.board} data-theme={th}>
          <p className="heading">
            {title} · {th === 'light' ? 'Light' : 'Dark'}
          </p>
          <div className={s.grid}>
            {boxes(th).map(([label, content, wide]) => (
              <div
                key={label}
                className={s.box}
                style={wide ? { gridColumn: 'span 2' } : undefined}
              >
                <p className={`caption ${s.label}`}>{label}</p>
                <div className={s.body}>
                  <div className={s.col} style={{ ['--col' as string]: `${column}px` }}>
                    {content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </RoIntl>
  );
}
