/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { Pagination } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import { PAGINATION_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ stack: true }) → States
const noop = () => {};

function Cap({ children }: { children: React.ReactNode }) {
  return <p className={`caption ${f.muted}`}>{children}</p>;
}

function States() {
  const [p, setP] = useState(4);
  const [s, setS] = useState(20);
  const L = PAGINATION_RO;
  return (
    <div className={f.d0}>
      <Cap>Cu rânduri pe pagină · pagina din mijloc, cu pauze între numere</Cap>
      <Pagination
        page={p}
        pageSize={s}
        total={1284}
        onPageChange={setP}
        onPageSizeChange={setS}
        labels={L}
        locale="ro"
      />
      <Cap>Prima pagină: „înapoi” dezactivat</Cap>
      <Pagination page={1} pageSize={20} total={248} onPageChange={noop} labels={L} locale="ro" />
      <Cap>Ultima pagină: „înainte” dezactivat</Cap>
      <Pagination page={13} pageSize={20} total={248} onPageChange={noop} labels={L} locale="ro" />
      <Cap>O singură pagină</Cap>
      <Pagination page={1} pageSize={20} total={12} onPageChange={noop} labels={L} locale="ro" />
      <Cap>Compact, pentru spații înguste</Cap>
      <div style={{ maxWidth: 'var(--panel-width)' }}>
        <Pagination
          compact
          page={2}
          pageSize={20}
          total={248}
          onPageChange={noop}
          labels={L}
          locale="ro"
        />
      </div>
    </div>
  );
}

export default function PaginationGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack render={() => <States />} />;
}
