'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  FileUpload,
  FormField,
  Icon,
  IconButton,
  Input,
  Radio,
  RadioGroup,
  Select,
  Textarea,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { isoDay, pickerDay } from '../new/new-format';
import { PublicActions, PublicShell } from './PublicShell';
import type { PublicFrame } from './BookingPublicView';
import s from './public.module.css';

/* The parts of the public page drawn in other components' previews:
   - PublicQuestions: „Câteva întrebări de la salon” (BookingCustomForms S127 frames 4–5; the photo
     of S146 frames 10–15) at the details step;
   - PublicLocationStep: „Alegeți salonul” (BookingLocations S126 frame 6), the first step when the
     business has several locations;
   - PublicSessions: the sessions of a class with the seats left (B.9d2, D-9d-3) — no frame draws
     them yet (NECESITĂ DESIGN): built from the option rows of the page and the keys of
     BookingClasses („{n} locuri libere”, „Plin”).
   Props only. */

export type PublicQuestion = {
  id: string;
  label: string;
  kind: 'short_text' | 'long_text' | 'yes_no' | 'choice' | 'multi' | 'number' | 'date';
  options: string[] | null;
  helpText: string | null;
  required: boolean;
  allowsPhoto: boolean;
};
export type PublicAnswer = string | string[] | null;

export type PublicPhoto =
  | { status: 'ready' | 'uploading' | 'done'; name: string; size: string; progress?: number }
  | { status: 'error'; name: string; error: 'type' | 'size' | 'count' | 'failed'; size: string };

