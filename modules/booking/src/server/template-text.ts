import { InvalidInput } from '@ventora/errors';

/*
 * Lot B.14b — the rules of the business's texts, without the database (the editor checks the same
 * rules in the browser as the server: the variables, the lengths).
 */

export const TEMPLATE_KINDS = [
  'confirmation',
  'reminder',
  'change',
  'cancellation',
  'thanks',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

/** The variables of S127 (the review link is B.16: not in these e-mails). */
export const TEMPLATE_VARS = [
  'client',
  'service',
  'date',
  'time',
  'member',
  'business',
  'link',
] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

export const TEMPLATE_LIMITS = { subject: 150, body: 2000 } as const;

export type TemplateText = { subject: string; body: string };

/** What the e-mail of one message is filled with. */
export type TemplateValues = Record<TemplateVar, string>;

const VAR = /\{([^{}\s]*)\}/g;

/** The unknown variables of a text, in order, once each (`{clinet}` → ['clinet']). */
export function unknownVariables(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(VAR)) {
    const name = m[1]!;
    if (!(TEMPLATE_VARS as readonly string[]).includes(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The subject and the text as saved: trimmed, within the limits, only known variables. */
export function validateTemplate(input: { subject?: unknown; body?: unknown }): TemplateText {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!subject) throw new InvalidInput('subject', 'required');
  if (subject.length > TEMPLATE_LIMITS.subject) throw new InvalidInput('subject', 'too_long');
  if (/[\r\n]/.test(subject)) throw new InvalidInput('subject', 'invalid');
  if (!body) throw new InvalidInput('body', 'required');
  if (body.length > TEMPLATE_LIMITS.body) throw new InvalidInput('body', 'too_long');
  for (const [field, text] of [
    ['subject', subject],
    ['body', body],
  ] as const) {
    const unknown = unknownVariables(text);
    // the screen shows „Variabila {var} nu există”, with the first one
    if (unknown.length) throw new InvalidInput(field, `unknown_variable:${unknown[0]}`);
  }
  return { subject, body };
}

/** The variables replaced by the message's values. */
export function fillTemplate(text: TemplateText, values: TemplateValues): TemplateText {
  const put = (s: string) =>
    s.replace(VAR, (whole, name: string) =>
      (TEMPLATE_VARS as readonly string[]).includes(name) ? values[name as TemplateVar] : whole,
    );
  return { subject: put(text.subject), body: put(text.body) };
}

/** The body as paragraphs (an empty line between them), as the e-mail shows them. */
export const paragraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export function isTemplateKind(v: unknown): v is TemplateKind {
  return typeof v === 'string' && (TEMPLATE_KINDS as readonly string[]).includes(v);
}

export function isTemplateLocale(v: unknown): v is TemplateLocale {
  return typeof v === 'string' && (TEMPLATE_LOCALES as readonly string[]).includes(v);
}
