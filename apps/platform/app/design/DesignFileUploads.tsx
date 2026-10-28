/* eslint-disable i18next/no-literal-string */
'use client';

import { FileUpload } from '@ventora/ui';
import { UPLOAD_RO } from './demo/gallery/_shared/labels';

/* Client: textele FileUpload conțin o funcție (maxSize), care nu poate trece din page.tsx (server). */
export function DesignFileUploads() {
  return (
    <>
      <FileUpload
        labels={UPLOAD_RO}
        hint="PDF, DOCX"
        accept=".pdf,.docx"
        multiple
        maxSize={10 * 1024 * 1024}
      />
      <FileUpload labels={UPLOAD_RO} hint="Fișierul nu este acceptat" isInvalid />
      <FileUpload labels={UPLOAD_RO} isDisabled />
    </>
  );
}
