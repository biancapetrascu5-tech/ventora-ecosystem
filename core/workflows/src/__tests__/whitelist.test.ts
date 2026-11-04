import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import {
  STEP_TEMPLATES,
  TRIGGERS,
  TRIGGER_CODES,
  availableEventTypes,
  triggersForEvent,
  validateDefinition,
  type DefinitionInput,
} from '../whitelist';

// Lot 4.10 — the whitelist of S116-D19: what the builder offers and the server accepts.

const quota: DefinitionInput = {
  trigger: 'commercial.quota_threshold',
  triggerParams: { thresholds: [80] },
  steps: [{ kind: 'notification.hub', template: 'quota_limit' }],
};

describe('the whitelist (S116-D19)', () => {
  it('has the six triggers drawn in FounderAutomations, plus „Clientul nu a venit”', () => {
    expect([...TRIGGER_CODES]).toEqual([
      'booking.appointment_completed',
      'booking.no_show',
      'booking.high_risk',
      'booking.client_inactive',
      'booking.client_birthday',
      'booking.daily_digest',
      'commercial.quota_threshold',
    ]);
  });

  it('only the quota trigger runs today; the Booking ones wait for Booking core', () => {
    const available = TRIGGER_CODES.filter((c) => TRIGGERS[c].available);
    expect(available).toEqual(['commercial.quota_threshold']);
    expect(availableEventTypes()).toEqual([{ type: 'commercial.quota.threshold', version: 1 }]);
    expect(triggersForEvent('commercial.quota.threshold', 1)).toEqual([
      'commercial.quota_threshold',
    ]);
    expect(triggersForEvent('commercial.quota.threshold', 2)).toEqual([]);
  });

  it('steps only send messages or notifications', () => {
    expect(Object.keys(STEP_TEMPLATES)).toEqual([
      'email.client',
      'email.member',
      'email.owner',
      'notification.hub',
    ]);
  });

  it('accepts the „Limita aproape atinsă” automation and normalises the thresholds', () => {
    expect(validateDefinition({ ...quota, triggerParams: { thresholds: [100, 80] } })).toEqual({
      trigger: 'commercial.quota_threshold',
      triggerParams: { thresholds: [80, 100] },
      delayMinutes: 0,
      conditions: [],
      steps: [{ kind: 'notification.hub', template: 'quota_limit' }],
    });
  });

  it('accepts a Booking automation (saved now, runs when Booking emits)', () => {
    expect(
      validateDefinition({
        trigger: 'booking.appointment_completed',
        delayMinutes: 120,
        conditions: ['recipient_has_email', 'recipient_accepts_messages', 'not_sent_in_30_days'],
        steps: [{ kind: 'email.client', template: 'thanks' }],
      }).delayMinutes,
    ).toBe(120);
    expect(
      validateDefinition({
        trigger: 'booking.daily_digest',
        triggerParams: { at: '07:00' },
        steps: [{ kind: 'email.member', template: 'daily_digest' }],
      }).triggerParams,
    ).toEqual({ at: '07:00' });
  });

  it.each([
    ['a trigger not in the list', { ...quota, trigger: 'booking.client_deleted' }, 'trigger'],
    [
      'a step that changes data („Șterge clientul”)',
      { ...quota, steps: [{ kind: 'db.delete_client', template: 'x' }] },
      'steps.0.kind',
    ],
    [
      'a template not in the list',
      { ...quota, steps: [{ kind: 'notification.hub', template: 'promo' }] },
      'steps.0.template',
    ],
    ['a condition not in the list', { ...quota, conditions: ['client_is_vip'] }, 'conditions'],
    ['a delay not offered', { ...quota, delayMinutes: 30 }, 'delayMinutes'],
    ['no step', { ...quota, steps: [] }, 'steps'],
    [
      'a threshold other than 80 / 100',
      { ...quota, triggerParams: { thresholds: [50] } },
      'triggerParams',
    ],
    [
      'a schedule without its hour',
      {
        trigger: 'booking.daily_digest',
        steps: [{ kind: 'email.member', template: 'daily_digest' }],
      },
      'triggerParams',
    ],
  ])('refuses %s', (_label, input, field) => {
    let err: unknown;
    try {
      validateDefinition(input as DefinitionInput);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidInput);
    expect((err as InvalidInput & { field?: string }).field).toBe(field);
  });
});
