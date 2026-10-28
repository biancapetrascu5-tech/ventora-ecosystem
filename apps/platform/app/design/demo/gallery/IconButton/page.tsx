/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { IconButton, type IconButtonVariant } from '@ventora/ui';
import { C3Pair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → c3stack(legenda, IBStates × 3, IBNamed(IBT.ro))
const RO = [
  'Editează',
  'Notificări, 3 necitite',
  'Notificări noi',
  'Acțiuni',
  'Închide',
  'Arată filtrele (activ)',
];

function States({ variant, l }: { variant: IconButtonVariant; l: string }) {
  return (
    <div className={f.r}>
      <span className={`${f.l} caption`}>{variant}</span>
      <IconButton variant={variant} icon="pencil" label={l} />
      <IconButton variant={variant} icon="pencil" label={l} state="hover" />
      <IconButton variant={variant} icon="pencil" label={l} state="focus" />
      <IconButton variant={variant} icon="pencil" label={l} state="pressed" />
      <IconButton variant={variant} icon="pencil" label={l} pressed />
      <IconButton variant={variant} icon="pencil" label={l} isDisabled />
      <IconButton variant={variant} icon="pencil" label={l} isPending />
    </div>
  );
}

function Named({ t }: { t: string[] }) {
  return (
    <div className={f.c3stack}>
      <div className={f.c3ib}>
        <IconButton icon="pencil" label={t[0]!} variant="secondary" />
        <span className="body-small">{t[0]}</span>
      </div>
      <div className={f.c3ib}>
        <IconButton icon="bell" label={t[1]!} badge={3} />
        <span className="body-small">{t[1]}</span>
      </div>
      <div className={f.c3ib}>
        <IconButton icon="bell" label={t[2]!} badge />
        <span className="body-small">{t[2]}</span>
      </div>
      <div className={f.c3ib}>
        <IconButton icon="ellipsis-vertical" label={t[3]!} size="sm" />
        <span className="body-small">{`${t[3]} · sm`}</span>
      </div>
      <div className={f.c3ib}>
        <IconButton icon="x" label={t[4]!} size="lg" />
        <span className="body-small">{`${t[4]} · lg`}</span>
      </div>
      <div className={f.c3ib}>
        <IconButton icon="list-filter" label={t[5]!} variant="secondary" pressed />
        <span className="body-small">{t[5]}</span>
      </div>
    </div>
  );
}

export default function IconButtonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <C3Pair
      render={() => (
        <div className={f.c3stack}>
          <p className={`caption ${f.c3lab}`}>
            Coloanele: implicit · hover · focus · apăsat · comutat · dezactivat · se încarcă
          </p>
          <States variant="quiet" l={RO[0]!} />
          <States variant="secondary" l={RO[0]!} />
          <States variant="primary" l={RO[0]!} />
          <Named t={RO} />
        </div>
      )}
    />
  );
}
