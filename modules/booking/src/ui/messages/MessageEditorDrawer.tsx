'use client';

import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  Drawer,
  FormField,
  Input,
  Notice,
  SegmentedControl,
  Select,
  Textarea,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import type { MessageChannel, MessageId } from './BookingMessagesView';
import sv from '../services/services.module.css';
import s from './messages.module.css';

/* BookingMessageTemplates (S127) · „Editează mesajul”: a wide Drawer (stacked on tablets and phones)
   with the channel, the subject (e-mail), the text, „Inserează” with the variables, when it leaves,
   „Revino la textul inițial”, and the preview next to it. Controlled: the page keeps the text and the
   error. The SMS (B.17), the review request (B.16) and the team notice (B.15) are drawn here as in the
   design; the application opens only the e-mails to clients. When it leaves (B.14c): the reminder's
   hours and the thanks' moment are chosen here; the confirmation, the change and the cancellation
   leave at once (`whenDisabled`). */

export type WhenOption = { value: string; label: string };

export type MessageEditorDrawerProps = {
  mode: ScreenMode;
  kind: MessageId;
  /** The channels offered (S127: E-mail / SMS, or Notificare / E-mail for the team). */
  channels: MessageChannel[];
  channel: MessageChannel;
  onChannelChange?: (c: MessageChannel) => void;
  subject?: string;
  onSubjectChange?: (v: string) => void;
  body: string;
  onBodyChange?: (v: string) => void;
  /** The variables of „Inserează” ({client}…). */
  variables: readonly string[];
  /** An error under the subject or the text (already in words). */
  error?: { field: 'subject' | 'body'; text: string } | null;
  /** SMS: under the text („SMS-urile pleacă fără diacritice…”), and the 2-SMS notice. */
  smsOver?: boolean;
  /** When it leaves: the options, the chosen one, and the hours (not for the SMS). */
  when?: { options: WhenOption[]; value: string; hours?: number | string | null };
  /** Fixed (the confirmation, the change and the cancellation leave at once). */
  whenDisabled?: boolean;
  /** B.14c: the reminder and the thanks — the option and the hours, and an error under the hours. */
  onWhenChange?: (value: string) => void;
  onHoursChange?: (value: string) => void;
  hoursError?: string | null;
  /** The review request (B.16): the link and the two rules. */
  review?: { link: string; onlyDone: boolean; limitDays: number };
  /** The team notice (B.15): who receives it. */
  team?: { member: boolean; owner: boolean; reception: boolean };
  preview: ReactNode;
  busy?: boolean;
  onReset?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  isOpen?: boolean;
  /** Drawn in a gallery frame. */
  framed?: boolean;
};

