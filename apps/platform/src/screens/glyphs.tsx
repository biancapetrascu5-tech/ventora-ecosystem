'use client';

import { KeyRound, Laptop, MailCheck, MessageSquare, type LucideProps } from 'lucide-react';

/* Iconițe pe care designul le folosește, dar care lipsesc din registrul Icon din packages/ui
   (key-round, laptop, mail-check, message-square). Desenate la fel ca Icon (lucide, linie 1.75).
   DE VALIDAT TEHNIC: de adăugat în registrul din packages/ui, apoi de înlocuit cu <Icon>. */
const GLYPHS = {
  'key-round': KeyRound,
  laptop: Laptop,
  'mail-check': MailCheck,
  'message-square': MessageSquare,
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({
  name,
  size = 16,
  ...props
}: { name: GlyphName; size?: number } & LucideProps) {
  const C = GLYPHS[name];
  return (
    <C
      size={size}
      strokeWidth={1.75}
      aria-hidden
      focusable={false}
      style={{ display: 'block', flex: 'none' }}
      {...props}
    />
  );
}
