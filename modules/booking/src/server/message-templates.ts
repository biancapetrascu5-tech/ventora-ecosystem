import type { PoolClient } from 'pg';
import { AuditActions } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { InvalidInput } from '@ventora/errors';
import { emailMessages, fill } from '@ventora/notifications';
import { audit, tx } from './appointments';
import { hubOnly } from './actor';
import type { ClientLocale } from './appointments';
import {
  isTemplateKind,
  isTemplateLocale,
  TEMPLATE_KINDS,
  TEMPLATE_LOCALES,
  validateTemplate,
  type TemplateKind,
  type TemplateText,
} from './template-text';

export * from './template-text';

/*
 * Lot B.14b — the texts of the client e-mails, edited by the business (design BookingMessageTemplates
 * S127, Setări · Mesaje). Decisions of the founder (13.11):
 * - the business changes the subject and the text; the appointment block, the policy line, the
 *   button and the footer stay fixed (renderClientEmail);
 * - a text per language: a client whose language has no text of the business gets the Ventora text;
 * - the moments stay those of B.13 / B.14 here (choosing them is B.14c, in the first package).
 *
 * The texts of the cancellation and of the change are those of the business's own action (the
 * salon cancelled / moved it); when the client cancelled or moved it, the short Ventora text goes.
 */

/**
 * The Ventora text of a message, written with the variables (what the editor starts from and what
 * „Revino la textul inițial” shows). The same words as the e-mail sent without a text of the business.
 */
export function defaultTemplate(kind: TemplateKind, locale: ClientLocale): TemplateText {
  const t = emailMessages(locale).booking;
  const greet = fill(t.greet, { name: '{client}' });
  const when = '{date}, {time}';
  const join = (...p: string[]) => p.join('\n\n');
  switch (kind) {
    case 'confirmation':
      return { subject: t.confirmed.title, body: join(greet, fill(t.confirmed.lead, { when })) };
    case 'reminder':
      return {
        subject: t.reminder.title,
        body: join(greet, fill(t.reminder.lead, { when, business: '{business}' })),
      };
    case 'change':
      return {
        subject: t.moved.title,
        body: join(greet, fill(t.moved.lead, { business: '{business}' }), t.moved.note),
      };
    case 'cancellation':
      return {
        subject: fill(t.cancelSalon.title, { business: '{business}' }),
        body: join(greet, fill(t.cancelSalon.lead, { when })),
      };
    case 'thanks':
      return {
        subject: fill(t.thanks.title, { name: '{client}' }),
        body: join(
          greet,
          fill(t.thanks.lead, { business: '{business}', service: '{service}' }),
          t.thanks.after,
        ),
      };
  }
}

function kindOf(v: unknown): TemplateKind {
  if (!isTemplateKind(v)) throw new InvalidInput('kind', 'invalid');
  return v;
}

function localeOf(v: unknown): ClientLocale {
  if (!isTemplateLocale(v)) throw new InvalidInput('locale', 'invalid');
  return v;
}

/** One message of Setări · Mesaje: the languages with a text of the business. */
export type MessageTemplateSummary = { kind: TemplateKind; customLocales: ClientLocale[] };

/** One message, in one language: the text in use and whether it is the business's. */
export type MessageTemplate = {
  kind: TemplateKind;
  locale: ClientLocale;
  subject: string;
  body: string;
  custom: boolean;
  updatedAt: Date | null;
};

type Row = {
  kind: TemplateKind;
  locale: ClientLocale;
  subject: string | null;
  body: string | null;
  updated_at: Date;
};

/** Setări · Mesaje: for each message, the languages in which the business wrote its own text. */
export async function listMessageTemplatesInOrg(
  ctx: TenantContext,
): Promise<MessageTemplateSummary[]> {
  hubOnly(ctx);
  const rows = await tx(
    ctx,
    async (client) =>
      (
        await client.query<{ kind: TemplateKind; locale: ClientLocale }>(
          `SELECT kind, locale FROM booking.message_template
            WHERE subject IS NOT NULL ORDER BY kind, locale`,
        )
      ).rows,
    true,
  );
  return TEMPLATE_KINDS.map((kind) => ({
    kind,
    customLocales: TEMPLATE_LOCALES.filter((l) =>
      rows.some((r) => r.kind === kind && r.locale === l),
    ),
  }));
}

