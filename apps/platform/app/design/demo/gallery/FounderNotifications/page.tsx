/* eslint-disable i18next/no-literal-string -- titlurile planșelor din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderNotificationsFrame, type NotifBoard } from './client';

// preview.html (FounderNotifications, S136) → Board3, cu `?board=` bell / unread / all / drawer /
// restart / done / empty. Desktop · 1280 (H 710 / 710 / 970 / 810 / 710 / 710 / 580); `?w=390`:
// telefonul (H 1000 / 1000 / 1420 / 1020 / 1000 / 1000 / 580).
const BOARDS: Record<NotifBoard, [string, number, number]> = {
  bell: ['1 · Clopoțelul Founder, deschis', 710, 1000],
  unread: ['2 · Notificările: necitite, cu filtre', 710, 1000],
  all: ['3 · Toate, citite și necitite', 970, 1420],
  drawer: ['4 · Oprire automată: ce s-a oprit și de ce', 810, 1020],
  restart: ['5 · „Repornește”, cu confirmare', 710, 1000],
  done: ['6 · Repornită', 710, 1000],
  empty: ['7 · Nicio notificare', 580, 580],
};

export default async function FounderNotificationsGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; board?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const phone = sp.w === '390';
  const board = (sp.board && sp.board in BOARDS ? sp.board : 'unread') as NotifBoard;
  const [title, desktop, mobile] = BOARDS[board];
  return (
    <DesktopFrames
      founder
      title={title}
      height={phone ? mobile : desktop}
      width={phone ? 390 : undefined}
      render={() => <FounderNotificationsFrame board={board} phone={phone} />}
    />
  );
}