export function MessageEditorDrawer(p: MessageEditorDrawerProps) {
  const t = useTranslations('booking.msg');
  const ui = useTranslations('ui');
  const mob = p.mode === 'mobile';
  const sms = p.channel === 'sms';
  const team = !!p.team;
  // the cursor in the text (the Textarea does not forward a ref): where „Inserează” puts the variable
  const cursor = useRef<{ at: number; to: number } | null>(null);

  /** „Inserează”: the variable at the cursor (at the end without one). */
  const insert = (v: string) => {
    const token = `{${v}}`;
    const at = cursor.current?.at ?? p.body.length;
    const to = cursor.current?.to ?? at;
    p.onBodyChange?.(p.body.slice(0, at) + token + p.body.slice(to));
    cursor.current = { at: at + token.length, to: at + token.length };
  };

  const form = (
    <div className={sv.stack}>
      <div className={s.start}>
        <SegmentedControl
          size="sm"
          aria-label={t('channel')}
          value={p.channel}
          onChange={(v) => p.onChannelChange?.(v as MessageChannel)}
          options={p.channels.map((c) => ({ value: c, label: t(`ch.${c}`) }))}
        />
      </div>
      {sms || team ? null : (
        <FormField
          label={t('subject')}
          isRequired
          error={p.error?.field === 'subject' ? p.error.text : undefined}
        >
          <Input
            value={p.subject ?? ''}
            onChange={(e) => p.onSubjectChange?.(e.target.value)}
            isInvalid={p.error?.field === 'subject'}
          />
        </FormField>
      )}
      <FormField
        label={t('body')}
        isRequired
        error={p.error?.field === 'body' ? p.error.text : undefined}
        hint={sms && !p.error ? t('smsNoDiacritics') : undefined}
      >
        <Textarea
          onSelect={(e) =>
            (cursor.current = {
              at: e.currentTarget.selectionStart,
              to: e.currentTarget.selectionEnd,
            })
          }
          rows={sms ? 4 : 7}
          value={p.body}
          onChange={(e) => p.onBodyChange?.(e.target.value)}
          isInvalid={p.error?.field === 'body'}
        />
      </FormField>
      <div className={s.vars}>
        <span className="caption muted">{t('insert')}</span>
        {p.variables.map((v) => (
          <Button
            key={v}
            size="sm"
            variant="secondary"
            aria-label={`{${v}} · ${t(`v.${v}`)}`}
            onPress={() => insert(v)}
          >
            {`{${v}}`}
          </Button>
        ))}
      </div>
      {p.smsOver ? (
        <Notice className={sv.notice} tone="attention" icon="message-square" title={t('smsOver')} />
      ) : null}
      <p className="subheading">{t('whenTitle')}</p>
      {team ? (
        <FormField label={t('team.who')}>
          <div className={sv.stack}>
            <Checkbox isSelected={p.team!.member}>{t('team.member')}</Checkbox>
            <Checkbox isSelected={p.team!.owner}>{t('team.owner')}</Checkbox>
            <Checkbox isSelected={p.team!.reception}>{t('team.reception')}</Checkbox>
          </div>
        </FormField>
      ) : p.when ? (
        <div className={sv.g2f}>
          <FormField label={t('whenTitle')}>
            <Select
              value={p.when.value}
              isDisabled={p.whenDisabled || p.when.options.length < 2}
              options={p.when.options}
              onChange={p.onWhenChange}
            />
          </FormField>
          {p.when.hours != null ? (
            <FormField label={t('hours')} error={p.hoursError ?? undefined}>
              <Input
                type="number"
                inputMode="numeric"
                {...(p.onHoursChange
                  ? {
                      value: String(p.when.hours),
                      onChange: (e: ChangeEvent<HTMLInputElement>) =>
                        p.onHoursChange?.(e.target.value),
                    }
                  : { defaultValue: String(p.when.hours) })}
                disabled={p.whenDisabled}
                isInvalid={!!p.hoursError}
                suffix={<span className="body-small muted">{t('hours')}</span>}
              />
            </FormField>
          ) : null}
        </div>
      ) : null}
      {p.review ? (
        <>
          <FormField label={t('review.link')} isRequired hint={t('review.linkHelp')}>
            <Input type="url" value={p.review.link} readOnly />
          </FormField>
          <Checkbox isSelected={p.review.onlyDone}>{t('review.onlyDone')}</Checkbox>
          <Checkbox isSelected>{t('review.limit', { n: p.review.limitDays })}</Checkbox>
        </>
      ) : null}
      <div>
        <Button size="sm" variant="quiet" icon="rotate-ccw" onPress={p.onReset}>
          {t('reset')}
        </Button>
      </div>
    </div>
  );

  const preview = (
    <div className={`${sv.stack} ${s.prev}`}>
      <p className="subheading">{t('preview')}</p>
      <p className="caption muted">{t('previewWith')}</p>
      {p.preview}
    </div>
  );

  const footer = (
    <div className={`${sv.foot} ${mob ? sv.m : ''}`}>
      <span className={sv.grow} />
      <Button variant="quiet" onPress={p.onCancel}>
        {ui('cancel')}
      </Button>
      <Button variant="primary" icon="check" onPress={p.onSave} isPending={p.busy}>
        {t('save')}
      </Button>
    </div>
  );

  return (
    <Drawer
      contained={p.framed}
      isOpen={p.framed ? undefined : p.isOpen}
      onOpenChange={(o) => !o && p.onCancel?.()}
      onClose={p.onCancel}
      layout={mob ? 'full' : 'auto'}
      width={mob ? 520 : 960}
      title={t('editTitle')}
      subtitle={t(`t.${p.kind}`)}
      footer={footer}
    >
      <div className={sv.stack}>
        <div className={`${s.grid} ${p.mode !== 'desktop' ? s.m : ''}`}>
          {form}
          {preview}
        </div>
      </div>
    </Drawer>
  );
}

/** SMS length (S127: „112 caractere · 1 SMS”; over 160, two). */
export function smsLength(text: string): { chars: number; parts: number } {
  const chars = [...text].length;
  return { chars, parts: chars <= 160 ? 1 : Math.ceil(chars / 153) };
}

/** The SMS bubble of the preview (S127). */
export function SmsPreview({ text, caption }: { text: string; caption?: string }) {
  return (
    <div className={s.sms}>
      <div className={`${s.bubble} body-small`}>{text}</div>
      {caption ? <p className="caption muted">{caption}</p> : null}
    </div>
  );
}
