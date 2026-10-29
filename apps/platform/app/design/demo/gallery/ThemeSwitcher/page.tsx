/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { ThemeSwitcher, type ThemeChoice } from '@ventora/ui';
import { QPair, Row } from '../_shared/QPair';
import { THEME_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → Q_Sec „Light / Dark · fiecare opțiune…” → Q_Pair → Q_TS(Q_RO)
const noop = () => {};

function TS() {
  const [v, setV] = useState<ThemeChoice>('light');
  return (
    <div className={f.d0}>
      <Row label="Luminoasă aleasă">
        <ThemeSwitcher value="light" onChange={noop} labels={THEME_RO} />
      </Row>
      <Row label="Întunecată aleasă">
        <ThemeSwitcher value="dark" onChange={noop} labels={THEME_RO} />
      </Row>
      <Row label="Automată aleasă">
        <ThemeSwitcher value="system" onChange={noop} labels={THEME_RO} />
      </Row>
      <Row label="Doar iconițe">
        <ThemeSwitcher value={v} onChange={setV} iconOnly size="sm" labels={THEME_RO} />
      </Row>
      <Row label="Lățime întreagă">
        <div style={{ flex: 1, minWidth: 0 }}>
          <ThemeSwitcher value={v} onChange={setV} block labels={THEME_RO} />
        </div>
      </Row>
    </div>
  );
}

export default function ThemeSwitcherGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <QPair>{<TS />}</QPair>;
}
