/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Toast } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark · cu „Anulează”…” → Q_Toasts(Q_RO)
const T = [
  'Am mutat programarea pe joi, 14:30.',
  'Am trimis reamintirea.',
  'SMS-ul a ajuns la Ana Popescu la 09:12.',
  'Te apropii de limita de SMS-uri',
  'Vezi consumul',
  'Nu am putut salva',
  'Verifică internetul și încearcă din nou.',
  'Încearcă din nou',
  'Exportăm 248 de programări…',
];
const noop = () => {};
const L = { undoLabel: 'Anulează', dismissLabel: 'Închide' };

function Toasts() {
  return (
    <div className={f.d0} style={{ maxWidth: 'var(--panel-width)' }}>
      <Toast tone="neutral" title={T[0]} onUndo={noop} onDismiss={noop} {...L} />
      <Toast tone="done" title={T[1]} description={T[2]} onDismiss={noop} {...L} />
      <Toast tone="attention" title={T[3]} action={{ label: T[4] }} onDismiss={noop} {...L} />
      <Toast
        tone="danger"
        title={T[5]}
        description={T[6]}
        action={{ label: T[7] }}
        onDismiss={noop}
        {...L}
      />
      <Toast loading title={T[8]} />
    </div>
  );
}

export default function ToastGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <Toasts />
    </QPair>
  );
}
