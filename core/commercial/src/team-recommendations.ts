import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, pgExecutor } from '@ventora/audit';
import { Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withOrganizationRead, withOrganizationWrite } from './db';
import { computeEntitlementsInTx } from './entitlements';
import type { RequestActor } from './requests';

/*
 * Lot 5.9e — „Recomandă aplicația” păstrat cu starea lui (HubMyRecommendations,
 * HubRecommendation, S136; deciziile fondatoarei din 13.11.2026):
 *   - un membru sau un admin recomandă proprietarului o aplicație pe care afacerea n-o are
 *     (notifyOwner, Lot 3.7, scrie și rândul de aici, în aceeași tranzacție);
 *   - owner-ul și adminii văd recomandările în așteptare în clopoțel, la „Recomandări”, și le
 *     pot respinge („Nu acum”, fără notificare pentru membru); se poate trimite din nou după
 *     30 de zile;
 *   - „Activată” când aplicația intră în abonament (consumatorul din team-recommendation-
 *     activated.ts), cu notificarea „{owner} a activat {app}” pentru cine a recomandat;
 *   - nota membrului și răspunsul owner-ului sunt opționale (max 300): câmpurile în care se scriu
 *     nu sunt desenate încă (NECESITĂ DESIGN), deci rămân goale până atunci.
 */

export const TEAM_RECOMMENDATION_RESEND_DAYS = 30;
export const TEAM_RECOMMENDATION_NOTE_MAX = 300;
const DAY_MS = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TeamRecommendationStatus = 'pending' | 'active' | 'not_now';

export interface TeamRecommendationRow {
  id: string;
  applicationId: string;
  applicationName: string;
  recommendedByUserId: string;
  recommendedByRole: string;
  note: string | null;
  status: TeamRecommendationStatus;
  recommendedAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
  answer: string | null;
}

/** „Nu acum” acum mai puțin de 30 de zile: recomandarea rămâne cum era; `canResendAt` spune când. */
export class TeamRecommendationTooSoon extends Error {
  readonly code = 'TEAM_RECOMMENDATION_TOO_SOON';
  constructor(readonly canResendAt: Date) {
    super('A recommendation answered „Nu acum” can be sent again after 30 days');
    this.name = 'TeamRecommendationTooSoon';
  }
}

type Row = {
  id: string;
  application_id: string;
  application_name: string;
  recommended_by_user_id: string;
  recommended_by_role: string;
  note: string | null;
  status: TeamRecommendationStatus;
  recommended_at: Date;
  decided_at: Date | null;
  decided_by_user_id: string | null;
  answer: string | null;
};

const SELECT = `
  SELECT r.id, r.application_id, a.name AS application_name, r.recommended_by_user_id,
         r.recommended_by_role, r.note, r.status, r.recommended_at, r.decided_at,
         r.decided_by_user_id, r.answer
    FROM commercial.team_recommendation r
    JOIN commercial.application a ON a.id = r.application_id`;

const toRow = (r: Row): TeamRecommendationRow => ({
  id: r.id,
  applicationId: r.application_id,
  applicationName: r.application_name,
  recommendedByUserId: r.recommended_by_user_id,
  recommendedByRole: r.recommended_by_role,
  note: r.note,
  status: r.status,
  recommendedAt: r.recommended_at,
  decidedAt: r.decided_at,
  decidedByUserId: r.decided_by_user_id,
  answer: r.answer,
});

/** Nota opțională: fără spații la capete, cel mult 300 de caractere; goală = fără notă. */
export function normalizeRecommendationNote(note: string | null | undefined): string | null {
  const v = (note ?? '').trim();
  if (!v) return null;
  if (v.length > TEAM_RECOMMENDATION_NOTE_MAX) throw new InvalidInput('note');
  return v;
}

/**
 * În tranzacția lui notifyOwner (aplicația e deja verificată: există și afacerea n-o are): o
 * recomandare în așteptare a aceleiași persoane rămâne cum e (notificarea către owner merge tot o
 * dată pe zi); după „Nu acum”, una nouă doar după 30 de zile.
 */
