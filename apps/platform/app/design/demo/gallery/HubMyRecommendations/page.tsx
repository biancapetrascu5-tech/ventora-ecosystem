/* eslint-disable i18next/no-literal-string -- titlurile planșelor din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubMyRecommendationsFrame, type MineBoard } from './client';

// preview.html (HubMyRecommendations, S136) → Board3: 1 · lista; `?board=bell` 2 · din clopoțel;
// `?board=empty` 3 · Nicio recomandare. Desktop · 1280 (H 630 / 630 / 560); `?w=390`: telefonul
// (H 750 / 750 / 530).
const TITLES: Record<MineBoard, string> = {
  list: '1 · Recomandările mele: în așteptare, activată, nu acum',
  bell: '2 · Din clopoțel: doar când proprietarul activează',
  empty: '3 · Nicio recomandare',
};

export default async function HubMyRecommendationsGallery({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; board?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const phone = sp.w === '390';
  const board = (sp.board && sp.board in TITLES ? sp.board : 'list') as MineBoard;
  const empty = board === 'empty';
  return (
    <DesktopFrames
      title={TITLES[board]}
      height={phone ? (empty ? 530 : 750) : empty ? 560 : 630}
      width={phone ? 390 : undefined}
      render={() => <HubMyRecommendationsFrame board={board} phone={phone} />}
    />
  );
}
