import { describe, expect, it } from 'vitest';
import { TRANSITIONS } from '../server/appointments';
import {
  FINAL,
  STATUS_LOOK,
  actionsFor,
  correctTarget,
  historyLine,
  type DetailAction,
  type DetailStatus,
} from '../ui/detail/detail-format';

/* BookingDetail / BookingStatuses (S116 f): the drawer offers only the transitions allowed from the
   state — the same map as TRANSITIONS (server) — and the history line of each kind. */

const ALL: DetailStatus[] = [
  'awaiting_payment',
  'unconfirmed',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];
const ctx = { canWrite: true, canCorrect: true, started: true, correctable: true };

// the action that leads to each state
const TO: Partial<Record<DetailAction, DetailStatus>> = {
  confirm: 'confirmed',
  start: 'in_progress',
  complete: 'completed',
  collect: 'completed',
  cancel: 'cancelled',
  noShow: 'no_show',
};

describe('STATUS_LOOK (S116-D7, D8)', () => {
  it('has a pill for each of the 7 states; „Nu a venit” is danger, „În desfășurare” attention', () => {
    expect(Object.keys(STATUS_LOOK).sort()).toEqual([...ALL].sort());
    expect(STATUS_LOOK.no_show.tone).toBe('danger');
    expect(STATUS_LOOK.in_progress.tone).toBe('attention');
    expect([...FINAL].sort()).toEqual(['cancelled', 'completed', 'no_show']);
  });
});

describe('actionsFor (BookingStatuses DET)', () => {
  it('offers only transitions TRANSITIONS allows', () => {
    for (const s of ALL) {
      const { footer, menu } = actionsFor(s, ctx);
      for (const a of [...footer, ...menu]) {
        const to = TO[a];
        if (to) expect(TRANSITIONS[s], `${s} → ${a}`).toContain(to);
      }
    }
  });
  it('follows the design per state', () => {
    expect(actionsFor('unconfirmed', ctx)).toEqual({
      footer: ['move', 'confirm'],
      menu: ['noShow', 'cancel'],
    });
    expect(actionsFor('confirmed', ctx)).toEqual({
      footer: ['move', 'start'],
      menu: ['noShow', 'cancel'],
    });
    expect(actionsFor('in_progress', { ...ctx, canCollect: true }).footer).toEqual(['collect']);
    expect(actionsFor('in_progress', ctx)).toEqual({ footer: ['complete'], menu: [] });
    expect(actionsFor('completed', ctx)).toEqual({ footer: ['rebook'], menu: ['correct'] });
    expect(actionsFor('cancelled', ctx)).toEqual({ footer: ['rebook'], menu: [] });
  });
  it('hides „Nu a venit” before the start, the correction after 24 h or for others, all without write', () => {
    expect(actionsFor('confirmed', { ...ctx, started: false }).menu).toEqual(['cancel']);
    expect(actionsFor('no_show', { ...ctx, correctable: false }).menu).toEqual([]);
    expect(actionsFor('no_show', { ...ctx, canCorrect: false }).menu).toEqual([]);
    expect(actionsFor('unconfirmed', { ...ctx, canWrite: false })).toEqual({
      footer: [],
      menu: [],
    });
    expect(actionsFor('awaiting_payment', ctx).footer).toEqual([]);
  });
  it('corrects only „Încheiată” ↔ „Nu a venit” (S116-D9)', () => {
    expect(correctTarget('completed')).toBe('no_show');
    expect(correctTarget('no_show')).toBe('completed');
    expect(correctTarget('cancelled')).toBeNull();
  });
});

describe('historyLine', () => {
  const row = { actorType: 'user' as const, actor: 'Ioana Pavel', toStatus: null };
  it('names who did it, the client, or the system', () => {
    expect(
      historyLine({ ...row, kind: 'created', source: 'public', actorType: 'client', actor: null }),
    ).toEqual({
      key: 'createdOnline',
      vars: {},
    });
    expect(historyLine({ ...row, kind: 'moved', from: '11:00', to: '12:30' })).toEqual({
      key: 'moved',
      vars: { name: 'Ioana Pavel', from: '11:00', to: '12:30' },
    });
    expect(historyLine({ ...row, kind: 'status', toStatus: 'in_progress' }).key).toBe('started');
    expect(
      historyLine({
        ...row,
        kind: 'status',
        toStatus: 'confirmed',
        actorType: 'client',
        actor: null,
      }).key,
    ).toBe('confirmedClient');
    expect(
      historyLine({
        ...row,
        kind: 'status',
        toStatus: 'cancelled',
        actorType: 'client',
        actor: null,
      }).key,
    ).toBe('cancelledClient');
    expect(
      historyLine({ ...row, kind: 'status', toStatus: 'no_show', actorType: 'system', actor: null })
        .key,
    ).toBe('noShowSystem');
  });
});