export async function recordTeamRecommendationInTx(
  client: PoolClient,
  actor: RequestActor,
  applicationId: string,
  note: string | null,
): Promise<{ id: string; created: boolean }> {
  const { rows } = await client.query<{ id: string; status: string; decided_at: Date | null }>(
    `SELECT id, status, decided_at FROM commercial.team_recommendation
      WHERE organization_id = $1 AND recommended_by_user_id = $2 AND application_id = $3
      ORDER BY recommended_at DESC LIMIT 1`,
    [actor.organizationId, actor.userId, applicationId],
  );
  const last = rows[0];
  if (last?.status === 'pending') return { id: last.id, created: false };
  if (last?.status === 'not_now' && last.decided_at) {
    const canResendAt = new Date(
      last.decided_at.getTime() + TEAM_RECOMMENDATION_RESEND_DAYS * DAY_MS,
    );
    if (canResendAt.getTime() > Date.now()) throw new TeamRecommendationTooSoon(canResendAt);
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO commercial.team_recommendation
       (organization_id, application_id, recommended_by_user_id, recommended_by_role, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [actor.organizationId, applicationId, actor.userId, actor.role, note],
  );
  const id = inserted.rows[0]!.id;
  await appendAuditEventInTx(pgExecutor(client), {
    category: 'commercial',
    action: AuditActions.commercialTeamRecommendationCreated,
    outcome: 'success',
    actorType: 'user',
    actorId: actor.userId,
    organizationId: actor.organizationId,
    targetType: 'team_recommendation',
    targetId: id,
    metadata: { applicationId },
  });
  return { id, created: true };
}

/** HubMyRecommendations: recomandările persoanei, cele mai noi întâi (le vede doar ea și owner-ul). */
export async function listMyTeamRecommendations(
  actor: RequestActor,
): Promise<TeamRecommendationRow[]> {
  if (actor.actor !== 'user') throw new Forbidden();
  return withOrganizationRead(actor.organizationId, async (client) => {
    const { rows } = await client.query<Row>(
      `${SELECT} WHERE r.organization_id = $1 AND r.recommended_by_user_id = $2
        ORDER BY r.recommended_at DESC, r.id LIMIT 200`,
      [actor.organizationId, actor.userId],
    );
    return rows.map(toRow);
  });
}

/** Clopoțelul owner-ului și al adminilor: recomandările în așteptare, cele mai noi întâi. */
export async function listPendingTeamRecommendations(
  actor: RequestActor,
): Promise<TeamRecommendationRow[]> {
  if (actor.actor !== 'user' || (actor.role !== 'owner' && actor.role !== 'admin')) {
    throw new Forbidden();
  }
  return withOrganizationRead(actor.organizationId, async (client) => {
    const { rows } = await client.query<Row>(
      `${SELECT} WHERE r.organization_id = $1 AND r.status = 'pending'
        ORDER BY r.recommended_at DESC, r.id LIMIT 50`,
      [actor.organizationId],
    );
    return rows.map(toRow);
  });
}

/** „Respinge” din clopoțel (owner sau admin): „Nu acum”, fără notificare pentru membru. */
export async function rejectTeamRecommendation(
  actor: RequestActor,
  recommendationId: string,
): Promise<void> {
  if (actor.actor !== 'user' || (actor.role !== 'owner' && actor.role !== 'admin')) {
    throw new Forbidden('The owner or an admin answers a recommendation');
  }
  if (!UUID_RE.test(recommendationId ?? '')) throw new InvalidInput('recommendationId');
  await withOrganizationWrite(actor.organizationId, async (client) => {
    const { rows } = await client.query<{ id: string; application_id: string }>(
      `UPDATE commercial.team_recommendation
          SET status = 'not_now', decided_by_user_id = $3
        WHERE id = $1::uuid AND organization_id = $2 AND status = 'pending'
        RETURNING id, application_id`,
      [recommendationId, actor.organizationId, actor.userId],
    );
    if (!rows[0]) throw new ResourceNotFound('team_recommendation');
    await appendAuditEventInTx(pgExecutor(client), {
      category: 'commercial',
      action: AuditActions.commercialTeamRecommendationRejected,
      outcome: 'success',
      actorType: 'user',
      actorId: actor.userId,
      organizationId: actor.organizationId,
      targetType: 'team_recommendation',
      targetId: rows[0].id,
      metadata: { applicationId: rows[0].application_id },
    });
  });
}

/**
 * Consumatorul lui `commercial.application.activated` (aplicația a intrat în abonament):
 * recomandările ei în așteptare devin „Activată”, dacă afacerea o are acum. Întoarce ce s-a
 * schimbat, pentru notificările către cine a recomandat.
 */
export async function activateRecommendationsInTx(
  client: PoolClient,
  organizationId: string,
  applicationId: string,
): Promise<{ id: string; applicationName: string; userId: string }[]> {
  const { applications } = await computeEntitlementsInTx(client, organizationId, null);
  if (!applications.includes(applicationId)) return [];
  const { rows } = await client.query<{ id: string; recommended_by_user_id: string }>(
    `UPDATE commercial.team_recommendation SET status = 'active'
      WHERE organization_id = $1 AND status = 'pending' AND application_id = $2
      RETURNING id, recommended_by_user_id`,
    [organizationId, applicationId],
  );
  if (rows.length === 0) return [];
  const app = await client.query<{ name: string }>(
    `SELECT name FROM commercial.application WHERE id = $1`,
    [applicationId],
  );
  const applicationName = app.rows[0]?.name ?? applicationId;
  return rows.map((r) => ({ id: r.id, applicationName, userId: r.recommended_by_user_id }));
}
