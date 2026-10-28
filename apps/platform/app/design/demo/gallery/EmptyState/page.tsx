/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, EmptyState } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frames(Board) → cadrul „Light” (ES_T.ro)
const T = {
  l: ['Prima utilizare', 'Niciun rezultat', 'Eroare', 'Mic (sm) · în panouri și tabele'],
  e1: [
    'Nicio programare azi',
    'Când cineva rezervă, apare aici. Poți adăuga și tu una.',
    'Creează programare',
  ],
  e2: [
    'Niciun rezultat pentru „Ionescu”',
    'Verifică ortografia sau șterge filtrele.',
    'Șterge filtrele',
  ],
  e3: [
    'Nu am putut încărca lista',
    'Încearcă din nou. Dacă se repetă, scrie-ne.',
    'Încearcă din nou',
    'Scrie-ne',
  ],
  e4: ['Încă nu ai facturi', 'Când emiți o factură în MoneyDesk, apare aici.'],
};

function kinds(size: 'sm' | 'md') {
  const bs = size === 'sm' ? 'sm' : undefined;
  return [
    <EmptyState
      key={1}
      size={size}
      icon="calendar"
      title={T.e1[0]}
      description={T.e1[1]}
      actions={
        <Button variant="primary" icon="plus" size={bs}>
          {T.e1[2]}
        </Button>
      }
    />,
    <EmptyState
      key={2}
      size={size}
      icon="search"
      title={T.e2[0]}
      description={T.e2[1]}
      actions={<Button size={bs}>{T.e2[2]}</Button>}
    />,
    <EmptyState
      key={3}
      size={size}
      icon="circle-alert"
      title={T.e3[0]}
      description={T.e3[1]}
      actions={
        <>
          <Button icon="rotate-ccw" size={bs}>
            {T.e3[2]}
          </Button>
          <Button variant="quiet" size={bs}>
            {T.e3[3]}
          </Button>
        </>
      }
    />,
  ];
}

function Board() {
  const md = kinds('md');
  const sm = kinds('sm');
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <div className={f.pvGrid3}>
        {md.map((el, i) => (
          <PvCell key={i} label={T.l[i]}>
            <div className={f.frame}>{el}</div>
          </PvCell>
        ))}
      </div>
      <PvCell label={T.l[3]}>
        <div className={f.pvGrid} style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          {sm.map((el, i) => (
            <div key={i} className={f.frame}>
              {el}
            </div>
          ))}
          <div className={f.frame}>
            <EmptyState size="sm" icon="inbox" title={T.e4[0]} description={T.e4[1]} />
          </div>
        </div>
      </PvCell>
    </div>
  );
}

export default function EmptyStateGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
