import { deliverEmail } from './channel';
import { formatMoney } from './model/values';
import { renderFounderDisputeAlert, renderFounderGrowthStopAlert } from './templates/index';

/**
 * Lot 3.6 — the dispute alert (FAZA-3 §3.5 / §3.6): a customer disputed a charge with the bank;
 * the decision stays manual, at Founder. Sent to FOUNDER_ALERTS_EMAIL. Throws when the address
 * is not set or the e-mail did not leave, so the outbox consumer is retried (and, at the end,
 * the event becomes a dead letter visible in Founder).
 */
export async function sendFounderDisputeAlert(params: {
  business: string;
  amountMinor: number;
  currency: string;
  reason: string;
  evidenceDueBy: Date | null;
  disputeId: string;
  /** Stripe test mode: the dashboard's test URL. */
  livemode?: boolean;
}): Promise<void> {
  const to = process.env.FOUNDER_ALERTS_EMAIL?.trim();
  if (!to) throw new Error('[notifications] FOUNDER_ALERTS_EMAIL is not set');
  const base = params.livemode
    ? 'https://dashboard.stripe.com/disputes/'
    : 'https://dashboard.stripe.com/test/disputes/';
  const rendered = renderFounderDisputeAlert({
    business: params.business,
    amount: formatMoney(params.amountMinor, params.currency, 'ro'),
    reason: params.reason,
    evidenceDueBy: params.evidenceDueBy,
    stripeUrl: base + encodeURIComponent(params.disputeId),
  });
  const result = await deliverEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (result.status !== 'sent') {
    throw new Error(`[notifications] dispute alert not delivered (${result.reason})`);
  }
}

/**
 * Lot 5.8 (P22, D5-11 b): a Growth campaign stopped by itself. To FOUNDER_ALERTS_EMAIL, with the
 * link to Founder · Growth (FOUNDER_APP_URL). Throws when the address is not set or the e-mail did
 * not leave, so the job reports it (the stop itself is already done and audited).
 */
export async function sendFounderGrowthStopAlert(params: {
  campaign: string;
  campaignId: string;
  rate: number;
  disturbing: number;
  impressions: number;
}): Promise<void> {
  const to = process.env.FOUNDER_ALERTS_EMAIL?.trim();
  if (!to) throw new Error('[notifications] FOUNDER_ALERTS_EMAIL is not set');
  const base = (process.env.FOUNDER_APP_URL ?? 'https://founder.ventora-hub.com').replace(
    /\/+$/,
    '',
  );
  const rendered = renderFounderGrowthStopAlert({
    campaign: params.campaign,
    rate: `${(params.rate * 100).toFixed(1).replace('.', ',')} %`,
    disturbing: params.disturbing,
    impressions: params.impressions,
    founderUrl: `${base}/growth/control?campaign=${encodeURIComponent(params.campaignId)}`,
  });
  const result = await deliverEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (result.status !== 'sent') {
    throw new Error(`[notifications] growth stop alert not delivered (${result.reason})`);
  }
}
