'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Dialog, FormField, Icon, IconButton, Input } from '@ventora/ui';
import { useServiceTexts } from './texts';
import type { ScreenMode } from './BookingServicesView';
import s from './services.module.css';

/* BookingServices (S123): the dialogs. Each one is a plain Dialog: in the application the page
   puts it in a DialogTrigger; in the gallery `framed` draws it inline (Dialog inline), as in
   preview.html. On a phone the dialog is a bottom sheet. */

type Common = { mode: ScreenMode; framed?: boolean; onCancel?: () => void };

function common(p: Common) {
  return {
    inline: p.framed,
    sheet: p.mode === 'mobile',
    onClose: p.onCancel,
  };
}

export function CategoryDialog(
  p: Common & {
    rename?: boolean;
    name: string;
    onNameChange: (name: string) => void;
    /** err.catRequired / err.catDuplicate */
    error?: 'required' | 'duplicate';
    busy?: boolean;
    onSubmit?: () => void;
  },
) {
  const { t } = useServiceTexts();
  const ui = useTranslations('ui');
  const error =
    p.error === 'duplicate'
      ? t('err.catDuplicate', { name: p.name.trim() })
      : p.error === 'required'
        ? t('err.catRequired')
        : undefined;
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={p.rename ? t('cat.renameTitle') : t('cat.newTitle')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onCancel}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" icon="check" onPress={p.onSubmit} isPending={p.busy}>
            {p.rename ? t('cat.save') : t('cat.create')}
          </Button>
        </>
      }
    >
      <FormField
        label={t('cat.name')}
        required
        hint={error ? undefined : p.rename ? t('cat.renameHelp') : t('cat.nameHelp')}
        error={error}
      >
        <Input
          value={p.name}
          onChange={(e) => p.onNameChange(e.target.value)}
          isInvalid={!!error}
          autoFocus
        />
      </FormField>
    </Dialog>
  );
}

export type OrderItem = { id: string; name: string; count: number };

export function CategoryOrderDialog(
  p: Common & {
    items: OrderItem[];
    /** „Fără categorie”, last and locked; its number of services. */
    uncategorizedCount: number;
    /** The row just moved (highlighted, preview.html is-moved). */
    movedId?: string | null;
    onMove?: (index: number, delta: -1 | 1) => void;
    busy?: boolean;
    onSubmit?: () => void;
  },
) {
  const x = useServiceTexts();
  const { t } = x;
  const ui = useTranslations('ui');
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={t('order.title')}
      description={t('order.lead')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onCancel}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" icon="check" onPress={p.onSubmit} isPending={p.busy}>
            {t('order.save')}
          </Button>
        </>
      }
    >
      <ol className={s.order}>
        {p.items.map((c, i) => (
          <li key={c.id} className={c.id === p.movedId ? s.moved : undefined}>
            <span className={`caption muted ${s.num} ${s.ix}`}>{i + 1}</span>
            <span className={`body ${s.on}`}>
              {c.name}
              <span className="body-small muted">{` · ${x.count(c.count)}`}</span>
            </span>
            <IconButton
              icon="arrow-up"
              label={`${t('order.up')} · ${c.name}`}
              size="sm"
              isDisabled={i === 0}
              onPress={() => p.onMove?.(i, -1)}
            />
            <IconButton
              icon="arrow-down"
              label={`${t('order.down')} · ${c.name}`}
              size="sm"
              isDisabled={i === p.items.length - 1}
              onPress={() => p.onMove?.(i, 1)}
            />
          </li>
        ))}
        <li>
          <span className={`caption muted ${s.ix}`}>
            <Icon icon="lock" size={14} />
          </span>
          <span className={`body muted ${s.on}`}>
            {t('uncategorized')}
            <span className="body-small">{` · ${x.count(p.uncategorizedCount)}`}</span>
          </span>
        </li>
      </ol>
    </Dialog>
  );
}

export function ArchiveServiceDialog(
  p: Common & {
    name: string;
    /** The future appointments of the service: from B.4; until then not shown. */
    futureCount?: number;
    busy?: boolean;
    onSubmit?: () => void;
  },
) {
  const { t } = useServiceTexts();
  const ui = useTranslations('ui');
  const n = p.futureCount ?? 0;
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={t('archive.title', { name: p.name })}
      description={t('archive.body')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onCancel}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" onPress={p.onSubmit} isPending={p.busy}>
            {t('archive.submit')}
          </Button>
        </>
      }
    >
      {n > 0 && (
        <p className={`${s.xline} body-small`}>
          <Icon icon="calendar" size={16} />
          {n === 1 ? t('archive.futureOne') : t('archive.futureMany', { n })}
        </p>
      )}
    </Dialog>
  );
}

export function CategoryBlockedDialog(p: Common & { name: string; activeCount: number }) {
  const { t } = useServiceTexts();
  const ui = useTranslations('ui');
  return (
    <Dialog
      {...common(p)}
      closeLabel={ui('close')}
      title={t('catArchive.blockedTitle', { name: p.name })}
      description={t('catArchive.blockedBody', { n: p.activeCount })}
      footer={
        <Button variant="primary" onPress={p.onCancel}>
          {t('catArchive.ok')}
        </Button>
      }
    />
  );
}

/** preview.html ss-overlay: the scrim of a frame, with the dialog in the middle (bottom on a phone). */
export function FrameOverlay({ mode, children }: { mode: ScreenMode; children: ReactNode }) {
  return <div className={`${s.overlay} ${mode === 'mobile' ? s.m : ''}`}>{children}</div>;
}
