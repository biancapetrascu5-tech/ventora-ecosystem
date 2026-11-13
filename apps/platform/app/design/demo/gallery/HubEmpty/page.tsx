/* eslint-disable i18next/no-literal-string -- titlurile planșelor din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubEmptyFrame, type HubEmptyBoard } from './client';

// preview.html (HubEmpty, S146) → planșele „Starea goală”, `?board=sent`, `?board=errors`,
// `?board=owner`; Desktop · 1280 (H 860, owner 1000); `?w=390`: telefonul (H 844, owner 1320).
const TITLES: Record<HubEmptyBoard, string> = {
  empty: 'Starea goală — nicio aplicație disponibilă',
  sent: 'S146 · „Cere acces”: după trimitere, cu data și retrimiterea după 7 zile',
  errors: 'S146 · Erori la trimitere',
  owner: 'S146 · Ce vede proprietarul sau adminul',
};

export default async function HubEmptyGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; board?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const phone = sp.w === '390';
  const board = (sp.board && sp.board in TITLES ? sp.board : 'empty') as HubEmptyBoard;
  const owner = board === 'owner';
  return (
    <DesktopFrames
      title={TITLES[board]}
      height={phone ? (owner ? 1320 : 844) : owner ? 1000 : 860}
      width={phone ? 390 : undefined}
      render={(theme) => <HubEmptyFrame board={board} theme={theme} phone={phone} />}
    />
  );
}
