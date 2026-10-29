/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { IconButton, TooltipBubble, type IconButtonVariant, type IconName } from '@ventora/ui';
import { QPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair → Q_TT(Q_RO): eticheta fixată deasupra butonului
const RO = ['Trimite reamintire', 'Caută', 'Șterge programarea'];

function Pin({
  icon,
  label,
  shortcut,
  variant,
}: {
  icon: IconName;
  label: string;
  shortcut?: string[];
  variant?: IconButtonVariant;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <TooltipBubble content={label} shortcut={shortcut} />
      <IconButton icon={icon} label={label} variant={variant} />
    </span>
  );
}

export default function TooltipGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair>
      <div className={f.r} style={{ gap: 'var(--space-8)', alignItems: 'flex-end' }}>
        <Pin icon="send" label={RO[0]!} />
        <Pin icon="search" label={RO[1]!} shortcut={['mod', 'K']} variant="secondary" />
        <Pin icon="trash-2" label={RO[2]!} />
      </div>
    </QPair>
  );
}
