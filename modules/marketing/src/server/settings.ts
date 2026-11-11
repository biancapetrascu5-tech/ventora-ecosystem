import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { InvalidInput } from '@ventora/errors';
import { withMarketingTx } from './db';

/*
 * Lot MK.1 — the CampaignKit settings of a business (marketing.settings, CampaignKitSettings S139).
 * Until the first save there is no row and the defaults apply. The limits are checked here first
 * (a field to point at) and again by the CHECKs in the database.
 *
 *   frequency cap   D-CK-15 = a: 2 messages in 7 days; between 1–4 messages and 7–30 days
 *   SMS window      D-CK-15: not before 9:00, not after 20:00 (Romania's time), from < to
 *   member approval D-CK-14 = a: on by default
 *   days off        Sunday and the legal holidays on, Saturday off (PROPUS: the design shows the
 *                   switches without their default)
 */

export type MarketingSettings = {
  senderName: string | null;
  replyTo: string | null;
  capMessages: number;
  capDays: number;
  /** Minutes from midnight, Romania's time. */
  smsFromMinute: number;
  smsToMinute: number;
  skipSunday: boolean;
  skipSaturday: boolean;
  skipHolidays: boolean;
  memberApproval: boolean;
  /** false until the business saves its settings once. */
  saved: boolean;
};

export type MarketingSettingsInput = Omit<MarketingSettings, 'saved'>;

export const DEFAULT_MARKETING_SETTINGS: Readonly<MarketingSettings> = {
  senderName: null,
  replyTo: null,
  capMessages: 2,
  capDays: 7,
  smsFromMinute: 540,
  smsToMinute: 1200,
  skipSunday: true,
  skipSaturday: false,
  skipHolidays: true,
  memberApproval: true,
  saved: false,
};

export const SETTINGS_LIMITS = {
  capMessages: { min: 1, max: 4 },
  capDays: { min: 7, max: 30 },
  smsEarliest: 540,
  smsLatest: 1200,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** The settings, checked and normalized; InvalidInput names the first wrong field. */
export function validateMarketingSettings(input: MarketingSettingsInput): MarketingSettingsInput {
  const senderName = input.senderName?.trim() || null;
  if (senderName !== null && senderName.length > 80) throw new InvalidInput('senderName');
  const replyTo = input.replyTo?.trim().toLowerCase() || null;
  if (replyTo !== null && (replyTo.length > 254 || !EMAIL.test(replyTo))) {
    throw new InvalidInput('replyTo');
  }
  const { capMessages, capDays, smsFromMinute, smsToMinute } = input;
  const L = SETTINGS_LIMITS;
  if (!isInt(capMessages) || capMessages < L.capMessages.min || capMessages > L.capMessages.max) {
    throw new InvalidInput('capMessages');
  }
  if (!isInt(capDays) || capDays < L.capDays.min || capDays > L.capDays.max) {
    throw new InvalidInput('capDays');
  }
  if (!isInt(smsFromMinute) || smsFromMinute < L.smsEarliest) {
    throw new InvalidInput('smsFromMinute');
  }
  if (!isInt(smsToMinute) || smsToMinute > L.smsLatest || smsToMinute <= smsFromMinute) {
    throw new InvalidInput('smsToMinute');
  }
  for (const k of ['skipSunday', 'skipSaturday', 'skipHolidays', 'memberApproval'] as const) {
    if (typeof input[k] !== 'boolean') throw new InvalidInput(k);
  }
  return {
    senderName,
    replyTo,
    capMessages,
    capDays,
    smsFromMinute,
    smsToMinute,
    skipSunday: input.skipSunday,
    skipSaturday: input.skipSaturday,
    skipHolidays: input.skipHolidays,
    memberApproval: input.memberApproval,
  };
}

type SettingsRow = {
  sender_name: string | null;
  reply_to: string | null;
  cap_messages: number;
  cap_days: number;
  sms_from_minute: number;
  sms_to_minute: number;
  skip_sunday: boolean;
  skip_saturday: boolean;
  skip_holidays: boolean;
  member_approval: boolean;
};

const COLUMNS = `sender_name, reply_to, cap_messages, cap_days, sms_from_minute, sms_to_minute,
  skip_sunday, skip_saturday, skip_holidays, member_approval`;

function fromRow(row: SettingsRow): MarketingSettings {
  return {
    senderName: row.sender_name,
    replyTo: row.reply_to,
    capMessages: row.cap_messages,
    capDays: row.cap_days,
    smsFromMinute: row.sms_from_minute,
    smsToMinute: row.sms_to_minute,
    skipSunday: row.skip_sunday,
    skipSaturday: row.skip_saturday,
    skipHolidays: row.skip_holidays,
    memberApproval: row.member_approval,
    saved: true,
  };
}

export async function getMarketingSettingsInOrg(ctx: TenantContext): Promise<MarketingSettings> {
  return withMarketingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<SettingsRow>(`SELECT ${COLUMNS} FROM marketing.settings`);
      return rows[0] ? fromRow(rows[0]) : { ...DEFAULT_MARKETING_SETTINGS };
    },
    true,
  );
}

/** Saves the settings (the first save creates the row) and audits the changed field names. */
export async function saveMarketingSettingsInOrg(
  ctx: TenantContext,
  input: MarketingSettingsInput,
): Promise<MarketingSettings> {
  const v = validateMarketingSettings(input);
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const before = await client.query<SettingsRow>(
      `SELECT ${COLUMNS} FROM marketing.settings FOR UPDATE`,
    );
    const { rows } = await client.query<SettingsRow>(
      `INSERT INTO marketing.settings (organization_id, sender_name, reply_to, cap_messages,
              cap_days, sms_from_minute, sms_to_minute, skip_sunday, skip_saturday, skip_holidays,
              member_approval, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (organization_id) DO UPDATE SET
         sender_name = EXCLUDED.sender_name, reply_to = EXCLUDED.reply_to,
         cap_messages = EXCLUDED.cap_messages, cap_days = EXCLUDED.cap_days,
         sms_from_minute = EXCLUDED.sms_from_minute, sms_to_minute = EXCLUDED.sms_to_minute,
         skip_sunday = EXCLUDED.skip_sunday, skip_saturday = EXCLUDED.skip_saturday,
         skip_holidays = EXCLUDED.skip_holidays, member_approval = EXCLUDED.member_approval,
         updated_by_user_id = EXCLUDED.updated_by_user_id
       RETURNING ${COLUMNS}`,
      [
        ctx.organizationId,
        v.senderName,
        v.replyTo,
        v.capMessages,
        v.capDays,
        v.smsFromMinute,
        v.smsToMinute,
        v.skipSunday,
        v.skipSaturday,
        v.skipHolidays,
        v.memberApproval,
        ctx.userId,
      ],
    );
    const after = fromRow(rows[0]!);
    const prev = before.rows[0] ? fromRow(before.rows[0]) : DEFAULT_MARKETING_SETTINGS;
    // only the names of the changed fields: never the sender name or the reply address
    const changed = (Object.keys(v) as (keyof MarketingSettingsInput)[]).filter(
      (k) => prev[k] !== after[k],
    );
    await appendAuditEventInTx(exec, {
      category: 'marketing',
      action: AuditActions.marketingSettingsUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'marketing_settings',
      targetId: ctx.organizationId,
      metadata: { changed, first: !before.rows[0] },
    });
    return after;
  });
}
