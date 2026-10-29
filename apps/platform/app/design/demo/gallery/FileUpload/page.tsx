/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { FileUpload, FormField, type UploadFile } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { UPLOAD_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro" })
const T = {
  l: [
    'Listă: încărcat, se încarcă (64%), eroare pe un fișier cu „Încearcă din nou”',
    'Gol · implicit',
    'Hover',
    '',
    'Trage aici (drag-over)',
    'Eroare pe zonă (FormField)',
    'Dezactivat',
  ],
  docs: 'Documente',
  hint: 'PDF, JPG sau PNG',
  badFmt: 'Format neacceptat. Folosește PDF, JPG sau PNG.',
  contract: 'Contractul semnat',
  zoneErr: 'Adaugă contractul semnat ca să trimiți cererea.',
  locked: 'Documente (blocat până la confirmare)',
};
const MB10 = 10485760;
const MB5 = 5242880;
const noop = () => {};

function Board() {
  const [files, setFiles] = useState<UploadFile[]>([
    { id: 1, name: 'contract-salon-aurora.pdf', size: 482e3, status: 'done' },
    {
      id: 2,
      name: 'fotografii-lucrări-octombrie.zip',
      size: 184e5,
      status: 'uploading',
      progress: 64,
    },
    {
      id: 3,
      name: 'buletin-scanat-Ștefan-Țăranu.heic',
      size: 32e5,
      status: 'error',
      error: T.badFmt,
    },
  ]);
  const L = T.l;
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <PvCell label={L[0]!} style={{ maxWidth: 640 }}>
        <FormField label={T.docs}>
          <FileUpload
            labels={UPLOAD_RO}
            accept=".pdf,.jpg,.png"
            maxSize={MB10}
            hint={T.hint}
            files={files}
            onSelect={noop}
            onRemove={(x) => setFiles(files.filter((y) => y.id !== x.id))}
            onRetry={noop}
          />
        </FormField>
      </PvCell>
      <div className={f.pvGrid3}>
        <PvCell label={L[1]!}>
          <FormField label={T.docs}>
            <FileUpload labels={UPLOAD_RO} maxSize={MB10} hint={T.hint} onSelect={noop} />
          </FormField>
        </PvCell>
        <PvCell label={L[2]!}>
          <FormField label={T.docs}>
            <FileUpload labels={UPLOAD_RO} state="hover" maxSize={MB10} hint={T.hint} />
          </FormField>
        </PvCell>
        <PvCell label={L[4]!}>
          <FormField label={T.docs}>
            <FileUpload labels={UPLOAD_RO} state="drag" />
          </FormField>
        </PvCell>
        <PvCell label={L[5]!}>
          <FormField label={T.contract} isRequired error={T.zoneErr}>
            <FileUpload labels={UPLOAD_RO} isInvalid maxSize={MB5} accept=".pdf" multiple={false} />
          </FormField>
        </PvCell>
        <PvCell label={L[6]!}>
          <FormField label={T.locked}>
            <FileUpload labels={UPLOAD_RO} isDisabled maxSize={MB5} />
          </FormField>
        </PvCell>
      </div>
    </div>
  );
}

export default function FileUploadGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
