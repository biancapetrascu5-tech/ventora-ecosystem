/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AttentionList } from '@ventora/ui';
import type { AttentionItem } from '@ventora/ui';
import f from '../_shared/frames.module.css';

// preview.html → .al → section.al-frame (Light, Dark) → al-row cu trei coloane
const TONES: AttentionItem[] = [
  {
    id: 'n',
    icon: 'clock',
    title: 'Implicit (fără tone): neutru',
    meta: 'Ce are nevoie de tine, dar nu acum: confirmări, cereri, telefon vechi',
  },
  {
    id: 'a',
    icon: 'smartphone',
    tone: 'attention',
    title: 'tone: "attention": peach',
    meta: 'Doar „are nevoie de tine acum”: telefonul deconectat cu mesaje care așteaptă',
  },
  {
    id: 'd',
    icon: 'circle-x',
    tone: 'danger',
    title: 'tone: "danger": roșu',
    meta: 'Eroare sau pierdere: mesaje care nu au plecat, bani restanți',
  },
];

const ITEMS_RO: AttentionItem[] = [
  {
    id: 1,
    icon: 'smartphone',
    tone: 'attention',
    title: 'Telefonul afacerii e deconectat. 6 reamintiri trebuie să plece până la 18:00.',
    meta: 'Deconectat de la 14:20 · Telefon recepție',
    time: 'acum',
    actions: [{ label: 'Vezi ce poți face', primary: true }],
  },
  {
    id: 2,
    icon: 'clock',
    title: 'Cristina Dobre nu a confirmat',
    meta: 'Azi la 12:30 · Tratament facial · Ioana',
    time: 'peste 1 h',
    actions: [{ label: 'Confirmă', primary: true }, { label: 'Retrimite reamintirea' }],
  },
  {
    id: 3,
    icon: 'wallet',
    tone: 'danger',
    title: 'Dan Stoica mai are de plătit 120 lei',
    meta: 'De la vizita din 16 octombrie',
    actions: [{ label: 'Încasează' }, { label: 'Trimite link de plată', quiet: true }],
  },
  {
    id: 4,
    icon: 'calendar',
    title: 'Elena Georgescu vrea să mute programarea',
    meta: 'De mâine, 10:00, pe sâmbătă, 11:00 · cerere online',
    actions: [{ label: 'Acceptă', primary: true }, { label: 'Propune altă oră' }],
  },
];

export default function AttentionListGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.al}>
        {(['light', 'dark'] as const).map((th) => (
          <section key={th} className={f.alFrame} data-gallery-frame data-theme={th}>
            <p className="heading">{th === 'light' ? 'Light' : 'Dark'}</p>
            <div className={f.alRow}>
              <div className={f.alCol}>
                <p className={`caption ${f.alLab}`}>Cele trei tonuri</p>
                <div className={f.alCard}>
                  <AttentionList items={TONES} />
                </div>
              </div>
              <div className={f.alCol}>
                <p className={`caption ${f.alLab}`}>Au nevoie de tine · EasyBook · Azi</p>
                <div className={f.alCard}>
                  <AttentionList items={ITEMS_RO} />
                </div>
              </div>
              <div className={f.alCol}>
                <p className={`caption ${f.alLab}`}>Gol: ce pui în empty (de obicei nimic)</p>
                <div className={`${f.alCard} ${f.alEmpty}`}>
                  <AttentionList
                    items={[]}
                    empty={<p className={`body-small ${f.muted}`}>Nimic de făcut acum.</p>}
                  />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
