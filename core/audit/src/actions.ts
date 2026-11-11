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
  // Lot C.1 — the business's locations (category organization, required, in the same
  // transaction). Metadata: the changed field names; never the address
  locationCreated: 'location.created',
  locationUpdated: 'location.updated',
  locationArchived: 'location.archived',
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
  // F3 · O-6 (decizia 07.11.2026): the storno of a setup paid by transfer, written by Founder's
  // refund, in the same transaction (the card's storno is billing.payment_refunded, from Stripe)
  billingTransferRefunded: 'billing.transfer_refunded',
  // Lot 4.10 — the workflow engine (category founder): only Founder builds, starts and stops
  // (D-WF-2); the reason and the support reference go in the business's log
  workflowDefinitionSaved: 'workflows.definition_saved', // a new automation or a new version
  workflowActivated: 'workflows.activated',
  workflowStopped: 'workflows.stopped',
  workflowExecutionRetried: 'workflows.execution_retried', // „Rulează din nou”
  workflowEnginePaused: 'workflows.engine_paused', // the central stop
  workflowEngineResumed: 'workflows.engine_resumed',
  // Lot C.0b / B.1 — the Booking service catalog (category booking, required): the business's
  // owner, admin or application manager (booking:settings), in the same transaction as the write
  bookingServiceCreated: 'booking.service_created',
  bookingServiceUpdated: 'booking.service_updated',
  bookingServiceArchived: 'booking.service_archived',
  bookingServiceRestored: 'booking.service_restored',
  bookingServiceCategoryCreated: 'booking.service_category_created',
  bookingServiceCategoryUpdated: 'booking.service_category_updated',
  bookingServiceCategoryArchived: 'booking.service_category_archived',
  bookingServiceCategoryRestored: 'booking.service_category_restored',
  // Lot C.0c / B.2 — the members in the calendar and their schedule (category booking, required),
  // booking:settings; the day exceptions are booking.staff_schedule_updated with the date in metadata
  bookingBusinessHoursUpdated: 'booking.business_hours_updated',
  bookingStaffAdded: 'booking.staff_added',
  bookingStaffUpdated: 'booking.staff_updated',
  bookingStaffArchived: 'booking.staff_archived',
  bookingStaffRestored: 'booking.staff_restored',
  bookingStaffScheduleUpdated: 'booking.staff_schedule_updated',
  bookingStaffTimeOffAdded: 'booking.staff_time_off_added',
  bookingStaffTimeOffUpdated: 'booking.staff_time_off_updated',
  bookingStaffTimeOffArchived: 'booking.staff_time_off_archived',
  // Lot C.0d / B.4 — the appointments, the blocked times, the clients and the booking rules
  // (category booking, required). No client data in the rows (name, phone, e-mail, team note):
  // only ids, states and instants
  bookingAppointmentCreated: 'booking.appointment_created',
  bookingAppointmentUpdated: 'booking.appointment_updated',
  bookingAppointmentMoved: 'booking.appointment_moved',
  bookingAppointmentStatusChanged: 'booking.appointment_status_changed',
  bookingAppointmentCancelled: 'booking.appointment_cancelled',
  bookingAppointmentStatusCorrected: 'booking.appointment_status_corrected',
  bookingTimeBlockAdded: 'booking.time_block_added',
  bookingTimeBlockUpdated: 'booking.time_block_updated',
  bookingTimeBlockArchived: 'booking.time_block_archived',
  bookingClientCreated: 'booking.client_created',
  bookingClientUpdated: 'booking.client_updated',
  bookingSettingsUpdated: 'booking.settings_updated',
  // Lot C.0e / B.3 — the bookable resources (category booking, required, booking:settings): the
  // catalog, the services that need a resource (in metadata: serviceIds), the order. The use of a
  // resource by an appointment (B.3b) is in the appointment's own row (metadata: resourceIds)
  bookingResourceCreated: 'booking.resource_created',
  bookingResourceUpdated: 'booking.resource_updated',
  bookingResourceArchived: 'booking.resource_archived',
  bookingResourceRestored: 'booking.resource_restored',
  // Lot 5.10 — Founder · Growth & Campaigns (category founder, like the workflow engine): every
  // Founder write on the Growth catalog and its stops, in the same transaction as the write
  growthOfferCreated: 'growth.offer_created',
  growthOfferUpdated: 'growth.offer_updated',
  growthOfferPublished: 'growth.offer_published',
  growthOfferArchived: 'growth.offer_archived',
  growthOfferTextSaved: 'growth.offer_text_saved', // a draft (by hand or an AI proposal)
  growthOfferTextApproved: 'growth.offer_text_approved', // only the Founder owner approves (S136)
  growthAudienceCreated: 'growth.audience_created',
  growthAudienceUpdated: 'growth.audience_updated',
  growthAudienceArchived: 'growth.audience_archived',
  growthCampaignCreated: 'growth.campaign_created',
  growthCampaignUpdated: 'growth.campaign_updated',
  growthCampaignSlotRemoved: 'growth.campaign_slot_removed', // approved with 5.5: one row per slot
  growthCampaignPublished: 'growth.campaign_published',
  growthCampaignStopped: 'growth.campaign_stopped', // by hand (the kill switch per campaign)
  growthCampaignRestarted: 'growth.campaign_restarted', // only by hand (P22), with what changed
  growthPlacementStopped: 'growth.placement_stopped', // the kill switch per slot
  growthPlacementResumed: 'growth.placement_resumed',
  growthPaused: 'growth.paused', // the global kill switch
  growthResumed: 'growth.resumed',
  growthCapsChanged: 'growth.caps_changed', // the global caps (P25), before / after in metadata
  // Lot C.0f / B.7 — the client card (category booking, required): blocking (booking:admin, with
  // the reason length only, never its text), the merge of two clients (D-B7-2: ids only) and the
  // GDPR erasure (D-B7-1: the client id, no data of the client)
  bookingClientBlocked: 'booking.client_blocked',
  bookingClientUnblocked: 'booking.client_unblocked',
  bookingClientMerged: 'booking.client_merged',
  bookingClientErased: 'booking.client_erased',
  // Lot C.0g / B.8 — the health fields (D-B-14; category booking, required). Every read of a
  // client's answers leaves a row (booking.medical_read); never the answers in the metadata, only
  // ids and which fields
  bookingMedicalFieldCreated: 'booking.medical_field_created',
  bookingMedicalFieldUpdated: 'booking.medical_field_updated',
  bookingMedicalFieldArchived: 'booking.medical_field_archived',
  bookingMedicalConsentGiven: 'booking.medical_consent_given',
  bookingMedicalConsentWithdrawn: 'booking.medical_consent_withdrawn',
  bookingMedicalAnswersSaved: 'booking.medical_answers_saved',
  bookingMedicalRead: 'booking.medical_read',
  // Lot C.0h / B.21 — the payments on an appointment (category booking, required; target
  // booking_appointment). Metadata: the payment id, kind, amount, currency and method; never the
  // note or the client's name
  bookingPaymentRecorded: 'booking.payment_recorded',
  bookingPaymentRefunded: 'booking.payment_refunded',
  // Lot C.4 / CR.2 — the ClientDesk contacts and companies (category crm, required), in the same
  // transaction as the write. No personal data in the rows (name, phone, e-mail, note, birthday):
  // only ids, the changed field names, the owner and the company. „Șterge” moves to the 30-day
  // bin (S130): crm.contact_deleted / crm.company_deleted; restoring from it is *_restored.
  crmContactCreated: 'crm.contact_created',
  crmContactUpdated: 'crm.contact_updated',
  crmContactOwnerChanged: 'crm.contact_owner_changed',
  crmContactDeleted: 'crm.contact_deleted',
  crmContactRestored: 'crm.contact_restored',
  crmCompanyCreated: 'crm.company_created',
  crmCompanyUpdated: 'crm.company_updated',
  crmCompanyDeleted: 'crm.company_deleted',
  crmCompanyRestored: 'crm.company_restored',
  crmSettingsUpdated: 'crm.settings_updated',
  // Lot C.4b / CR.3 — the business's own fields (category crm, required, crm:settings): the
  // definition only; a value set on a contact or a company is crm.contact_updated /
  // crm.company_updated with the field ids in metadata, never the value
  crmCustomFieldCreated: 'crm.custom_field_created',
  crmCustomFieldUpdated: 'crm.custom_field_updated',
  crmCustomFieldDeleted: 'crm.custom_field_deleted',
  crmCustomFieldRestored: 'crm.custom_field_restored',
  // Lot C.4b / CR.4 — tags and segments (category crm, required). Tagging a contact is
  // crm.contact_tagged / crm.contact_untagged (in bulk: one row per contact); „Unește cu…” is
  // crm.tag_merged with the target tag in metadata
  crmTagCreated: 'crm.tag_created',
  crmTagUpdated: 'crm.tag_updated',
  crmTagMerged: 'crm.tag_merged',
  crmTagDeleted: 'crm.tag_deleted',
  crmContactTagged: 'crm.contact_tagged',
  crmContactUntagged: 'crm.contact_untagged',
  crmSegmentCreated: 'crm.segment_created',
  crmSegmentUpdated: 'crm.segment_updated',
  crmSegmentDeleted: 'crm.segment_deleted',
  // Lot C.4c / CR.5–CR.9 — ClientDesk: duplicates and merge (CR.5), notes and attachments (CR.6),
  // activities and tasks (CR.7), leads and their sources (CR.8), pipelines, stages, deals and loss
  // reasons (CR.9). Category crm, required, in the same transaction as the write. No personal data
  // and no note / comment text in the rows: only ids, field names, stages and amounts' currencies.
  crmContactMerged: 'crm.contact_merged',
  crmDuplicateDismissed: 'crm.duplicate_dismissed',
  crmDuplicateRestored: 'crm.duplicate_restored',
  crmNoteCreated: 'crm.note_created',
  crmNoteUpdated: 'crm.note_updated',
  crmNoteDeleted: 'crm.note_deleted',
  crmAttachmentAdded: 'crm.attachment_added',
  crmAttachmentDeleted: 'crm.attachment_deleted',
  crmActivityCreated: 'crm.activity_created',
  crmActivityUpdated: 'crm.activity_updated',
  crmActivityDeleted: 'crm.activity_deleted',
  crmTaskCreated: 'crm.task_created',
  crmTaskUpdated: 'crm.task_updated',
  crmTaskCompleted: 'crm.task_completed',
  crmTaskDeleted: 'crm.task_deleted',
  crmLeadCreated: 'crm.lead_created',
  crmLeadUpdated: 'crm.lead_updated',
  crmLeadAssigned: 'crm.lead_assigned',
  crmLeadConverted: 'crm.lead_converted',
  crmLeadDisqualified: 'crm.lead_disqualified',
  crmLeadDeleted: 'crm.lead_deleted',
  crmLeadSourceCreated: 'crm.lead_source_created',
  crmLeadSourceUpdated: 'crm.lead_source_updated',
  crmLeadSourceDeleted: 'crm.lead_source_deleted',
  crmPipelineCreated: 'crm.pipeline_created',
  crmPipelineUpdated: 'crm.pipeline_updated',
  crmPipelineDeleted: 'crm.pipeline_deleted',
  crmStageCreated: 'crm.stage_created',
  crmStageUpdated: 'crm.stage_updated',
  crmStageDeleted: 'crm.stage_deleted',
  crmDealCreated: 'crm.deal_created',
  crmDealUpdated: 'crm.deal_updated',
  crmDealStageChanged: 'crm.deal_stage_changed',
  crmDealWon: 'crm.deal_won',
  crmDealLost: 'crm.deal_lost',
  crmDealReopened: 'crm.deal_reopened',
  crmDealDeleted: 'crm.deal_deleted',
  crmLossReasonCreated: 'crm.loss_reason_created',
  crmLossReasonUpdated: 'crm.loss_reason_updated',
  crmLossReasonDeleted: 'crm.loss_reason_deleted',
  // Lot C.4d / CR.11: the export (who, what, how many rows; never the data) and the import jobs
  crmExported: 'crm.exported',
  crmImportStarted: 'crm.import_started',
  crmImportCompleted: 'crm.import_completed',
  crmImportCancelled: 'crm.import_cancelled',
  // decision of 11.11.2026: a contact 30 days in the bin is anonymised by the job (actor system)
  crmContactAnonymized: 'crm.contact_anonymized',
  // Lot C.5 — the shared consent (core/consent; decision 11.11.2026): only what a team member
  // records or withdraws by hand, on the calling application's category (crm). The registry is
  // the history; a public form or the unsubscribe page writes no row. Never the address or the text
  crmConsentRecorded: 'crm.consent_recorded',
  crmConsentWithdrawn: 'crm.consent_withdrawn',
  // Lot MK.1 — CampaignKit (category marketing, required, in the same transaction): the settings
  // of the business, with the changed field names only (never the sender name or the address)
  marketingSettingsUpdated: 'marketing.settings_updated',
  // Lot 5.8 — Growth Engine (category founder, like the workflow engine): the automatic stop of a
  // campaign above the 5 % disturbance threshold (P22), by the system; the numbers in metadata
  growthCampaignAutoStopped: 'growth.campaign_auto_stopped',
  // Lot C.4f: a job deleted a file (core/files), in the category of the owner module
  fileDeletedBySystem: 'file.deleted_by_system',
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
