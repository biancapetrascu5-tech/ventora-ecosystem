'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Dialog,
  DialogTrigger,
  FileUpload,
  fmtSize,
  FormField,
  Icon,
  Input,
  Notice,
  PageHeader,
  Radio,
  RadioGroup,
  SegmentedControl,
  Sheet,
  SheetSection,
  Textarea,
  Toast,
  type UploadFile,
} from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import {
  confirmLogo,
  resetBrand,
  saveBrand,
  startLogoUpload,
  type BrandData,
} from '@/server/brand-actions';
import {
  contrast,
  formatRatio,
  MIN_ACCENT_CONTRAST,
  MIN_TEXT_CONTRAST,
  normalizeHex,
  readableShade,
  shade,
  VENTORA_ACCENT,
  VENTORA_PRIMARY,
} from './contrast';
import s from './brand.module.css';

/*
 * HubBrand (S148, approved 14.11.2026): Afacerea › Brand. How the business appears to its clients:
 * the logos, the colours (with the contrast check of the white button text), the font, the tone
 * and the e-mail signature, with the live preview of the EasyBook page and of an e-mail. Only the
 * owner and the admins change it (the server refuses the rest); the members read it.
 *
 * Decisions of 14.11: the logo is PNG / JPG (no SVG), at least 256 px, at most 2 MB; the button
 * text is always white; the default tone is formal; the dark logo is optional (white plate).
 */

type Font = 'modern' | 'expressive' | 'classic' | 'rounded';
type Tone = 'formal' | 'friendly' | 'short';
type Variant = 'light' | 'dark';

