import { describe, expect, it } from 'vitest';
import {
  SUPPORT_STATUSES,
  SupportTransitionRefused,
  eventKindOf,
  founderStatus,
  hubStatus,
  nextStatus,
  type SupportAction,
  type SupportStatus,
} from '../status';

describe('afișarea stării (designul S116)', () => {
  it('Founder: Deschisă / În lucru / Închisă', () => {
    expect(SUPPORT_STATUSES.map(founderStatus)).toEqual(['open', 'progress', 'progress', 'closed']);
  });

  it('Hub: În lucru / Răspuns nou / Rezolvat', () => {
    expect(SUPPORT_STATUSES.map(hubStatus)).toEqual([
      'inProgress',
      'inProgress',
      'newReply',
      'resolved',
    ]);
  });
});

describe('tranzițiile', () => {
  const cases: [SupportStatus, SupportAction, SupportStatus | 'refused'][] = [
    // răspunsul echipei → „Răspuns nou” în Hub
    ['open', 'team_reply', 'awaiting_business'],
    ['in_progress', 'team_reply', 'awaiting_business'],
    ['awaiting_business', 'team_reply', 'awaiting_business'],
    ['closed', 'team_reply', 'refused'],
    // răspunsul afacerii după cel al echipei → iar la echipă (Founder: „Deschisă”)
    ['awaiting_business', 'business_reply', 'open'],
    ['open', 'business_reply', 'open'],
    ['in_progress', 'business_reply', 'in_progress'],
    ['closed', 'business_reply', 'refused'],
    // redeschiderea din Hub
    ['closed', 'business_reopen', 'open'],
    ['open', 'business_reopen', 'refused'],
    // „Marchează În lucru”
    ['open', 'team_mark_in_progress', 'in_progress'],
    ['awaiting_business', 'team_mark_in_progress', 'refused'],
    // „Închide solicitarea”, „Trimite și închide”
    ['open', 'team_close', 'closed'],
    ['awaiting_business', 'team_reply_close', 'closed'],
    ['closed', 'team_close', 'refused'],
    // S116-D18: doar ce așteaptă afacerea
    ['awaiting_business', 'system_auto_close', 'closed'],
    ['open', 'system_auto_close', 'refused'],
    ['in_progress', 'system_auto_close', 'refused'],
  ];

  it.each(cases)('%s + %s → %s', (from, action, expected) => {
    if (expected === 'refused') {
      expect(() => nextStatus(from, action)).toThrow(SupportTransitionRefused);
    } else {
      expect(nextStatus(from, action)).toBe(expected);
    }
  });

  it('un răspuns al afacerii care nu schimbă starea nu intră în istoric', () => {
    expect(eventKindOf('business_reply', 'open', 'open')).toBeNull();
    expect(eventKindOf('business_reply', 'awaiting_business', 'open')).toBe('business_reply');
    expect(eventKindOf('system_auto_close', 'awaiting_business', 'closed')).toBe('auto_closed');
  });
});
