export type AuditCategory =
  | 'identity'
  | 'organization'
  | 'access'
  | 'support'
  | 'founder'
  | 'commercial'
  // Lot C.0b: the Booking application (B.1: the service catalog)
  | 'booking'
  // Lot C.4: the ClientDesk application (CR.2: contacts and companies)
  | 'crm';

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
  // Lot 4.6: the support requests (category support)
  | 'support_request'
  // Lot 3.2: the commercial model (category commercial)
  | 'plan'
  | 'plan_version'
  | 'addon'
  | 'application'
  | 'billing_account'
  | 'subscription'
  | 'subscription_change'
  | 'addon_grant'
  | 'override'
  | 'subscription_application'
  | 'discount'
  // Lot 3.4: the requests from the Hub
  | 'commercial_request'
  // D3-24: the global settings of the commercial model
  | 'setting'
  // Lot 3.5: payments with the card (core/billing)
  | 'payment_method'
  | 'purchase'
  | 'billing_subscription'
  | 'dispute'
  // Lot 3.6: the invoices of the payments
  | 'payment'
  | 'invoice'
  // Lot 3.8: the commercial life cycle
  | 'trial'
  | 'dunning'
  | 'setup_request'
  | 'billing_profile'
  // Lot 4.10: the workflow engine (core/workflows)
  | 'workflow_definition'
  | 'workflow_activation'
  | 'workflow_execution'
  | 'workflow_engine'
  // Lot C.0b / B.1: the Booking service catalog (category booking)
  | 'booking_service'
  | 'booking_service_category'
  // Lot C.0c / B.2: the members in the calendar and their schedule (category booking)
  | 'booking_business_hours'
  | 'booking_staff_member'
  | 'booking_staff_time_off'
  // Lot C.0d / B.4: the appointments, the blocked times, the clients, the booking rules
  | 'booking_appointment'
  | 'booking_time_block'
  | 'booking_client'
  | 'booking_settings'
  // Lot C.0e / B.3: the bookable resources (rooms, spaces, equipment)
  | 'booking_resource'
  // Lot C.0g / B.8: a health field of the business (the answers target booking_client)
  | 'booking_medical_field'
  // Lot C.4 / CR.2: the ClientDesk contacts, companies and preferences (category crm)
  | 'crm_contact'
  | 'crm_company'
  | 'crm_settings'
  // Lot C.4b / CR.3–CR.4: the own fields, the tags, the segments (category crm)
  | 'crm_custom_field'
  | 'crm_tag'
  | 'crm_segment'
  // Lot C.4c / CR.5–CR.9 (category crm)
  | 'crm_duplicate'
  | 'crm_note'
  | 'crm_attachment'
  | 'crm_activity'
  | 'crm_task'
  | 'crm_lead'
  | 'crm_lead_source'
  | 'crm_pipeline'
  | 'crm_stage'
  | 'crm_deal'
  | 'crm_loss_reason';

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
