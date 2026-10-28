/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Tabs, type TabItem } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → Q_Pair → d0(Q_Tb(Q_RO), Q_Tb(Q_RO, sm))
const T = {
  label: 'Client',
  a: 'Detalii',
  b: 'Istoric',
  c: 'Plăți',
  d: 'Fișiere',
  e: 'Consimțăminte',
  panel: 'Conținutul tabului',
};

const panel = (name: string) => (
  <p className="body" style={{ color: 'var(--ink-secondary)' }}>
    {`${T.panel} „${name}”.`}
  </p>
);

const ITEMS: TabItem[] = [
  { id: 'a', label: T.a, icon: 'user', children: panel(T.a) },
  { id: 'b', label: T.b, icon: 'history', count: 12, children: panel(T.b) },
  { id: 'c', label: T.c, icon: 'receipt', count: 2, countTone: 'attention', children: panel(T.c) },
  { id: 'd', label: T.d, icon: 'file-text', children: panel(T.d) },
  { id: 'e', label: T.e, isDisabled: true, children: panel(T.e) },
];

function Tb({ size }: { size?: 'sm' }) {
  return (
    <div>
      <Tabs label={T.label} size={size} defaultSelectedKey="b" items={ITEMS} />
    </div>
  );
}

export default function TabsGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <div className={f.d0}>
        <Tb />
        <Tb size="sm" />
      </div>
    </QPair>
  );
}
