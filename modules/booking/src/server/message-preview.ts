import type { TenantContext } from '@ventora/access';
import { platformLink } from '@ventora/notifications';
import { getOrganizationCard, listLocations } from '@ventora/organizations';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { hubOnly } from './actor';
import { getBookingSettingsInOrg, type ClientLocale } from './appointments';
import { clientEmailParts, type ClientEmailParts } from './client-emails';
import {
  isTemplateKind,
  isTemplateLocale,
  validateTemplate,
  type TemplateKind,
} from './message-templates';

/*
 * Lot B.14b — „Previzualizare · Cu datele unei programări de exemplu” (S127): the e-mail exactly as
 * the job renders it (renderClientEmail), with the text being edited (not saved yet), the business's
 * name and first address, and the example booking of the design. Nothing is written, nothing is sent.
 */

/** The example booking of S127 (Cristina Dobre, Vopsit rădăcină with Ioana Pavel, at 10:00). */
export const PREVIEW_EXAMPLE = {
  clientName: 'Cristina Dobre',
  to: 'cristina.dobre@gmail.com',
  service: 'Vopsit rădăcină',
  member: 'Ioana Pavel',
  movedFromHoursBefore: 24,
} as const;

/** Two days from now, at 10:00 in the business's time zone (whatever the server's zone). */
function exampleStart(timeZone: string, now = new Date()): Date {
  const day = new Date(now.getTime() + 2 * 86_400_000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(day);
  const guess = new Date(`${ymd}T10:00:00Z`);
  // the zone's offset at that moment (e.g. +02:00 → 10:00 local = 08:00 UTC)
  const local = new Date(guess.toLocaleString('en-US', { timeZone }));
  return new Date(guess.getTime() - (local.getTime() - guess.getTime()));
}

export async function previewMessageTemplateInOrg(
  ctx: TenantContext,
  input: { kind?: unknown; locale?: unknown; subject?: unknown; body?: unknown },
): Promise<ClientEmailParts> {
  hubOnly(ctx);
  if (!isTemplateKind(input.kind)) throw new InvalidInput('kind', 'invalid');
  if (!isTemplateLocale(input.locale)) throw new InvalidInput('locale', 'invalid');
  const kind: TemplateKind = input.kind;
  const locale: ClientLocale = input.locale;
  const text = validateTemplate(input);
  const org = await getOrganizationCard(ctx.organizationId);
  if (!org) throw new ResourceNotFound('organization');
  const where = (await listLocations({ organizationId: ctx.organizationId }))[0]?.address ?? null;
  const startsAt = exampleStart(org.timeZone);
  return clientEmailParts({
    kind,
    locale,
    business: org.name,
    timeZone: org.timeZone,
    clientName: PREVIEW_EXAMPLE.clientName,
    to: PREVIEW_EXAMPLE.to,
    service: PREVIEW_EXAMPLE.service,
    member: PREVIEW_EXAMPLE.member,
    startsAt,
    where,
    manageUrl:
      kind === 'cancellation' || kind === 'thanks'
        ? null
        : platformLink(`/r/${org.slug}/m/exemplu`),
    bookUrl: platformLink(`/r/${org.slug}`),
    freeCancelHours: (await getBookingSettingsInOrg(ctx)).freeCancelHours,
    cancelledBy: 'business',
    movedFrom:
      kind === 'change'
        ? new Date(startsAt.getTime() - PREVIEW_EXAMPLE.movedFromHoursBefore * 3_600_000)
        : null,
    movedByClient: false,
    custom: text,
  });
}
