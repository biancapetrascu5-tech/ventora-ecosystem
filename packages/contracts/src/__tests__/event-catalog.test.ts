import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EVENT_CATALOG,
  InvitationNewLinkRequestedV1,
  defineEvent,
  findEventDefinition,
} from '../index';

const ID = '2f1b8c3e-4a5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('event catalog (Lot 4.1)', () => {
  it('invitation.new_link_requested v1: ids only, not Growth-safe, completes without a consumer', () => {
    expect(InvitationNewLinkRequestedV1).toMatchObject({
      type: 'invitation.new_link_requested',
      version: 1,
      sourceApp: 'platform',
      growthSafe: false,
      withoutConsumer: 'complete',
    });
    expect(InvitationNewLinkRequestedV1.parse({ invitationId: ID, invitedByUserId: ID })).toEqual({
      invitationId: ID,
      invitedByUserId: ID,
    });
    expect(() =>
      InvitationNewLinkRequestedV1.parse({ invitationId: 'x', invitedByUserId: ID }),
    ).toThrow();
    // strict: no extra fields (e.g. the invited address) slip into the payload
    expect(() =>
      InvitationNewLinkRequestedV1.parse({
        invitationId: ID,
        invitedByUserId: ID,
        email: 'a@b.ro',
      }),
    ).toThrow();
  });

  it('every entry is unique by type and version and is found by them', () => {
    const keys = EVENT_CATALOG.map((d) => `${d.type}@${d.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(findEventDefinition('invitation.new_link_requested', 1)).toBe(
      InvitationNewLinkRequestedV1,
    );
    expect(findEventDefinition('invitation.new_link_requested', 2)).toBeNull();
  });

  it('defineEvent refuses a malformed type or version', () => {
    const base = {
      sourceApp: 'x',
      growthSafe: false,
      withoutConsumer: 'complete' as const,
      schema: z.object({}),
    };
    expect(() => defineEvent({ ...base, type: 'NoDots', version: 1 })).toThrow();
    expect(() => defineEvent({ ...base, type: 'a.b', version: 0 })).toThrow();
  });
});
