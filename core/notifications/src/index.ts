export type { EmailChannel, SendEmailParams } from './email';
export {
  EmailNotConfiguredError,
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  emailFrom,
  emailReplyTo,
  supportEmail,
} from './email';
export { ResendEmailAdapter } from './adapters/resend';
export { LogEmailAdapter } from './adapters/log';
export { UnconfiguredEmailChannel } from './adapters/unconfigured';
export { CaptureEmailAdapter } from './adapters/capture';
export { makeEmailChannel, setEmailChannel, getEmailChannel, deliverEmail } from './channel';
export type { DeliveryResult, EmailFailureReason } from './channel';
export { passwordResetLink, invitationLink } from './links';
export type { AuthApp } from './links';
export {
  renderPasswordReset,
  renderPasswordChanged,
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderSupportSessionOpened,
} from './templates/index';
export type { RenderedEmail, MembershipRoleName } from './templates/index';
export { sendOwnerRecoveryNotice } from './owner-recovery';
export { sendSupportSessionNotice } from './support-session';
// Lot 4.3: the notification model, the templates, sending and delivery
export { NotificationCatalog, NOTIFICATION_TEMPLATES, defaultCatalog } from './model/catalog';
export type {
  NotificationCategory,
  NotificationGroup,
  NotificationTemplate,
  NotificationEmailKeys,
  DeliveryChannel,
} from './model/catalog';
export {
  renderNotification,
  notificationText,
  toLocale,
  requiredParams,
  placeholdersOf,
  templateKeys,
} from './model/render';
// Lot 4.5: the Phase 3 notifications (S115)
export { BILLING_TEMPLATES, BILLING_KINDS, billingType } from './model/billing';
export type { BillingKind, BillingTemplateId } from './model/billing';
export { sendNotification } from './model/send';
export type { SendNotificationInput, SendNotificationResult } from './model/send';
export {
  deliverPendingNotifications,
  renderNotificationEmail,
  DELIVERY_MAX_ATTEMPTS,
} from './model/delivery';
export type {
  ContactResolver,
  DeliveryChannels,
  DeliveryContact,
  DeliveryReport,
} from './model/delivery';
export type { SqlClient } from './model/sql';
export { UnconfiguredSmsChannel, SmsNotConfiguredError } from './sms';
export type { SmsChannel, SmsMessage } from './sms';
// Lot 4.4: the bell and the preferences (the person's side)
export {
  getInbox,
  openNotification,
  markAllNotificationsRead,
  getNotificationPreferences,
  setNotificationPreference,
  closeNotificationsPool,
  INBOX_DAYS,
} from './model/inbox';
export type { Inbox, InboxItem, NotificationPreferences } from './model/inbox';
export {
  EMAIL_TOPICS,
  SECURITY_TOPICS,
  COMMERCIAL_TOPICS,
  isChangeable,
  defaultEnabled,
} from './model/topics';
export type { EmailTopic, SecurityTopic, CommercialTopic, NotificationTopic } from './model/topics';
