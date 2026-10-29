/* eslint-disable i18next/no-literal-string -- etichetele cadrelor din preview.html (documentație) */
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import hub from '@ventora/i18n/messages/ro.json';
import founder from '@ventora/i18n/messages/founder/ro.json';
import f from './frames.module.css';

/* Copia din apps/platform (galeriile Founder stau în aplicația Founder). Texte: catalogul RO al
   Hub-ului (auth.*, ui.*) + messages/founder/ro.json, ca în src/i18n/request.ts. */
export function RoIntl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="ro"
      messages={{ ...hub, ...founder }}
      timeZone="Europe/Bucharest"
    >
      {children}
    </NextIntlClientProvider>
  );
}

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
                  style={{ height, position: 'relative' }}
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