const FONTS: Font[] = ['modern', 'expressive', 'classic', 'rounded'];
/** The design's keys for the fonts (hub.brand.font.*). */
const FONT_KEY: Record<Font, 'sans' | 'display' | 'serif' | 'rounded'> = {
  modern: 'sans',
  expressive: 'display',
  classic: 'serif',
  rounded: 'rounded',
};
const FONT_CLASS: Record<Font, string> = {
  modern: s['f-modern']!,
  expressive: s['f-expressive']!,
  classic: s['f-classic']!,
  rounded: s['f-rounded']!,
};
const LOGO_TYPES = ['image/png', 'image/jpeg'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIN_SIDE = 256;
const SIG_MAX = 300;

type Draft = {
  logoLightFileId: string | null;
  logoDarkFileId: string | null;
  /** What the person types; checked on save. Empty = the Ventora colour. */
  primary: string;
  accent: string;
  font: Font;
  tone: Tone;
  signature: string;
};

function draftOf(b: BrandData['brand']): Draft {
  return {
    logoLightFileId: b.logoLightFileId,
    logoDarkFileId: b.logoDarkFileId,
    primary: b.primaryColor ?? '',
    accent: b.accentColor ?? '',
    font: (b.font ?? 'modern') as Font,
    tone: b.tone as Tone,
    signature: b.emailSignature ?? '',
  };
}

const hasBrand = (b: BrandData['brand']) =>
  !!(b.logoLightFileId || b.primaryColor || b.accentColor || b.font || b.emailSignature) ||
  b.tone !== 'formal';

/** The pixel size of an image the person picked, before it is sent. */
function imageSizeOf(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function BrandScreen({ data }: { data: BrandData }) {
  const t = useTranslations('hub.brand');
  const biz = useTranslations('hub.business');
  const nav = useTranslations('hub.nav');
  const ui = useTranslations('ui');
  const up = useTranslations('ui.upload');
  const locale = useLocale();
  const phone = useIsPhone();
  const router = useRouter();
  const readOnly = !data.canEdit;

  const [saved, setSaved] = useState(data.brand);
  const [draft, setDraft] = useState<Draft>(() => draftOf(data.brand));
  // the preview of a logo just uploaded (not served by /brand/logo until it is saved)
  const [logoSrc, setLogoSrc] = useState<Record<Variant, string | null>>({
    light: data.logoLight,
    dark: data.logoDark,
  });
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Variant | null>(null);
  const [toast, setToast] = useState<{ tone: 'done' | 'danger'; title: string } | null>(null);
  const [tab, setTab] = useState<'page' | 'email'>('page');
  const [errors, setErrors] = useState<{ primary?: boolean; accent?: boolean; sig?: string }>({});
  const pick = useRef<HTMLInputElement>(null);
  const picking = useRef<Variant>('light');

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const primary = normalizeHex(draft.primary);
  const accent = normalizeHex(draft.accent);
  const branded = hasBrand(saved);

  // ── the logo ─────────────────────────────────────────────────────────────────────────────
  function chooseLogo(variant: Variant) {
    picking.current = variant;
    pick.current?.click();
  }

  async function uploadLogo(file: File) {
    const variant = picking.current;
    const row = (patch: Partial<UploadFile>): UploadFile => ({
      id: file.name,
      name: file.name,
      size: file.size,
      status: 'uploading',
      ...patch,
    });
    if (!LOGO_TYPES.includes(file.type)) {
      setFiles([row({ status: 'error', error: biz('logo.errType', { name: file.name }) })]);
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      const size = fmtSize(file.size, locale);
      setFiles([row({ status: 'error', error: biz('logo.errSize', { name: file.name, size }) })]);
      return;
    }
    const dims = await imageSizeOf(file);
    if (dims && Math.min(dims.w, dims.h) < LOGO_MIN_SIDE) {
      setFiles([row({ status: 'error', error: t('logo.errSmall', { w: dims.w, h: dims.h }) })]);
      return;
    }
    setFiles([row({ progress: 30 })]);
    const failed = (error: string) => setFiles([row({ status: 'error', error })]);
    const start = await startLogoUpload({
      variant,
      name: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!start.ok) {
      failed(
        start.reason === 'type'
          ? biz('logo.errType', { name: file.name })
          : start.reason === 'size'
            ? biz('logo.errSize', { name: file.name, size: fmtSize(file.size, locale) })
            : biz('logo.uploadFailed'),
      );
      return;
    }
    try {
      const res = await fetch(start.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      failed(biz('logo.uploadFailed'));
      return;
    }
    setFiles([row({ progress: 80 })]);
    const confirmed = await confirmLogo(start.fileId);
    if (!confirmed.ok) {
      failed(
        confirmed.reason === 'small'
          ? t('logo.errSmall', { w: dims?.w ?? 0, h: dims?.h ?? 0 })
          : confirmed.reason === 'type'
            ? biz('logo.errType', { name: file.name })
            : biz('logo.uploadFailed'),
      );
      return;
    }
    setFiles([]);
    setLogoSrc((x) => ({ ...x, [variant]: URL.createObjectURL(file) }));
    set(variant === 'light' ? { logoLightFileId: start.fileId } : { logoDarkFileId: start.fileId });
  }

  async function removeLogo(): Promise<void> {
    const variant = removing;
    if (!variant) return;
    setBusy(true);
    const res = await saveBrand(
      variant === 'light' ? { logoLightFileId: null } : { logoDarkFileId: null },
    );
    setBusy(false);
    setRemoving(null);
    if (!res.ok) {
      setToast({ tone: 'danger', title: biz('logo.uploadFailed') });
      return;
    }
    setSaved(res.brand);
    setDraft((d) => ({
      ...d,
      logoLightFileId: res.brand.logoLightFileId,
      logoDarkFileId: res.brand.logoDarkFileId,
    }));
    setLogoSrc((x) => (variant === 'light' ? { light: null, dark: null } : { ...x, dark: null }));
    setToast({ tone: 'done', title: biz('logo.removed') });
    router.refresh();
  }

  // ── save / reset ─────────────────────────────────────────────────────────────────────────
  async function save() {
    const next = {
      primary: draft.primary.trim() === '' ? null : primary,
      accent: draft.accent.trim() === '' ? null : accent,
    };
    const invalid = {
      primary: draft.primary.trim() !== '' && !primary,
      accent: draft.accent.trim() !== '' && !accent,
    };
    setErrors(invalid);
    if (invalid.primary || invalid.accent) return;
    setBusy(true);
    const res = await saveBrand({
      logoLightFileId: draft.logoLightFileId,
      logoDarkFileId: draft.logoLightFileId ? draft.logoDarkFileId : null,
      primaryColor: next.primary,
      accentColor: next.accent,
      font: draft.font === 'modern' ? null : draft.font,
      tone: draft.tone,
      emailSignature: draft.signature.trim() === '' ? null : draft.signature,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.reason === 'invalid' && res.field === 'emailSignature') {
        setErrors({ sig: t('sig.help') });
        return;
      }
      setToast({ tone: 'danger', title: biz('logo.uploadFailed') });
      return;
    }
    setSaved(res.brand);
    setDraft(draftOf(res.brand));
    setToast({ tone: 'done', title: t('saved') });
    router.refresh();
  }

  async function reset() {
    setBusy(true);
    const res = await resetBrand();
    setBusy(false);
    if (!res.ok) {
      setToast({ tone: 'danger', title: biz('logo.uploadFailed') });
      return;
    }
    const empty = {
      ...saved,
      logoLightFileId: null,
      logoDarkFileId: null,
      primaryColor: null,
      accentColor: null,
      font: null,
      tone: 'formal' as const,
      emailSignature: null,
    };
    setSaved(empty);
    setDraft(draftOf(empty));
    setLogoSrc({ light: null, dark: null });
    router.refresh();
  }

  // ── the preview's look ───────────────────────────────────────────────────────────────────
  const look = {
    logo: draft.logoLightFileId ? logoSrc.light : null,
    primary: primary ?? VENTORA_PRIMARY,
    accent: accent,
    font: draft.font,
    tone: draft.tone,
    signature: draft.signature.trim(),
  };

  const actions = readOnly ? null : (
    <>
      {branded && (
        <Button variant="quiet" icon="undo-2" isDisabled={busy} onPress={() => void reset()}>
          {t('reset')}
        </Button>
      )}
      <Button variant="primary" icon="check" isPending={busy} onPress={() => void save()}>
        {t('save')}
      </Button>
    </>
  );

  return (
    <div className={s.wrap}>
      <PageHeader
        title={nav('brand')}
        description={phone ? undefined : t('lead')}
        actions={phone ? undefined : actions}
      />
      <div className={s.grid}>
        <Sheet>
          {readOnly && (
            <SheetSection>
              <Notice tone="neutral" icon="lock">
                {t('ownerOnly')}
              </Notice>
            </SheetSection>
          )}
          {!branded && !readOnly && (
            <SheetSection>
              <Notice tone="neutral" icon="info">
                {t('default')}
              </Notice>
            </SheetSection>
          )}

          <SheetSection title={t('logo.title')} description={t('logo.lead')}>
            <div className={s.stack}>
              <div className={s.row}>
                {(['light', 'dark'] as const).map((v) => {
                  const id = v === 'light' ? draft.logoLightFileId : draft.logoDarkFileId;
                  const src = id ? logoSrc[v] : null;
                  return (
                    <div key={v} className={s.tile}>
                      <p className={`body-strong ${s.m0}`}>{t(`logo.${v}`)}</p>
                      <div
                        className={`${s.tileBox} ${src ? s.hasLogo : ''}`}
                        data-theme={v === 'dark' ? 'dark' : 'light'}
                      >
                        {src ? <img src={src} alt="" /> : <Icon icon="image" size={24} />}
                      </div>
                      {v === 'dark' && !src && (
                        <p className={`caption ${s.m0} ${s.muted}`}>{t('logo.darkHelp')}</p>
                      )}
                      {!readOnly && files.length === 0 && (
                        <div className={s.tileButtons}>
                          {src ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="upload"
                                onPress={() => chooseLogo(v)}
                              >
                                {biz('logo.replace')}
                              </Button>
                              <Button
                                size="sm"
                                variant="quiet"
                                icon="trash-2"
                                onPress={() => setRemoving(v)}
                              >
                                {biz('logo.remove')}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon="upload"
                              isDisabled={v === 'dark' && !draft.logoLightFileId}
                              onPress={() => chooseLogo(v)}
                            >
                              {biz('logo.upload')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {files.length > 0 ? (
                <FileUpload
                  accept="image/png,image/jpeg"
                  hint={t('logo.rules')}
                  isInvalid={files.some((f) => f.status === 'error')}
                  files={files}
                  locale={locale}
                  onSelect={(list) => list[0] && void uploadLogo(list[0])}
                  onRemove={() => setFiles([])}
                  onRetry={() => {
                    setFiles([]);
                    chooseLogo(picking.current);
                  }}
                  labels={{
                    dropFiles: up('dropFiles'),
                    dropNow: up('dropNow'),
                    browse: up('browse'),
                    maxSize: (size) => up('maxSize', { size }),
                    uploaded: up('uploaded'),
                    retry: up('retry'),
                    remove: up('remove'),
                  }}
                />
              ) : (
                <p className={`caption ${s.m0} ${s.muted}`}>{t('logo.rules')}</p>
              )}
              <input
                ref={pick}
                type="file"
                accept="image/png,image/jpeg"
                className={s.hidden}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadLogo(f);
                }}
              />
              <p className={`body-small ${s.m0} ${s.secondary}`}>
                {`${biz('name')}: ${data.name} · ${biz('nameHelp')}`}
              </p>
            </div>
          </SheetSection>

          <SheetSection title={t('color.title')} description={t('color.lead')}>
            <div className={s.row}>
              <ColorField
                label={t('color.primary')}
                value={draft.primary}
                fallback={VENTORA_PRIMARY}
                invalid={!!errors.primary}
                readOnly={readOnly}
                onChange={(primary) => set({ primary })}
              />
              <ColorField
                label={t('color.accent')}
                value={draft.accent}
                fallback={VENTORA_ACCENT}
                isAccent
                invalid={!!errors.accent}
                readOnly={readOnly}
                onChange={(accent) => set({ accent })}
              />
            </div>
          </SheetSection>

          <SheetSection title={t('font.title')} description={t('font.lead')}>
            <RadioGroup
              aria-label={t('font.title')}
              value={draft.font}
              isDisabled={readOnly}
              onChange={(v) => set({ font: v as Font })}
            >
              <div className={s.fonts}>
                {FONTS.map((f) => (
                  <div key={f} className={`${s.font} ${f === draft.font ? s.isOn : ''}`}>
                    <Radio value={f}>{t(`font.${FONT_KEY[f]}`)}</Radio>
                    <p className={`${s.sample} ${FONT_CLASS[f]}`}>{t('font.sample')}</p>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </SheetSection>

          <SheetSection title={t('tone.title')} description={t('tone.lead')}>
            <div className={s.stack3}>
              <SegmentedControl
                aria-label={t('tone.title')}
                value={draft.tone}
                block={phone}
                isDisabled={readOnly}
                onChange={(v) => set({ tone: v as Tone })}
                options={(['formal', 'friendly', 'short'] as const).map((v) => ({
                  value: v,
                  label: t(`tone.${v}`),
                }))}
              />
              <p className={`caption ${s.m0} ${s.muted}`}>{t('tone.example')}</p>
              <blockquote className={`body ${s.quote}`}>
                <ToneExample tone={draft.tone} business={data.name} service={data.services[0]} />
              </blockquote>
              <p className={`caption ${s.m0} ${s.muted}`}>{t('tone.note')}</p>
            </div>
          </SheetSection>

          <SheetSection title={t('sig.title')} description={t('sig.lead')}>
            <FormField
              label={t('sig.label')}
              isOptional
              optionalLabel={ui('optional')}
              hint={errors.sig ? undefined : draft.signature.trim() ? t('sig.help') : t('sig.none')}
              error={errors.sig}
              counter={
                <span className={`caption v-num ${s.muted}`}>
                  {`${draft.signature.length} / ${SIG_MAX}`}
                </span>
              }
            >
              <Textarea
                rows={3}
                maxLength={SIG_MAX}
                value={draft.signature}
                readOnly={readOnly}
                onChange={(e) => set({ signature: e.target.value })}
              />
            </FormField>
          </SheetSection>
        </Sheet>

        <div className={s.side}>
          <div className={s.stack3}>
            <div className={s.pvHead}>
              <p className={`subheading ${s.m0}`}>{t('preview.title')}</p>
              <SegmentedControl
                size="sm"
                aria-label={t('preview.title')}
                value={tab}
                onChange={(v) => setTab(v as 'page' | 'email')}
                options={[
                  { value: 'page', label: t('preview.page'), icon: 'monitor' },
                  { value: 'email', label: t('preview.email'), icon: 'mail' },
                ]}
              />
            </div>
            {tab === 'email' ? (
              <PreviewMail look={look} name={data.name} service={data.services[0]} />
            ) : (
              <PreviewPage look={look} name={data.name} services={data.services} />
            )}
            <p className={`caption ${s.m0} ${s.muted}`}>{t('preview.live')}</p>
          </div>
        </div>

        {actions && <div className={s.phoneActions}>{actions}</div>}
      </div>

      <DialogTrigger isOpen={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <Dialog
          sheet={phone}
          title={biz('logo.removeTitle')}
          description={t('logo.removeBody')}
          closeLabel={ui('close')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button variant="quiet" isDisabled={busy} onPress={() => setRemoving(null)}>
                {biz('cancel')}
              </Button>
              <Button
                variant="danger"
                icon="trash-2"
                isPending={busy}
                onPress={() => void removeLogo()}
              >
                {biz('logo.remove')}
              </Button>
            </>
          }
        />
      </DialogTrigger>

      {toast && (
        <div className={s.toast}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            onDismiss={() => setToast(null)}
            dismissLabel={ui('close')}
          />
        </div>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  isAccent,
  invalid,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  isAccent?: boolean;
  invalid: boolean;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('hub.brand.color');
  const locale = useLocale();
  const hex = normalizeHex(value);
  const isDefault = value.trim() === '';
  const r = hex ? contrast(hex, '#ffffff') : null;
  return (
    <div className={s.color}>
      <FormField label={label} error={invalid ? t('low', { ratio: '—' }) : undefined}>
        <div className={s.colorInput}>
          <span aria-hidden className={s.swatch} style={{ background: hex ?? fallback }} />
          <Input
            aria-label={label}
            value={value}
            placeholder={t('default')}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </FormField>
      {isDefault || r === null ? null : isAccent ? (
        r < MIN_ACCENT_CONTRAST ? (
          <p className={`caption ${s.m0} ${s.muted}`}>
            {t('accentNote', { ratio: formatRatio(r, locale) })}
          </p>
        ) : null
      ) : r >= MIN_TEXT_CONTRAST ? (
        <p className={`caption ${s.m0} ${s.muted} ${s.ok}`}>
          <Icon icon="circle-check" size={14} />
          {t('ok', { ratio: formatRatio(r, locale) })}
        </p>
      ) : (
        <Notice
          tone="danger"
          icon="triangle-alert"
          title={t('lowTitle')}
          actions={
            readOnly ? undefined : (
              <Button size="sm" variant="secondary" onPress={() => onChange(readableShade(hex!))}>
                {t('fix', { hex: readableShade(hex!).toUpperCase() })}
              </Button>
            )
          }
        >
          {t('low', { ratio: formatRatio(r, locale) })}
        </Notice>
      )}
    </div>
  );
}

type Look = {
  logo: string | null;
  primary: string;
  accent: string | null;
  font: Font;
  tone: Tone;
  signature: string;
};

/** The brand on a client surface: the buttons take the colour, the text takes the font. */
const brandStyle = (look: Look): CSSProperties =>
  ({
    '--primary': look.primary,
    '--primary-hover': shade(look.primary, 0.9),
    '--primary-pressed': shade(look.primary, 0.8),
  }) as CSSProperties;

const barStyle = (look: Look): CSSProperties =>
  look.accent ? { borderTopColor: look.accent } : {};

/** „mâine, la 10:00” in the person's language, for the examples. */
function useTomorrowAtTen(): string {
  const locale = useLocale();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function ToneExample({
  tone,
  business,
  service,
}: {
  tone: Tone;
  business: string;
  service?: string;
}) {
  const t = useTranslations('hub.brand.tone');
  const when = useTomorrowAtTen();
  return (
    <>
      {t(`${tone}Ex`, {
        client: t('sampleClient'),
        first: t('sampleFirst'),
        when,
        service: (service ?? t('sampleService')).toLowerCase(),
        business,
        phone: t('samplePhone'),
      })}
    </>
  );
}

function PreviewPage({ look, name, services }: { look: Look; name: string; services: string[] }) {
  const t = useTranslations('hub.brand.pv');
  return (
    <div
      className={`${s.pvPage} ${FONT_CLASS[look.font]}`}
      data-theme="light"
      style={brandStyle(look)}
    >
      <div className={s.pvBar} style={barStyle(look)}>
        {look.logo ? (
          <img src={look.logo} alt={name} />
        ) : (
          <>
            <Avatar name={name} shape="square" size="md" />
            <span className="subheading">{name}</span>
          </>
        )}
      </div>
      <div className={s.pvBody}>
        <p className={`heading ${s.m0}`}>{t('services')}</p>
        {services.map((n) => (
          <div key={n} className={s.pvService}>
            <p className={`body-strong ${s.m0}`}>{n}</p>
          </div>
        ))}
        <Button variant="primary" block>
          {t('cta')}
        </Button>
      </div>
    </div>
  );
}

function PreviewMail({ look, name, service }: { look: Look; name: string; service?: string }) {
  const t = useTranslations('hub.brand.pv');
  return (
    <div className={s.pvMail} data-theme="light">
      <div className={`${s.pvMailCard} ${FONT_CLASS[look.font]}`} style={brandStyle(look)}>
        <div className={s.pvBar} style={barStyle(look)}>
          {look.logo ? (
            <img src={look.logo} alt={name} />
          ) : (
            <span className="subheading">{name}</span>
          )}
        </div>
        <div className={s.pvBody}>
          <p className={`heading ${s.m0}`}>{t('emailTitle')}</p>
          <p className={`body ${s.m0}`}>
            <ToneExample tone={look.tone} business={name} service={service} />
          </p>
          <span className={`body-strong ${s.pvButton}`}>{t('emailCta')}</span>
          <p className={`body-small ${s.m0} ${s.pvSig}`}>{look.signature || name}</p>
        </div>
        <p className={`caption ${s.pvFoot}`}>{name}</p>
      </div>
    </div>
  );
}
