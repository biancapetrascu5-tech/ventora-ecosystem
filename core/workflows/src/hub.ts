import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withAppTx } from './db';
import type { TriggerCode } from './whitelist';

/*
 * Lot 4.10 — Hub · Afacerea · Automatizări (HubAutomations, D-WF-3): the owner and the admins see
 * the automations, whether each is on for their business, the last sending and the automated
 * messages of the month (S116-D20: only messages sent count; v1 without a limit, decision of
 * 04.11.2026). They cannot start or stop one: there is no contract for it here, and workflows_rw
 * has no right to write an activation. The business's own settings stay editable (S116-D22).
 *
 * The context is the TenantContext from authorize() in the app (never client input).
 */

export type HubContext = { organizationId: string; userId: string; role: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function manager(ctx: HubContext): void {
  // Brief: „Automatizările le văd proprietarul și adminii.”
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new Forbidden();
  if (!UUID_RE.test(ctx.organizationId ?? '') || !UUID_RE.test(ctx.userId ?? '')) {
    throw new InvalidInput('context');
  }
}

export type BusinessSettings = {
  reactivationWeeks?: number;
  /** null: „Fără reducere”. */
  birthdayDiscountPercent?: number | null;
};

export interface HubAutomation {
  definitionId: string;
  code: string;
  name: string;
  trigger: TriggerCode;
  on: boolean;
  /** The last run that sent something, with its messages. */
  lastSentAt: Date | null;
  lastSentCount: number;
  settings: BusinessSettings;
}

export interface HubAutomations {
  automations: HubAutomation[];
  /** Automated messages sent this calendar month (S116-D20). */
  messagesThisMonth: number;
}

/** The catalog with the business's state; read only, in the business's context. */
export async function getAutomationsForHub(
  ctx: HubContext,
  at = new Date(),
): Promise<HubAutomations> {
  manager(ctx);
  return withAppTx(
    ctx.organizationId,
    async (tx) => {
      const { rows } = await tx.query(
        `SELECT d.id, d.code, d.name, v.trigger_type,
                EXISTS (SELECT 1 FROM workflows.activation a
                         WHERE a.definition_id = d.id AND a.status = 'active') AS is_on,
                last.finished_at AS last_sent_at, COALESCE(last.messages_sent, 0) AS last_sent_count,
                COALESCE(s.settings, '{}'::jsonb) AS settings
           FROM workflows.definition d
           JOIN workflows.definition_version v
             ON v.definition_id = d.id AND v.version = d.current_version
           LEFT JOIN LATERAL (
             SELECT e.finished_at, e.messages_sent FROM workflows.execution e
              WHERE e.definition_id = d.id AND e.messages_sent > 0
              ORDER BY e.finished_at DESC NULLS LAST LIMIT 1
           ) last ON true
           LEFT JOIN workflows.business_setting s ON s.definition_id = d.id
          ORDER BY d.created_at, d.id`,
      );
      const month = await tx.query<{ n: number }>(
        `SELECT COALESCE(sum(messages_sent), 0)::int AS n FROM workflows.execution
          WHERE created_at >= date_trunc('month', $1::timestamptz AT TIME ZONE 'Europe/Bucharest')
                               AT TIME ZONE 'Europe/Bucharest'`,
        [at],
      );
      return {
        automations: rows.map((r) => ({
          definitionId: r.id,
          code: r.code,
          name: r.name,
          trigger: r.trigger_type,
          on: r.is_on,
          lastSentAt: r.last_sent_at,
          lastSentCount: r.last_sent_count,
          settings: r.settings,
        })),
        messagesThisMonth: month.rows[0]!.n,
      };
    },
    true,
  );
}

/** S116-D22: the weeks for reactivation, the birthday discount — set by the business itself. */
export async function setAutomationSetting(
  ctx: HubContext,
  params: { definitionId: string; settings: BusinessSettings },
): Promise<void> {
  manager(ctx);
  if (!UUID_RE.test(params.definitionId ?? '')) throw new InvalidInput('definitionId');
  const s = params.settings ?? {};
  const out: BusinessSettings = {};
  if ('reactivationWeeks' in s) {
    const w = s.reactivationWeeks;
    if (!Number.isInteger(w) || w! < 1 || w! > 52) throw new InvalidInput('reactivationWeeks');
    out.reactivationWeeks = w;
  }
  if ('birthdayDiscountPercent' in s) {
    const p = s.birthdayDiscountPercent;
    if (p !== null && (!Number.isInteger(p) || p! < 1 || p! > 50)) {
      throw new InvalidInput('birthdayDiscountPercent');
    }
    out.birthdayDiscountPercent = p ?? null;
  }
  if (Object.keys(out).length === 0) throw new InvalidInput('settings');
  await withAppTx(ctx.organizationId, async (tx) => {
    const def = await tx.query(`SELECT 1 FROM workflows.definition WHERE id = $1`, [
      params.definitionId,
    ]);
    if (!def.rows[0]) throw new ResourceNotFound('Automation not found');
    // merged with what the business set before; the CHECK keeps only the known keys in range
    await tx.query(
      `INSERT INTO workflows.business_setting (organization_id, definition_id, settings, updated_by_user_id)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (organization_id, definition_id)
       DO UPDATE SET settings = workflows.business_setting.settings || EXCLUDED.settings,
                     updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()`,
      [ctx.organizationId, params.definitionId, JSON.stringify(out), ctx.userId],
    );
  });
}
