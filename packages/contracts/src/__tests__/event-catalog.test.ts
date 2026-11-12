import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EVENT_CATALOG,
  InvitationNewLinkRequestedV1,
  OrganizationCreatedV1,
  UserLocaleChangedV1,
  OrganizationMemberAddedV1,
  OrganizationMemberRemovedV1,
  OrganizationMemberRoleChangedV1,
  CommercialApplicationStoppedV1,
  CrmDealCreatedV1,
  CrmDealWonV1,
  CrmLeadConvertedV1,
  CrmLeadCreatedV1,
  CrmLeadDisqualifiedV1,
  CrmLeadUpdatedV1,
  CrmLeadAssignedV1,
  CrmNoteMentionedV1,
  CrmActivityReminderDueV1,
  CrmContactAssignedV1,
  CrmDealAssignedV1,
  OrganizationMemberAccessChangedV1,
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

  it('organization.created v1: only the id and an ISO country code, nothing personal (5.10c)', () => {
    const def = findEventDefinition('organization.created', 1);
    expect(def).toBe(OrganizationCreatedV1);
    expect(OrganizationCreatedV1.growthSafe).toBe(false);
    expect(OrganizationCreatedV1.parse({ organizationId: ID, country: 'RO' })).toEqual({
      organizationId: ID,
      country: 'RO',
    });
    for (const country of ['ro', 'ROU', 'R', '', 'R0']) {
      expect(() => OrganizationCreatedV1.parse({ organizationId: ID, country })).toThrow();
    }
    expect(() =>
      OrganizationCreatedV1.parse({ organizationId: ID, country: 'RO', name: 'Salon' }),
    ).toThrow();
  });

  it('user.locale_changed v1: only the person id and one of the 6 locales (5.10c)', () => {
    expect(findEventDefinition('user.locale_changed', 1)).toBe(UserLocaleChangedV1);
    expect(UserLocaleChangedV1.growthSafe).toBe(false);
    expect(UserLocaleChangedV1.parse({ userId: 'u_1', locale: 'fr' })).toEqual({
      userId: 'u_1',
      locale: 'fr',
    });
    for (const locale of ['RO', 'pt', '', 'ro-RO']) {
      expect(() => UserLocaleChangedV1.parse({ userId: 'u_1', locale })).toThrow();
    }
    expect(() =>
      UserLocaleChangedV1.parse({ userId: 'u_1', locale: 'ro', email: 'a@b.ro' }),
    ).toThrow();
  });

  it('organization.member_* v1: only ids and the role, nothing personal (5.10c)', () => {
    for (const def of [OrganizationMemberAddedV1, OrganizationMemberRemovedV1]) {
      expect(findEventDefinition(def.type, 1)).toBe(def);
      expect(def.growthSafe).toBe(false);
      expect(def.parse({ membershipId: ID, userId: ID, role: 'admin' })).toEqual({
        membershipId: ID,
        userId: ID,
        role: 'admin',
      });
      expect(() => def.parse({ membershipId: ID, userId: ID, role: 'guest' })).toThrow();
      expect(() =>
        def.parse({ membershipId: ID, userId: ID, role: 'member', email: 'a@b.ro' }),
      ).toThrow();
    }
    expect(
      OrganizationMemberRoleChangedV1.parse({
        membershipId: ID,
        userId: ID,
        fromRole: 'member',
        toRole: 'admin',
      }),
    ).toMatchObject({ fromRole: 'member', toRole: 'admin' });
    expect(() =>
      OrganizationMemberRoleChangedV1.parse({ membershipId: ID, userId: ID, toRole: 'admin' }),
    ).toThrow();
  });

  it('commercial.application.stopped v1: only the application and how (5.10c)', () => {
    expect(findEventDefinition('commercial.application.stopped', 1)).toBe(
      CommercialApplicationStoppedV1,
    );
    expect(CommercialApplicationStoppedV1.growthSafe).toBe(false);
    expect(CommercialApplicationStoppedV1.parse({ applicationId: 'crm', via: 'founder' })).toEqual({
      applicationId: 'crm',
      via: 'founder',
    });
    expect(() =>
      CommercialApplicationStoppedV1.parse({ applicationId: '', via: 'founder' }),
    ).toThrow();
    expect(() =>
      CommercialApplicationStoppedV1.parse({
        applicationId: 'crm',
        via: 'founder',
        amountMinor: 1,
      }),
    ).toThrow();
  });

  it('crm.lead.* / crm.deal.* v1 (C.8): in the catalog, ids and states only, never personal data', () => {
    const types = EVENT_CATALOG.map((d) => d.type).filter(
      (t) => t.startsWith('crm.lead.') || t.startsWith('crm.deal.'),
    );
    expect(types).toEqual([
      'crm.lead.created',
      'crm.lead.updated',
      'crm.lead.assigned',
      'crm.lead.converted',
      'crm.lead.disqualified',
      'crm.lead.deleted',
      'crm.deal.created',
      'crm.deal.updated',
      'crm.deal.stage_changed',
      'crm.deal.won',
      'crm.deal.lost',
      'crm.deal.reopened',
      'crm.deal.deleted',
      // C.8b
      'crm.deal.assigned',
    ]);
    for (const t of types) expect(findEventDefinition(t, 1)?.growthSafe).toBe(false);

    expect(
      CrmLeadCreatedV1.parse({ leadId: ID, source: 'custom', sourceId: ID, ownerUserId: null }),
    ).toMatchObject({ source: 'custom' });
    // nothing personal passes: the schemas are strict
    expect(() =>
      CrmLeadCreatedV1.parse({
        leadId: ID,
        source: 'phone',
        sourceId: null,
        ownerUserId: null,
        phone: '+40722000000',
      }),
    ).toThrow();
    expect(() => CrmLeadUpdatedV1.parse({ leadId: ID, fields: [] })).toThrow();
    expect(CrmLeadUpdatedV1.parse({ leadId: ID, fields: ['state'], state: 'qualified' })).toEqual({
      leadId: ID,
      fields: ['state'],
      state: 'qualified',
    });
    expect(() =>
      CrmLeadUpdatedV1.parse({ leadId: ID, fields: ['state'], state: 'converted' }),
    ).toThrow();
    expect(() =>
      CrmLeadDisqualifiedV1.parse({ leadId: ID, reason: 'spam', note: 'nu răspunde' }),
    ).toThrow();
    expect(
      CrmLeadConvertedV1.parse({ leadId: ID, contactId: ID, newContact: true, dealId: null }),
    ).toMatchObject({ newContact: true });

    const deal = {
      dealId: ID,
      pipelineId: ID,
      stageId: ID,
      contactId: ID,
      companyId: null,
      leadId: null,
      ownerUserId: null,
      valueMinor: 150000,
      currency: 'RON',
    };
    expect(CrmDealCreatedV1.parse(deal)).toEqual(deal);
    for (const bad of [{ valueMinor: -1 }, { valueMinor: 1.5 }, { currency: 'ron' }]) {
      expect(() => CrmDealCreatedV1.parse({ ...deal, ...bad })).toThrow();
    }
    expect(() => CrmDealCreatedV1.parse({ ...deal, title: 'Nunta Popescu' })).toThrow();
    expect(
      CrmDealWonV1.parse({ dealId: ID, valueMinor: 100, currency: 'EUR', wonOn: '2026-11-12' }),
    ).toMatchObject({ wonOn: '2026-11-12' });
    expect(() =>
      CrmDealWonV1.parse({ dealId: ID, valueMinor: 100, currency: 'EUR', wonOn: '12.11.2026' }),
    ).toThrow();
  });

  it('C.8b: what the ClientDesk notifications need — mention, reminder, assignment (ids only)', () => {
    for (const t of [
      'crm.note.mentioned',
      'crm.activity.reminder_due',
      'crm.contact.assigned',
      'crm.company.assigned',
      'crm.deal.assigned',
      'crm.activity.assigned',
    ]) {
      expect(findEventDefinition(t, 1)?.growthSafe).toBe(false);
    }
    const mention = {
      noteId: ID,
      subjectType: 'lead',
      subjectId: ID,
      authorUserId: ID,
      mentionedUserIds: [ID],
    };
    expect(CrmNoteMentionedV1.parse(mention)).toEqual(mention);
    expect(() => CrmNoteMentionedV1.parse({ ...mention, mentionedUserIds: [] })).toThrow();
    expect(() =>
      CrmNoteMentionedV1.parse({ ...mention, mentionedUserIds: Array(21).fill(ID) }),
    ).toThrow();
    expect(() => CrmNoteMentionedV1.parse({ ...mention, body: 'Sună-l pe Ion' })).toThrow();
    expect(
      CrmActivityReminderDueV1.parse({
        activityId: ID,
        ownerUserId: ID,
        dueOn: '2026-11-20',
        remindAt: '2026-11-20T08:45:00.000Z',
      }),
    ).toMatchObject({ dueOn: '2026-11-20' });
    expect(() =>
      CrmActivityReminderDueV1.parse({
        activityId: ID,
        ownerUserId: ID,
        dueOn: '2026-11-20',
        remindAt: '2026-11-20T08:45:00.000Z',
        title: 'Sună',
      }),
    ).toThrow();
    for (const def of [CrmContactAssignedV1, CrmDealAssignedV1]) {
      const key = def === CrmContactAssignedV1 ? 'contactId' : 'dealId';
      expect(def.parse({ [key]: ID, ownerUserId: null, byUserId: ID })).toEqual({
        [key]: ID,
        ownerUserId: null,
        byUserId: ID,
      });
      expect(() => def.parse({ [key]: ID, ownerUserId: ID })).toThrow();
    }
    expect(CrmLeadAssignedV1.parse({ leadId: ID, ownerUserId: ID, byUserId: ID })).toMatchObject({
      byUserId: ID,
    });
  });

  it('organization.member_access_changed v1: ids, the role and stopped / active (5.10c, 3c)', () => {
    expect(findEventDefinition('organization.member_access_changed', 1)).toBe(
      OrganizationMemberAccessChangedV1,
    );
    expect(OrganizationMemberAccessChangedV1.growthSafe).toBe(false);
    for (const access of ['stopped', 'active'] as const) {
      expect(
        OrganizationMemberAccessChangedV1.parse({
          membershipId: ID,
          userId: ID,
          role: 'member',
          access,
        }),
      ).toMatchObject({ access });
    }
    expect(() =>
      OrganizationMemberAccessChangedV1.parse({
        membershipId: ID,
        userId: ID,
        role: 'member',
        access: 'suspended',
      }),
    ).toThrow();
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
