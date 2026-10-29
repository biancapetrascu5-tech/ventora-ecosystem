'use client';

import { useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { DialogTrigger, PageHeader, Sheet } from '@ventora/ui';
import {
  closeSupportSession,
  readSupportSessions,
  type SessionsPage,
} from '@/server/support-actions';
import { useIsPhone } from '@ventora/screens';
import { CloseSupportDialog, SupportSessionsSection, type SessionRow } from './SupportSessionView';

/* Administrare · Roluri și acces → „Sesiuni de suport” (S91, A5: page / pageSize).
   Titlul paginii („Roluri și acces”) e textul din design, încă fără cheie aprobată în afara
   preview-ului: îl luăm din `support.sessions.title` până la ecranul HubAdminAccess. */
export function SupportSessionsScreen({ initial }: { initial: SessionsPage }) {
  const t = useTranslations('support');
  const format = useFormatter();
  const locale = useLocale();
  const phone = useIsPhone();
  const [data, setData] = useState(initial);
  const [closing, setClosing] = useState<SessionRow | null>(null);
  const [pending, setPending] = useState(false);

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
  const rows: SessionRow[] = data.items.map((i) => ({
    id: i.id,
    who: i.founderName,
    reason: i.reason,
    ticket: i.ticketRef,
    when: format.dateTime(new Date(i.openedAt), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    status:
      i.status === 'active'
        ? { kind: 'active', expiresAt: time(i.expiresAt) }
        : i.status === 'expired'
          ? { kind: 'expired' }
          : i.closedBy?.type === 'system'
            ? { kind: 'closedAuto' } // A4: închisă de sistem înainte de expirare (D8, 29.10)
            : { kind: 'closedBy', name: i.closedBy?.name ?? '—' },
  }));

  async function go(page: number) {
    const next = await readSupportSessions(page);
    if (next) setData(next);
  }

  async function confirmClose() {
    if (!closing) return;
    setPending(true);
    await closeSupportSession(closing.id);
    setPending(false);
    setClosing(null);
    await go(data.page);
  }

  return (
    <>
      <PageHeader title={t('sessions.title')} />
      <Sheet>
        <SupportSessionsSection
          rows={rows}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={go}
          onCloseSession={setClosing}
          locale={locale}
        />
      </Sheet>
      <DialogTrigger isOpen={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
        <CloseSupportDialog
          mob={phone}
          pending={pending}
          onCancel={() => setClosing(null)}
          onConfirm={confirmClose}
        />
      </DialogTrigger>
    </>
  );
}
