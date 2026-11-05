// Stable action codes (plan Lot 2.5 §2). The code is what gets stored; never rename one in place.
export const AuditActions = {
  // §2.1 Hub authentication (category identity)
  loginSucceeded: 'auth.login_succeeded', // E1
  login2faRequired: 'auth.login_2fa_required', // E2
  loginFailed: 'auth.login_failed', // E3
  logout: 'auth.logout', // E4
  sessionRevoked: 'session.revoked', // E5
  sessionsRevokedOn2faEnroll: 'session.bulk_revoked_on_2fa_enroll', // E6
  activeOrganizationChanged: 'org.active_changed', // E7
  // §2.2 2FA and password (category identity)
  twoFactorEnrollStarted: '2fa.enroll_started', // E8
  twoFactorEnabled: '2fa.enabled', // E9
  twoFactorVerifyFailed: '2fa.verify_failed', // E10
  twoFactorAccountLocked: '2fa.account_locked', // E11
  twoFactorAttemptWhileLocked: '2fa.attempt_while_locked', // E12
  twoFactorBackupCodeUsed: '2fa.backup_code_used', // E13
  twoFactorBackupCodesRegenerated: '2fa.backup_codes_regenerated', // E14
  twoFactorTrustDeviceRejected: '2fa.trust_device_rejected', // E15
  twoFactorDisabled: '2fa.disabled', // Lot 2.7 · D — a member turns 2FA off with the TOTP code
  passwordResetRequested: 'password.reset_requested', // E16
  passwordResetCompleted: 'password.reset_completed', // E17
  passwordResetFailed: 'password.reset_failed', // E18
  passwordChanged: 'password.changed', // E19
  passwordResetEmailFailed: 'password.reset_email_failed', // Lot 2.5b — reset email not delivered
  passwordResetRateLimited: 'password.reset_rate_limited', // Lot 2.4b R-PR4 — per-address limit hit
  passwordChangedEmailFailed: 'password.changed_email_failed', // Lot 2.4b R-PR7 — notice not delivered
  // §2.3 Organizations and access
  organizationCreated: 'org.created', // E20
  organizationSuspended: 'org.suspended', // Lot 2.8 (D3-20 a) — Founder suspends a business
  organizationReactivated: 'org.reactivated', // Lot 2.8 — Founder reactivates it
  invitationCreated: 'invitation.created', // E21
  invitationResent: 'invitation.resent', // E22
  invitationRevoked: 'invitation.revoked', // E23
  invitationAccepted: 'invitation.accepted', // E24
  invitationAcceptFailed: 'invitation.accept_failed', // E25
  invitationEmailFailed: 'invitation.email_failed', // E26
  invitationNewLinkRequested: 'invitation.new_link_requested', // Lot 2.6 · E — „Cere o invitație nouă”
  applicationAccessGranted: 'application_access.granted', // E27
  membershipRoleChanged: 'membership.role_changed', // E28 — HubAdminTeam „Schimbă rolul” (Lot 2.9b)
  membershipAccessStopped: 'membership.access_stopped', // Lot 2.9b — „Oprește accesul”
  membershipAccessRestored: 'membership.access_restored', // Lot 2.9b — „Redă accesul”
  membershipRemoved: 'membership.removed', // Lot 2.9b — „Elimină din afacere”
  applicationAccessUpdated: 'application_access.updated', // Lot 2.9b — „Acces la aplicații”
  authorizeTwoFactorRequired: 'authorize.two_factor_required', // E29
  // §2.4 Founder (category founder). E30 = Founder variants of E1–E19, see founderAction().
  founderUserAdded: 'founder.user_added', // E31
  founderUserRevoked: 'founder.user_revoked', // E32
  founderAuditViewed: 'founder.audit_viewed', // E33
  // §2.5 Support and recovery (category support) — Lot 2.5c
  supportSessionOpened: 'support.session_opened', // E34
  supportSessionNoticeFailed: 'support.session_notice_failed', // E34 follow-up: E-6 to an owner not delivered
  supportSessionClosed: 'support.session_closed', // E35
  supportSessionRevokedByOrg: 'support.session_revoked_by_org', // E36
  supportSessionExpired: 'support.session_expired', // E37
  supportAction: 'support.action', // E38
  supportActionDenied: 'support.action_denied', // E39
  ownerRecoveryPerformed: 'support.owner_recovery_performed', // E40
  ownerRecoveryNotified: 'support.owner_recovery_notified', // E41
  // Lot 4.6 — the support requests (category support): the business in the Hub, the team in
  // Founder · Suport, the automatic closing (S116-D18)
  supportRequestCreated: 'support.request_created',
  supportRequestReplied: 'support.request_replied', // the business
  supportRequestReopened: 'support.request_reopened', // the business, from the Hub
  supportTeamReplied: 'support.team_replied', // the team, from Founder
  supportRequestMarkedInProgress: 'support.request_marked_in_progress',
  supportRequestClosed: 'support.request_closed', // the team
  supportRequestAutoClosed: 'support.request_auto_closed', // the job (S116-D18)
  // Lot 3.2 — the commercial model, every Founder write (category commercial, required; §8.5)
  commercialPlanCreated: 'commercial.plan_created',
  commercialVersionCreated: 'commercial.version_created',
  commercialVersionUpdated: 'commercial.version_updated', // a draft's terms
  commercialVersionPublished: 'commercial.version_published',
  commercialApplicationModeChanged: 'commercial.application_mode_changed', // D3-9
  commercialAddonCreated: 'commercial.addon_created',
  commercialAddonUpdated: 'commercial.addon_updated', // prices, switch, eligible plans (D3-7)
  commercialAddonSalesStopped: 'commercial.addon_sales_stopped',
  commercialCurrencySet: 'commercial.currency_set', // D3-2
  commercialSubscriptionAssigned: 'commercial.subscription_assigned',
  commercialVersionChangeScheduled: 'commercial.version_change_scheduled', // D-COM-9
  commercialAddonGranted: 'commercial.addon_granted',
  commercialAddonGrantEnded: 'commercial.addon_grant_ended',
  commercialOverrideCreated: 'commercial.override_created', // D-COM-8
  commercialOverrideExtended: 'commercial.override_extended',
  commercialOverrideEnded: 'commercial.override_ended',
  // D3-21 (31.10.2026): discounts and applications added to a subscription (D3-9)
  commercialApplicationPricesSet: 'commercial.application_prices_set',
  commercialApplicationLineAdded: 'commercial.application_line_added',
  commercialApplicationLineEnded: 'commercial.application_line_ended',
  commercialDiscountCreated: 'commercial.discount_created',
  commercialDiscountUpdated: 'commercial.discount_updated',
  commercialDiscountEnded: 'commercial.discount_ended',
  // Lot 3.4: the requests from the Hub (FounderRequests, S111; D3-9)
  commercialRequestCreated: 'commercial.request_created', // the owner, from the Hub
  commercialRequestResolved: 'commercial.request_resolved',
  commercialRequestRefused: 'commercial.request_refused',
  // D3-24 (31.10.2026): applications à la carte, bundles, the seats every account includes
  commercialApplicationQuotasSet: 'commercial.application_quotas_set',
  commercialOfferPeriodSet: 'commercial.offer_period_set', // S117: a bundle offer's sale period
  commercialBundleSalesStopped: 'commercial.bundle_sales_stopped',
  commercialSettingChanged: 'commercial.setting_changed',
  // Lot 3.5 — payments with the card (core/billing, category commercial, §8.6): the owner's card
  // and purchases (actor user), what Stripe reports through the webhook (actor system)
  billingCardSaved: 'billing.card_saved',
  billingPurchaseSucceeded: 'billing.purchase_succeeded', // paid and activated
  billingPurchaseFailed: 'billing.purchase_failed', // outcome failure: nothing activated
  billingSubscriptionCreated: 'billing.subscription_created', // the subscription in Stripe Billing
  billingDisputeOpened: 'billing.dispute_opened', // chargeback: Founder decides, by hand
  // Lot 3.6 — the invoices (SmartBill): issued, refused / uncertain (Founder checks), and the
  // full refund made by Founder in Stripe (D3-10), which asks for the storno
  billingInvoiceIssued: 'billing.invoice_issued',
  billingInvoiceFailed: 'billing.invoice_failed', // outcome failure: nothing issued, or uncertain
  billingPaymentRefunded: 'billing.payment_refunded',
  // Lot 3.8 — the commercial life cycle: the trial, non-payment (D3-12), the requests with
  // implementation (S121), the billing profile (D-3.6-1), manual payment (D3-11), the invoice
  // not issued (D-3.6-5)
  commercialTrialStarted: 'commercial.trial_started', // the owner, from the Hub (D3-5)
  commercialTrialEnded: 'commercial.trial_ended', // the job: expired, data kept
  commercialSubscriptionTrialEnded: 'commercial.subscription_trial_ended', // N4
  commercialDunningOpened: 'commercial.dunning_opened',
  commercialDunningReadOnly: 'commercial.dunning_read_only', // after the grace
  commercialDunningResolved: 'commercial.dunning_resolved',
  commercialSetupRequested: 'commercial.setup_requested',
  commercialSetupOfferSent: 'commercial.setup_offer_sent',
  commercialSetupAccepted: 'commercial.setup_accepted',
  commercialSetupConfirmed: 'commercial.setup_confirmed',
  commercialSetupPaid: 'commercial.setup_paid',
  commercialSetupWorkStarted: 'commercial.setup_work_started',
  commercialSetupLive: 'commercial.setup_live',
  commercialSetupCancelled: 'commercial.setup_cancelled',
  commercialSetupRefunded: 'commercial.setup_refunded',
  billingProfileSaved: 'billing.profile_saved', // with the reason, in the business's log
  billingPaymentMethodSet: 'billing.payment_method_set', // card / transfer, the payment terms
  billingTransferInvoiced: 'billing.transfer_invoiced',
  billingTransferReceived: 'billing.transfer_received', // Founder confirms the receipt
  billingInvoiceRetried: 'billing.invoice_retried', // „Reîncearcă”
  billingInvoiceManual: 'billing.invoice_manual', // „Am emis-o manual”
  // Lot 4.10 — the workflow engine (category founder): only Founder builds, starts and stops
  // (D-WF-2); the reason and the support reference go in the business's log
  workflowDefinitionSaved: 'workflows.definition_saved', // a new automation or a new version
  workflowActivated: 'workflows.activated',
  workflowStopped: 'workflows.stopped',
  workflowExecutionRetried: 'workflows.execution_retried', // „Rulează din nou”
  workflowEnginePaused: 'workflows.engine_paused', // the central stop
  workflowEngineResumed: 'workflows.engine_resumed',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/**
 * E30: the Founder application emits the same authentication events as the Hub,
 * under category `founder`. `auth.login_succeeded` → `founder.login_succeeded`,
 * `2fa.enabled` → `founder.2fa_enabled`, `password.changed` → `founder.password_changed`.
 */
export function founderAction(hubAction: string): string {
  const withoutAuth = hubAction.startsWith('auth.') ? hubAction.slice('auth.'.length) : hubAction;
  return `founder.${withoutAuth.replace(/\./g, '_')}`;
}