export function PublicQuestions(p: {
  questions: PublicQuestion[];
  answers: Record<string, PublicAnswer>;
  onAnswer?: (id: string, value: PublicAnswer) => void;
  /** The required questions left empty at „Trimite codul”. */
  missing?: string[];
  photos?: Record<string, PublicPhoto | undefined>;
  onPhoto?: (id: string, file: File | null) => void;
  /** The 5 photos per booking are used. */
  photosFull?: boolean;
  mode: ScreenMode;
}) {
  const t = useTranslations('booking.forms');
  const ph = useTranslations('booking.public.photo');
  const ui = useTranslations('ui');
  const locale = useLocale();
  if (p.questions.length === 0) return null;
  const labels = {
    dropFiles: ui('upload.dropFiles'),
    dropNow: ui('upload.dropNow'),
    browse: ui('upload.browse'),
    maxSize: (size: string) => ui('upload.maxSize', { size }),
    uploaded: ui('upload.uploaded'),
    retry: ph('retry'),
    remove: ph('remove'),
  };
  return (
    <fieldset className={s.questions}>
      <legend className="subheading">{t('pub.section')}</legend>
      {p.questions.map((q) => {
        const v = p.answers[q.id] ?? null;
        const err = p.missing?.includes(q.id) ? t('pub.required') : undefined;
        const field = (control: React.ReactNode) => (
          <FormField
            key={q.id}
            label={q.label}
            required={q.required}
            isOptional={!q.required}
            optionalLabel={ui('optional')}
            hint={err ? undefined : (q.helpText ?? undefined)}
            error={err}
          >
            {control}
          </FormField>
        );
        const set = (value: PublicAnswer) => p.onAnswer?.(q.id, value);
        let control: React.ReactNode;
        switch (q.kind) {
          case 'long_text':
            control = (
              <Textarea
                rows={2}
                maxLength={1000}
                value={(v as string) ?? ''}
                onChange={(e) => set(e.target.value)}
              />
            );
            break;
          case 'yes_no':
            control = (
              <RadioGroup
                aria-label={q.label}
                value={(v as string) ?? null}
                onChange={set}
                isInvalid={!!err}
                orientation="horizontal"
              >
                <Radio value="yes">{t('yes')}</Radio>
                <Radio value="no">{t('no')}</Radio>
              </RadioGroup>
            );
            break;
          case 'choice':
            // a short list as radio buttons, a longer one as a Select (the two forms of frame 4)
            control =
              (q.options ?? []).length <= 3 ? (
                <RadioGroup
                  aria-label={q.label}
                  value={(v as string) ?? null}
                  onChange={set}
                  isInvalid={!!err}
                >
                  {(q.options ?? []).map((o) => (
                    <Radio key={o} value={o}>
                      {o}
                    </Radio>
                  ))}
                </RadioGroup>
              ) : (
                <Select
                  value={(v as string) ?? undefined}
                  onChange={set}
                  isInvalid={!!err}
                  options={(q.options ?? []).map((o) => ({ value: o, label: o }))}
                />
              );
            break;
          case 'multi': {
            const chosen = Array.isArray(v) ? v : [];
            control = (
              <div className={s.stack}>
                {(q.options ?? []).map((o) => (
                  <Checkbox
                    key={o}
                    isSelected={chosen.includes(o)}
                    isInvalid={!!err}
                    onChange={(on) => set(on ? [...chosen, o] : chosen.filter((x) => x !== o))}
                  >
                    {o}
                  </Checkbox>
                ))}
              </div>
            );
            break;
          }
          case 'number':
            control = (
              <Input
                type="number"
                inputMode="numeric"
                value={(v as string) ?? ''}
                isInvalid={!!err}
                onChange={(e) => set(e.target.value)}
              />
            );
            break;
          case 'date':
            control = (
              <DatePicker
                value={pickerDay((v as string) ?? null) ?? null}
                locale={locale}
                invalid={!!err}
                onChange={(d) => d instanceof Date && set(isoDay(d))}
              />
            );
            break;
          default:
            control = (
              <Input
                value={(v as string) ?? ''}
                maxLength={500}
                isInvalid={!!err}
                onChange={(e) => set(e.target.value)}
              />
            );
        }
        const photo = p.photos?.[q.id];
        return (
          <div key={q.id} className={s.stack}>
            {field(control)}
            {q.allowsPhoto && (
              <FormField
                label={ph('add')}
                isOptional
                optionalLabel={ui('optional')}
                error={p.photosFull && !photo ? ph('errCount') : undefined}
              >
                {photo && photo.status !== 'error' && photo.status !== 'uploading' ? (
                  <div className={s.photo}>
                    <div className={s.photoThumb} aria-hidden>
                      <Icon icon="image" size={20} />
                    </div>
                    <div className={s.photoText}>
                      <p className="body-strong v-truncate">{photo.name}</p>
                      <p className={`caption ${s.muted}`}>{`${ph('done')} · ${photo.size}`}</p>
                    </div>
                    {p.mode === 'mobile' ? (
                      <IconButton
                        icon="trash-2"
                        size="sm"
                        label={ph('remove')}
                        onPress={() => p.onPhoto?.(q.id, null)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="quiet"
                        icon="trash-2"
                        onPress={() => p.onPhoto?.(q.id, null)}
                      >
                        {ph('remove')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <FileUpload
                    files={
                      photo
                        ? [
                            photo.status === 'error'
                              ? {
                                  id: q.id,
                                  name: photo.name,
                                  status: 'error' as const,
                                  error:
                                    photo.error === 'type'
                                      ? ph('errType')
                                      : photo.error === 'size'
                                        ? ph('errSize', { size: photo.size })
                                        : photo.error === 'count'
                                          ? ph('errCount')
                                          : ph('retry'),
                                }
                              : {
                                  id: q.id,
                                  name: photo.name,
                                  status: 'uploading' as const,
                                  progress: photo.progress,
                                },
                          ]
                        : []
                    }
                    accept="image/png,image/jpeg"
                    multiple={false}
                    hint={ph('hint')}
                    isDisabled={p.photosFull}
                    isInvalid={photo?.status === 'error' || p.photosFull}
                    labels={labels}
                    locale={locale}
                    onSelect={(files) => p.onPhoto?.(q.id, files[0] ?? null)}
                    onRemove={() => p.onPhoto?.(q.id, null)}
                  />
                )}
              </FormField>
            )}
          </div>
        );
      })}
      {p.questions.some((q) => q.allowsPhoto) && (
        <p className={`caption ${s.muted}`}>{ph('privacy')}</p>
      )}
    </fieldset>
  );
}

export type PublicLocation = {
  id: string;
  name: string;
  address: string | null;
  today?: string | null;
};

/** „Alegeți salonul” — pasul 1 din 5 (BookingLocations, frame 6). */
export function PublicLocationStep(
  p: PublicFrame & {
    locations: PublicLocation[];
    value: string | null;
    onChange?: (id: string) => void;
    onContinue?: () => void;
  },
) {
  const t = useTranslations('booking.locations.pub');
  const pub = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell
      mode={p.mode}
      business={p.business}
      lang={p.lang}
      onLang={p.onLang}
      brand={p.brand}
      step={{ n: 1, total: 5 }}
      title={t('title')}
    >
      <RadioGroup aria-label={t('title')} value={p.value} onChange={p.onChange}>
        {p.locations.map((l) => (
          <div key={l.id} className={`${s.opt} ${p.value === l.id ? s.on : ''}`}>
            <Radio
              value={l.id}
              className={s.optRadio}
              description={[l.address, l.today ? t('hours', { hours: l.today }) : null]
                .filter(Boolean)
                .join(' · ')}
            >
              {`${p.business.name} · ${l.name}`}
            </Radio>
          </div>
        ))}
      </RadioGroup>
      <PublicActions mode={p.mode}>
        <Button
          variant="primary"
          block={mob}
          iconEnd="arrow-right"
          isDisabled={!p.value}
          onPress={p.onContinue}
        >
          {pub('continue')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export type PublicSession = {
  id: string;
  /** „18:00–18:50” */
  time: string;
  member: string;
  seatsLeft: number;
};

/** The Romanian plural of the BookingClasses keys (left.one / few / many), as preview.html. */
export function seatsKey(n: number): 'left.one' | 'left.few' | 'left.many' {
  if (n === 1) return 'left.one';
  return n === 0 || (n % 100 > 0 && n % 100 < 20) ? 'left.few' : 'left.many';
}

/** The sessions of a class on the chosen day (B.9d2): a full one cannot be chosen. */
export function PublicSessions(p: {
  label: string;
  sessions: PublicSession[];
  value: string | null;
  onChange?: (id: string) => void;
}) {
  const c = useTranslations('booking.classes');
  return (
    <RadioGroup aria-label={p.label} value={p.value} onChange={p.onChange}>
      {p.sessions.map((x) => (
        <div key={x.id} className={`${s.opt} ${p.value === x.id ? s.on : ''}`}>
          <Radio
            value={x.id}
            className={s.optRadio}
            description={x.member}
            isDisabled={x.seatsLeft <= 0}
          >
            {x.time}
          </Radio>
          <Badge>
            {x.seatsLeft <= 0 ? c('full') : c(seatsKey(x.seatsLeft), { n: x.seatsLeft })}
          </Badge>
        </div>
      ))}
    </RadioGroup>
  );
}

export type PublicHealthField = { id: string; label: string; value: string };

/**
 * BookingHealthFields on the public page (S116 e; BookingPublic frames 8b–8c): the optional health
 * fields with the explicit consent; consent is required only when a field is filled (B.8).
 */
export function PublicHealthFields(p: {
  fields: PublicHealthField[];
  onField?: (id: string, value: string) => void;
  consent: boolean;
  onConsent?: (v: boolean) => void;
  /** A field filled without the consent. */
  error?: boolean;
}) {
  const t = useTranslations('booking.health.c');
  const ui = useTranslations('ui');
  return (
    <fieldset className={s.questions}>
      <legend className="subheading">{t('section')}</legend>
      <p className={`body-small ${s.muted}`}>{t('lead')}</p>
      {p.fields.map((f) => (
        <FormField key={f.id} label={f.label} isOptional optionalLabel={ui('optional')}>
          <Input
            value={f.value}
            maxLength={500}
            onChange={(e) => p.onField?.(f.id, e.target.value)}
          />
        </FormField>
      ))}
      <FormField
        label={t('consent')}
        labelHidden
        error={p.error ? t('err') : undefined}
        hint={p.error ? undefined : t('consentHelp')}
      >
        <Checkbox isSelected={p.consent} isInvalid={p.error} onChange={p.onConsent}>
          {t('consent')}
        </Checkbox>
      </FormField>
    </fieldset>
  );
}
