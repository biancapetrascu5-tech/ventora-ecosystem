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
export { passwordResetLink, invitationLink, platformLink } from './links';
// Lot B.13: the S3 template and the shared e-mail texts, for the e-mails a module renders itself
// (EasyBook to the clients of a business)
export { renderOperationalEmail } from './templates/layout';
export type { OperationalEmail } from './templates/layout';
export { emailMessages, fill } from './templates/messages';
export type { EmailMessages } from './templates/messages';
export type { AuthApp } from './links';
export {
  renderPasswordReset,
  renderPasswordChanged,
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderSupportSessionOpened,
  renderFounderDisputeAlert,
  renderFounderGrowthStopAlert,
} from './templates/index';
export type { RenderedEmail, MembershipRoleName } from './templates/index';
export { sendOwnerRecoveryNotice } from './owner-recovery';
export { sendSupportSessionNotice } from './support-session';
export { sendFounderDisputeAlert, sendFounderGrowthStopAlert } from './founder-alerts';
// FounderNotifications (D4-29 a): clopoțelul Founder
export {
  closeFounderNotificationsPool,
  FOUNDER_INBOX_DAYS,
  FOUNDER_NOTIFICATION_TYPES,
  listFounderNotifications,
  markAllFounderNotificationsRead,
  markFounderNotificationRead,
  sendFounderNotification,
} from './founder-inbox';
export type {
  FounderInbox,
  FounderNotificationKind,
  FounderNotificationParams,
  FounderNotificationRow,
  FounderNotificationType,
} from './founder-inbox';
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
// D4-28: the values of the texts, neutral, formatted in the reader's language
export { formatDay, formatMoney, resolveParams, checkParams, valueType } from './model/values';
export type { NotificationValue, NotificationParams, NotificationValueType } from './model/values';
// Lot 4.5: the Phase 3 notifications (S115)
export { BILLING_TEMPLATES, BILLING_KINDS, billingType } from './model/billing';
export type { BillingKind, BillingTemplateId } from './model/billing';
// Lot 3.7: „Recomandă” / „Anunță proprietarul”
export { OWNER_NOTICE_TEMPLATES, ownerNoticeType } from './model/owner-notice';
export { ACCESS_REQUEST_TEMPLATES, ACCESS_REQUEST_TYPE } from './model/access-request';
export {
  TEAM_RECOMMENDATION_ACTIVATED,
  TEAM_RECOMMENDATION_TEMPLATES,
} from './model/team-recommendation';
export type { OwnerNoticeKind } from './model/owner-notice';
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
