/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, IconButton, Menu, PageHeader, StatusPill, Tabs } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra({ stack: true }) → ThemeFrame light → States()
const T = {
  crumb: 'Clienți',
  name: 'Ștefan Țăranu',
  desc: 'Client din martie 2024 · 23 de programări · preferă dimineața.',
  loyal: 'Client fidel',
  due: '1 plată restantă',
  msg: 'Trimite mesaj',
  add: 'Programare nouă',
  exp: 'Exportă datele (GDPR)',
  del: 'Șterge clientul',
  more: 'Mai multe acțiuni',
  tabs: ['Detalii', 'Istoric', 'Plăți'],
};
// S.breadcrumbs (ro)
const CRUMBS = 'Unde ești';

const Cap = ({ children }: { children: string }) => (
  <p className={`caption ${f.muted}`}>{children}</p>
);

function Full() {
  return (
    <PageHeader
      breadcrumbsLabel={CRUMBS}
      breadcrumbs={[{ label: T.crumb, href: '#' }, { label: T.name }]}
      title={T.name}
      description={T.desc}
      meta={
        <>
          <StatusPill tone="done">{T.loyal}</StatusPill>
          <StatusPill tone="danger">{T.due}</StatusPill>
        </>
      }
      actions={
        <>
          <Button icon="send">{T.msg}</Button>
          <Button variant="primary" icon="plus">
            {T.add}
          </Button>
          <Menu
            items={[
              { id: 'exp', label: T.exp, icon: 'download' },
              { separator: true },
              { id: 'del', label: T.del, icon: 'trash-2', isDanger: true },
            ]}
          >
            <IconButton icon="ellipsis-vertical" label={T.more} variant="secondary" />
          </Menu>
        </>
      }
      tabs={
        <Tabs
          label={T.crumb}
          items={[
            { id: 'a', label: T.tabs[0]! },
            { id: 'b', label: T.tabs[1]!, count: 23 },
            { id: 'c', label: T.tabs[2]! },
          ]}
        />
      }
    />
  );
}

function States() {
  return (
    <div className={f.d0}>
      <Cap>Complet: firimituri, titlu, descriere, stări, acțiuni, taburi</Cap>
      <Full />
      <Cap>Doar titlu și descriere</Cap>
      <PageHeader
        title="Rapoarte"
        description="Încasările și programările lunii în curs, pe angajați și pe servicii."
      />
      <Cap>Doar titlu</Cap>
      <PageHeader title="Setări" />
    </div>
  );
}

export default function PageHeaderGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack render={() => <States />} />;
}
