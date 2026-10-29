/* eslint-disable i18next/no-literal-string -- etichetele cadrelor din preview.html (documentație) */
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import ro from '@ventora/i18n/messages/ro.json';
import f from './frames.module.css';

/* Ecranele (Faza 2) în galerie: textele vin din chei, mereu în română, ca primul cadru din
   preview.html — indiferent de limba aleasă în browser. */
export function RoIntl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ro" messages={ro} timeZone="Europe/Bucharest">
      {children}
    </NextIntlClientProvider>
  );
}

/* .scr > .scr-row > .scr-d: cadrul de 1280 al ecranelor, cu înălțimea din preview. */
export function DesktopFrames({
  title,
  height,
  render,
}: {
  title: string;
  height: number;
  render: (theme: 'light' | 'dark') => ReactNode;
}) {
  return (
    <RoIntl>
      <div className={f.base}>
        <div className={f.scrWrap}>
          <p className="heading">{title}</p>
          {(['light', 'dark'] as const).map((th) => (
            <div className={f.scrRow} key={th}>
              <div>
                <p className={`caption ${f.scrLab}`}>
                  Desktop · 1280 · {th === 'light' ? 'Light' : 'Dark'}
                </p>
                <div
                  className={`${f.scr} ${f.scrD}`}
                  data-gallery-frame
                  data-theme={th}
                  style={{ height }}
                >
                  {render(th)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </RoIntl>
  );
}