export async function getMessageTemplateInOrg(
  ctx: TenantContext,
  input: { kind?: unknown; locale?: unknown },
): Promise<MessageTemplate> {
  hubOnly(ctx);
  const kind = kindOf(input.kind);
  const locale = localeOf(input.locale);
  return tx(ctx, (client) => readTemplate(client, kind, locale), true);
}

async function readTemplate(
  client: PoolClient,
  kind: TemplateKind,
  locale: ClientLocale,
): Promise<MessageTemplate> {
  const { rows } = await client.query<Row>(
    `SELECT kind, locale, subject, body, updated_at FROM booking.message_template
      WHERE kind = $1 AND locale = $2`,
    [kind, locale],
  );
  const r = rows[0];
  if (r?.subject && r.body) {
    return {
      kind,
      locale,
      subject: r.subject,
      body: r.body,
      custom: true,
      updatedAt: r.updated_at,
    };
  }
  return { kind, locale, ...defaultTemplate(kind, locale), custom: false, updatedAt: null };
}

/** „Salvează mesajul”: the business's text, from the next e-mail on. */
export async function saveMessageTemplateInOrg(
  ctx: TenantContext,
  input: { kind?: unknown; locale?: unknown; subject?: unknown; body?: unknown },
): Promise<MessageTemplate> {
  hubOnly(ctx);
  const kind = kindOf(input.kind);
  const locale = localeOf(input.locale);
  const text = validateTemplate(input);
  return tx(ctx, async (client, exec) => {
    await client.query(
      `INSERT INTO booking.message_template
         (organization_id, kind, locale, subject, body, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, kind, locale) DO UPDATE
         SET subject = EXCLUDED.subject, body = EXCLUDED.body,
             updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [ctx.organizationId, kind, locale, text.subject, text.body, ctx.userId],
    );
    // the text itself is not in the audit (it may name people); its length is
    await audit(
      exec,
      ctx,
      AuditActions.bookingSettingsUpdated,
      'booking_settings',
      ctx.organizationId,
      {
        messageTemplate: { kind, locale, action: 'saved', bodyLength: text.body.length },
      },
    );
    return readTemplate(client, kind, locale);
  });
}

/** „Revino la textul inițial”: the Ventora text again (the row stays, with NULL). */
export async function resetMessageTemplateInOrg(
  ctx: TenantContext,
  input: { kind?: unknown; locale?: unknown },
): Promise<MessageTemplate> {
  hubOnly(ctx);
  const kind = kindOf(input.kind);
  const locale = localeOf(input.locale);
  return tx(ctx, async (client, exec) => {
    const { rowCount } = await client.query(
      `UPDATE booking.message_template
          SET subject = NULL, body = NULL, updated_by_user_id = $3
        WHERE kind = $1 AND locale = $2 AND subject IS NOT NULL`,
      [kind, locale, ctx.userId],
    );
    if (rowCount) {
      await audit(
        exec,
        ctx,
        AuditActions.bookingSettingsUpdated,
        'booking_settings',
        ctx.organizationId,
        {
          messageTemplate: { kind, locale, action: 'reset' },
        },
      );
    }
    return readTemplate(client, kind, locale);
  });
}

/** For the job: the business's text of a message in the client's language, or null (Ventora's). */
export async function customTemplateFor(
  client: PoolClient,
  kind: TemplateKind,
  locale: ClientLocale,
): Promise<TemplateText | null> {
  const { rows } = await client.query<{ subject: string | null; body: string | null }>(
    `SELECT subject, body FROM booking.message_template WHERE kind = $1 AND locale = $2`,
    [kind, locale],
  );
  const r = rows[0];
  return r?.subject && r.body ? { subject: r.subject, body: r.body } : null;
}
