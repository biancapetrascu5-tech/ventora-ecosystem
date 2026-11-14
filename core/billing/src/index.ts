// Lot 3.5 — core/billing: payments with the card through Stripe (ARCHITECTURE §8.6, D3-4 a).
export {
  getBillingAccount,
  startCardSetup,
  brandLabel,
  type BillingContext,
  type SavedCard,
} from './account';
export { confirmCardSetup } from './cards';
// Lot 3.7: the payments under „Facturi” (the invoice itself: Lot 3.6)
export { listPayments, PAYMENTS_LISTED, type PaymentRow } from './history';
export {
  previewPurchase,
  purchase,
  confirmPurchase,
  prorated,
  PurchaseRefused,
  type PurchaseResult,
  type PurchasePreview,
  type PurchaseStatus,
} from './purchases';
export {
  reconcileSubscription,
  runStripeReconcileJob,
  anchorFor,
  type ReconcileOutcome,
} from './subscriptions';
export {
  handleStripeWebhook,
  processStripeEvent,
  WebhookSignatureError,
  type WebhookOutcome,
} from './webhook';
export {
  billingPaymentFailedConsumer,
  billingInvoiceIssuedConsumer,
  billingDisputeAlertConsumer,
  commercialTrialEndingConsumer,
  commercialSetupNoticeConsumer,
} from './notify';
// Lot 3.6: the invoice of every payment (SmartBill), the storno, the Founder reads
export {
  invoiceIssueConsumer,
  issueInvoice,
  runInvoiceIssueJob,
  setInvoiceApplicationNames,
  setInvoiceBuyerResolver,
  romanianDate,
  romanianMonth,
  INVOICE_ALERT_ATTEMPTS,
  type IssueOutcome,
  type InvoiceBuyerResolver,
  type InvoiceSummary,
} from './invoices';
export {
  getInvoiceProvider,
  setInvoiceProviderFactory,
  setInvoiceProviderForTests,
  InvoiceProviderError,
  UnconfiguredInvoiceProvider,
  type InvoiceProvider,
  type InvoiceProviderName,
  type InvoiceBuyer,
  type InvoiceLine,
  type IssueInvoiceInput,
  type IssuedDocument,
  type ReverseInvoiceInput,
  type InvoiceErrorKind,
} from './invoice-provider';
export {
  SmartBillInvoiceProvider,
  smartBillConfigFromEnv,
  DEFAULT_VAT_MENTION,
  type SmartBillConfig,
} from './smartbill';
export {
  getInvoiceDownloadPath,
  openInvoiceLink,
  signInvoiceToken,
  verifyInvoiceToken,
  InvoiceLinkRefused,
  type InvoiceLinkClaims,
} from './invoice-links';
export { TestInvoiceProvider, type TestInvoiceDocument } from './test-invoice-provider';
export {
  listFailedPaymentsForFounder,
  listOpenDisputesForFounder,
  listInvoicesNeedingAttentionForFounder,
  stripeDisputeUrl,
  type FounderFailedPayment,
  type FounderOpenDispute,
  type FounderInvoiceAttention,
} from './founder';
export {
  getStripeGateway,
  setStripeGatewayForTests,
  signStripePayload,
  type StripeGateway,
  type StripeEventEnvelope,
  type PaymentIntentState,
  type SetupIntentState,
  type CardDetails,
  type SubscriptionState,
  type PriceSpec,
  type CouponSpec,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
} from './stripe';
export { setBillingErrorReporter, type BillingErrorReporter } from './report';
export { closeBillingPools } from './db';
// Lot 3.8 (D-3.6-1): the checks of the billing profile (the same rules as the database)
export {
  checkRomanianCui,
  checkForeignVatCode,
  checkRegCom,
  isRomanianVatPayer,
  normalizeTaxId,
  type CuiCheck,
} from './billing-profile';
// Lot 3.8: the billing profile, manual payment, the invoice not issued, the implementation
export {
  validateBillingProfile,
  getBillingProfileForFounder,
  saveBillingProfile,
  getBillingProfile,
  getPaymentSettingsForFounder,
  setPaymentSettings,
  runTransferInvoiceJob,
  runTransferOverdueJob,
  confirmTransferReceipt,
  transferReceiptConsumer,
  retryInvoice,
  markInvoiceManual,
  listInvoicesForFounder,
  runSubscriptionTrialJob,
  paySetupRequest,
  createSetupTransferInvoice,
  refundSetupRequest,
  getSavedCardLast4ForFounder,
  BillingProfileInvalid,
  PAYMENT_TERMS_MIN,
  PAYMENT_TERMS_MAX,
  PAYMENT_TERMS_DEFAULT,
  MANUAL_REASON_MIN,
  type BillingProfileInput,
  type BillingProfile,
  type BillingProfileError,
  type PaymentSettings,
  type FounderInvoiceRow,
} from './lifecycle';
export { profileBuyerInTx } from './invoices';
export type { RecordPaymentInput } from './invoice-provider';
// Lot B.22a: Stripe Connect — the businesses' own accounts (direct charges, Accounts v2)
export {
  getConnectGateway,
  setConnectGatewayForTests,
  parseConnectNotification,
  connectStatusOf,
  ConnectNotificationSignatureError,
  type ConnectGateway,
  type ConnectAccountState,
  type ConnectAccountStatus,
  type ConnectAccountNotification,
} from './stripe-connect';
