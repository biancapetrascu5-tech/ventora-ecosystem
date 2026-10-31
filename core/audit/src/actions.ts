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
  membershipRoleChanged: 'membership.role_changed', // E28 — defined, contract not built (D8 b)
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
