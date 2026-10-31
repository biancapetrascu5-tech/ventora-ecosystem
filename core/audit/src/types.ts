export type AuditCategory =
  'identity' | 'organization' | 'access' | 'support' | 'founder' | 'commercial';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export type AuditActorType = 'user' | 'founder' | 'support' | 'system' | 'anonymous';

export type AuditTargetType =
  | 'user'
  | 'session'
  | 'invitation'
  | 'membership'
  | 'organization'
  | 'founder_user'
  | 'support_session'
  // Lot 3.2: the commercial model (category commercial)
  | 'plan'
  | 'plan_version'
  | 'addon'
  | 'application'
  | 'billing_account'
  | 'subscription'
  | 'subscription_change'
  | 'addon_grant'
  | 'override';

export type AuditEvent = {
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorId?: string | null;
  /** Always set when a Founder acts (directly or through a support session). */
  founderId?: string | null;
  supportSessionId?: string | null;
  organizationId?: string | null;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  /** Explicit request data; when absent the values come from runWithRequestContext(). */
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/**
 * required    → the caller's operation fails when the audit write fails.
 * best_effort → the failure is logged (console.error + request_id) and swallowed.
 */
export type AuditMode = 'required' | 'best_effort';

/** Which runtime login writes the row: app_runtime (DATABASE_URL) or founder_runtime (DATABASE_URL_FOUNDER). */
export type AuditConnection = 'app' | 'founder';

export type AuditLogEntry = {
  id: string;
  createdAt: Date;
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorId: string | null;
  founderId: string | null;
  supportSessionId: string | null;
  organizationId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

export type AuditLogFilters = {
  action?: string;
  /** Rows strictly older than this (keyset pagination on created_at). */
  before?: Date;
  /** Default 50, max 200. */
  limit?: number;
};

export type FounderAuditLogFilters = AuditLogFilters & {
  organizationId?: string;
  actorId?: string;
  founderId?: string;
  /** Lot 2.8: only these actions (FounderBusiness „Ultimele modificări”). */
  actions?: string[];
};
