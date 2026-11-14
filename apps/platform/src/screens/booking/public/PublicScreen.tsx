'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  PublicDetailsStep,
  PublicDone,
  PublicLocationStep,
  PublicMemberStep,
  PublicQuestions,
  PublicServiceStep,
  PublicSessions,
  PublicTimeStep,
  PublicVerifyStep,
  useNewTexts,
  type PublicAnswer,
  type PublicDetailsErrors,
  type PublicDetailsForm,
  type PublicPhoto,
} from '@ventora/booking/ui';
import {
  confirmPublicPhotoAction,
  findPublicFirstFree,
  readPublicClassSessions,
  readPublicSlots,
  requestPublicPhotoAction,
  resendPublicCodeAction,
  startPublicBookingAction,
  verifyPublicBookingAction,
  type PublicPageData,
  type PublicSessionData,
  type PublicSlotData,
} from '@/server/booking-public-actions';
import { rememberLocale } from '@/i18n/locale';
import { useMode } from '../useMode';
import { TurnstileWidget, TURNSTILE_SITE_KEY } from './TurnstileWidget';
import {
  addDays,
  checkDetails,
  dayLong,
  dayShort,
  downloadIcs,
  icsOf,
  leftOf,
  phoneText,
  stripDays,
  stripLabel,
  todayText,
  whenShort,
} from './public-format';

/* Decision 7, screen 6 — BookingPublic (S116 a) at /r/<slug>: („Alegeți salonul” when the
   business has several locations, B.10) → service → who → day and time (a class: its sessions with
   the seats left, B.9d2) → details with the salon's questions (B.12, with the optional photo) and
   Turnstile → the code from the e-mail → confirmed (or sent to the salon), with „Adaugă în
   calendar” (.ics made in the page). The time is held 10 minutes from „Trimite codul”. B.11c: the
   salon's phone („Sună la salon”) and the hours today of each location. The deposit (B.22) comes
   later. */

/** „Retrimite codul” after 60 s: the hold lasts 10 minutes, so 9 minutes before it ends. */
const resendFrom = (expiresAt: string) => Date.parse(expiresAt) - 9 * 60_000;
const PHOTO_MAX = 10 * 1024 * 1024;
const PHOTOS_PER_BOOKING = 5;

type Step = 'location' | 'service' | 'member' | 'time' | 'details' | 'verify' | 'done';
type Lang = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
const LANGS: readonly Lang[] = ['ro', 'en', 'fr', 'es', 'de', 'it'];

/** The chosen time: a free time of a member, or a session of a class. */
type Chosen = {
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  sessionId?: string;
  staffName?: string;
};
type PhotoState = PublicPhoto & { file?: File };

const sizeText = (bytes: number, locale: string) =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;

export function PublicScreen({ slug, page }: { slug: string; page: PublicPageData }) {
  const t = useTranslations('booking.public');
  const locale = useLocale();
  const lang: Lang = (LANGS as readonly string[]).includes(locale) ? (locale as Lang) : 'ro';
  const router = useRouter();
  const mode = useMode();
  const nx = useNewTexts();
  const many = page.locations.length > 1;
  const total = many ? 5 : 4;
  const at = (n: number) => ({ n: many ? n + 1 : n, total });

  const [step, setStep] = useState<Step>(many ? 'location' : 'service');
  const [locationId, setLocationId] = useState<string | null>(
    many ? null : (page.locations[0]?.id ?? null),
  );
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(page.localToday);
  const [slots, setSlots] = useState<PublicSlotData[] | null>(null);
  const [sessions, setSessions] = useState<PublicSessionData[] | null>(null);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [form, setForm] = useState<PublicDetailsForm>({
    name: '',
    phone: '',
    email: '',
    message: '',
  });
  const [answers, setAnswers] = useState<Record<string, PublicAnswer>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Record<string, PhotoState | undefined>>({});
  const [errors, setErrors] = useState<PublicDetailsErrors>({});
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [network, setNetwork] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState<{ id: string; expiresAt: string } | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState<{
    state: 'idle' | 'wrong' | 'expired' | 'tooMany';
    tries?: number;
  }>({ state: 'idle' });
  const [done, setDone] = useState<{ pending: boolean; token: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // the countdowns: the held time and „Retrimite codul în {s} s”
  useEffect(() => {
    if (step !== 'verify') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const location = page.locations.find((l) => l.id === locationId) ?? null;
  const services = page.services.filter((s) => s.staff.length > 0);
  const service = services.find((s) => s.id === serviceId) ?? null;
  const isClass = !!service?.isClass;
  const member =
    staffId && staffId !== 'any' ? (service?.staff.find((m) => m.id === staffId) ?? null) : null;
  const priceOf = (s: (typeof services)[number]) =>
    nx.price(
      {
        durationMin: s.durationMinutes,
        durationMax: s.durationMaxMinutes ?? s.durationMinutes,
        priceKind: s.priceKind,
        priceMinor: s.priceMinor,
        priceMaxMinor: s.priceMaxMinor,
      },
      s.currency === 'EUR' ? 'EUR' : 'RON',
    );
  const minutes = (s: (typeof services)[number]) =>
    t('minutes', { n: s.durationMaxMinutes ?? s.durationMinutes });
  const summary = (withTime: boolean): [string, string][] => {
    if (!service) return [];
    const rows: [string, string][] = [
      [t('k.service'), `${service.name} · ${minutes(service)}`],
      [t('k.member'), chosen?.staffName ?? member?.displayName ?? t('anyone')],
    ];
    if (withTime && chosen) rows.push([t('k.when'), whenShort(chosen.date, chosen.time, locale)]);
    rows.push([t('k.price'), priceOf(service)]);
    return rows;
  };
  const questions = page.questions.filter(
    (q) => !serviceId || q.serviceIds === null || q.serviceIds.includes(serviceId),
  );
  const frame = {
    mode,
    business: {
      name: page.name,
      address: location?.address ?? page.locations[0]?.address ?? '',
    },
    lang,
    onLang: (c: string) => {
      rememberLocale(c);
      router.refresh();
    },
  };

  const endOf = (startsAt: string) =>
    new Date(
      Date.parse(startsAt) +
        (service?.durationMaxMinutes ?? service?.durationMinutes ?? 0) * 60_000,
    ).toISOString();

  const loadDay = async (d: string, sid = staffId, svc = service) => {
    if (!svc) return;
    setDate(d);
    setChosen(null);
    if (svc.isClass) {
      setSessions(null);
      const r = await readPublicClassSessions({
        slug,
        serviceId: svc.id,
        date: d,
        timeZone: page.timeZone,
        locationId: locationId ?? undefined,
      });
      setSessions(r.ok ? r.sessions : []);
      return;
    }
    if (!sid) return;
    setSlots(null);
    const r = await readPublicSlots({
      slug,
      serviceId: svc.id,
      staffMemberId: sid,
      from: d,
      to: addDays(d, 1),
      locationId: locationId ?? undefined,
    });
    const day = r.ok ? (r.days.find((x) => x.date === d)?.slots ?? []) : [];
    setSlots(day);
    if (!day.some((x) => x.available)) {
      const f = await findPublicFirstFree({
        slug,
        serviceId: svc.id,
        staffMemberId: sid,
        from: d,
        today: page.localToday,
        locationId: locationId ?? undefined,
      });
      setNext(f.ok ? f.date : null);
    } else setNext(undefined);
  };

  const pickSlot = (time: string) => {
    const s = (slots ?? []).find((x) => x.time === time);
    setChosen(s ? { date, time: s.time, startsAt: s.startsAt, endsAt: endOf(s.startsAt) } : null);
  };

  const onPhoto = (questionId: string, file: File | null) => {
    if (!file) {
      setPhotos(({ [questionId]: _gone, ...rest }) => rest);
      return;
    }
    const size = sizeText(file.size, locale);
    const used = Object.values(photos).filter((x) => x && x.status !== 'error').length;
    const photo: PhotoState =
      file.type !== 'image/png' && file.type !== 'image/jpeg'
        ? { status: 'error', name: file.name, error: 'type', size }
        : file.size > PHOTO_MAX
          ? { status: 'error', name: file.name, error: 'size', size }
          : used >= PHOTOS_PER_BOOKING
            ? { status: 'error', name: file.name, error: 'count', size }
            : { status: 'ready', name: file.name, size, file };
    setPhotos((p) => ({ ...p, [questionId]: photo }));
  };

  /** The photos go to the pending hold (after Turnstile): link, PUT, then the content check. */
  const uploadPhotos = async (holdId: string): Promise<boolean> => {
    let ok = true;
    for (const [questionId, photo] of Object.entries(photos)) {
      if (!photo || photo.status !== 'ready' || !photo.file) continue;
      setPhotos((p) => ({ ...p, [questionId]: { ...photo, status: 'uploading', progress: 50 } }));
      const fail = (error: 'type' | 'size' | 'count' | 'failed') => {
        ok = false;
        setPhotos((p) => ({
          ...p,
          [questionId]: { status: 'error', name: photo.name, error, size: photo.size },
        }));
      };
      const link = await requestPublicPhotoAction({
        slug,
        holdId,
        questionId,
        name: photo.file.name,
        contentType: photo.file.type,
        sizeBytes: photo.file.size,
      });
      if (!link.ok) {
        fail(link.error);
        continue;
      }
      const put = await fetch(link.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': photo.file.type },
        body: photo.file,
      }).catch(() => null);
      if (!put?.ok) {
        fail('failed');
        continue;
      }
      const confirmed = await confirmPublicPhotoAction({ slug, holdId, fileId: link.fileId });
      if (!confirmed.ok) {
        fail(confirmed.error);
        continue;
      }
      setPhotos((p) => ({ ...p, [questionId]: { ...photo, status: 'done' } }));
    }
    return ok;
  };

  const send = async () => {
    const local = checkDetails(form);
    const e: PublicDetailsErrors = {};
    if (local.name) e.name = t('err.required', { field: t('name').toLocaleLowerCase(locale) });
    if (local.phone) e.phone = t('err.phone');
    if (local.email) e.email = t('err.email');
    if (!captcha) e.captcha = t('captchaError');
    const empty = questions
      .filter((q) => q.required)
      .filter((q) => {
        const v = answers[q.id];
        return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      })
      .map((q) => q.id);
    setMissing(empty);
    setErrors(e);
    setNetwork(false);
    if (Object.keys(e).length || empty.length || !service || !chosen || !captcha) return;
    if (!isClass && !staffId) return;
    setBusy(true);
    const r = await startPublicBookingAction({
      slug,
      serviceId: service.id,
      ...(chosen.sessionId
        ? { classSessionId: chosen.sessionId }
        : { staffMemberId: staffId ?? 'any', startsAt: chosen.startsAt }),
      locationId: locationId ?? undefined,
      answers: questions
        .filter((q) => answers[q.id] !== undefined && answers[q.id] !== '')
        .map((q) => ({
          questionId: q.id,
          value: q.kind === 'number' ? Number(answers[q.id]) : (answers[q.id] ?? null),
        })),
      ...form,
      locale: lang,
      captchaToken: captcha,
    }).catch(() => null);
    // the token is single-use: a refused attempt needs a new check
    setCaptcha(null);
    setResetKey((k) => k + 1);
    if (!r) {
      setBusy(false);
      return setNetwork(true);
    }
    if (r.ok) {
      const photosOk = await uploadPhotos(r.holdId);
      setBusy(false);
      setHold({ id: r.holdId, expiresAt: r.expiresAt });
      setResendAt(resendFrom(r.expiresAt));
      setCode('');
      setVerify({ state: 'idle' });
      setTaken(null);
      // a photo refused stays on the details step, with its error; the time stays held
      if (photosOk) setStep('verify');
      return;
    }
    setBusy(false);
    const err = r.error;
    if (err.kind === 'field') {
      const map: PublicDetailsErrors = {
        name:
          err.field === 'name'
            ? t('err.required', { field: t('name').toLocaleLowerCase(locale) })
            : undefined,
        phone: err.field === 'phone' ? t('err.phone') : undefined,
        email: err.field === 'email' ? t('err.email') : undefined,
        captcha: err.field === 'captcha' ? t('captchaError') : undefined,
      };
      return setErrors(Object.fromEntries(Object.entries(map).filter(([, v]) => v)));
    }
    if (err.kind === 'answers') {
      return setMissing(questions.filter((q) => q.required).map((q) => q.id));
    }
    if (err.kind === 'taken' || err.kind === 'full') {
      setTaken(chosen.time);
      return void loadDay(date);
    }
    setNetwork(true);
  };

  const confirm = async () => {
    if (!hold || code.length !== 6) return;
    setBusy(true);
    const r = await verifyPublicBookingAction({ slug, holdId: hold.id, code });
    setBusy(false);
    if (r.ok) {
      setDone({ pending: r.status === 'unconfirmed', token: r.manageToken });
      return setStep('done');
    }
    if (r.error === 'wrong') return setVerify({ state: 'wrong', tries: r.triesLeft });
    if (r.error === 'expired') return setVerify({ state: 'expired' });
    if (r.error === 'tooMany') return setVerify({ state: 'tooMany' });
    setVerify({ state: 'wrong', tries: 0 });
  };

  if (step === 'location') {
    return (
      <PublicLocationStep
        {...frame}
        locations={page.locations.map((l) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          today: todayText(l.today),
        }))}
        value={locationId}
        onChange={setLocationId}
        onContinue={() => setStep('service')}
      />
    );
  }
  if (step === 'service') {
    return (
      <PublicServiceStep
        {...frame}
        steps={at(1)}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          meta: `${minutes(s)} · ${priceOf(s)}`,
        }))}
        value={serviceId}
        onChange={(id) => {
          setServiceId(id);
          setStaffId(null);
          setAnswers({});
          setPhotos({});
        }}
        onBack={many ? () => setStep('location') : undefined}
        onContinue={() => {
          // a class has its sessions, each with its member: no „Cu cine” step
          if (service?.isClass) {
            setStep('time');
            void loadDay(page.localToday, null, service);
          } else setStep('member');
        }}
      />
    );
  }
  if (step === 'member' && service) {
    return (
      <PublicMemberStep
        {...frame}
        steps={at(2)}
        summary={summary(false).filter(([k]) => k !== t('k.member'))}
        members={service.staff.map((m) => ({ id: m.id, name: m.displayName }))}
        value={staffId}
        onChange={setStaffId}
        onBack={() => setStep('service')}
        onContinue={() => {
          setStep('time');
          void loadDay(page.localToday);
        }}
      />
    );
  }
  if (step === 'time' && service) {
    const free = (slots ?? []).some((x) => x.available);
    const state = !isClass && slots && !free ? (next === null ? 'none' : 'noday') : 'slots';
    return (
      <PublicTimeStep
        {...frame}
        steps={at(3)}
        summary={summary(false)}
        picker={{
          date,
          today: page.localToday,
          days: stripDays(page.localToday, 5).map((d) => ({
            date: d,
            label: stripLabel(d, locale),
          })),
          isDisabled: (d) => d > addDays(page.localToday, 29),
          onDate: (d) => void loadDay(d),
        }}
        state={state}
        slots={(slots ?? []).map((x) => ({ time: x.time, available: x.available }))}
        time={chosen?.time ?? null}
        onTime={pickSlot}
        sessions={
          isClass ? (
            <PublicSessions
              label={t('free')}
              sessions={(sessions ?? []).map((x) => ({
                id: x.id,
                time: `${x.time}–${x.endTime}`,
                member: x.staff,
                seatsLeft: x.seatsLeft,
              }))}
              value={chosen?.sessionId ?? null}
              onChange={(id) => {
                const x = (sessions ?? []).find((s) => s.id === id);
                if (x)
                  setChosen({
                    date: x.date,
                    time: x.time,
                    startsAt: x.startsAt,
                    endsAt: x.endsAt,
                    sessionId: x.id,
                    staffName: x.staff,
                  });
              }}
            />
          ) : undefined
        }
        canContinue={!!chosen}
        noDay={
          next
            ? {
                member: member?.displayName ?? t('anyone'),
                next: dayLong(next, locale),
                nextShort: dayShort(next, locale),
                onNext: () => void loadDay(next),
                onAnyone: () => {
                  setStaffId('any');
                  void loadDay(date, 'any');
                },
              }
            : undefined
        }
        none={{
          service: service.name,
          phone: page.phone ? phoneText(page.phone) : '',
          onCall: () => {
            if (page.phone) window.location.assign(`tel:${page.phone}`);
          },
        }}
        onBack={() => setStep(isClass ? 'service' : 'member')}
        onContinue={() => setStep('details')}
      />
    );
  }
  if (step === 'details' && service) {
    const used = Object.values(photos).filter((x) => x && x.status !== 'error').length;
    return (
      <PublicDetailsStep
        {...frame}
        steps={at(4)}
        summary={summary(true)}
        form={form}
        onForm={(patch) => setForm((f) => ({ ...f, ...patch }))}
        errors={errors}
        taken={
          taken && !isClass
            ? {
                time: taken,
                slots: (slots ?? []).map((x) => ({ time: x.time, available: x.available })),
                value: chosen?.time === taken ? null : (chosen?.time ?? null),
                onTime: pickSlot,
              }
            : null
        }
        network={network}
        extra={
          <PublicQuestions
            mode={mode}
            questions={questions}
            answers={answers}
            onAnswer={(id, v) => {
              setAnswers((a) => ({ ...a, [id]: v }));
              setMissing((m) => m.filter((x) => x !== id));
            }}
            missing={missing}
            photos={photos}
            onPhoto={onPhoto}
            photosFull={used >= PHOTOS_PER_BOOKING}
          />
        }
        captcha={{
          state: captcha ? 'ok' : 'idle',
          widget: TURNSTILE_SITE_KEY ? (
            <TurnstileWidget lang={lang} onToken={setCaptcha} resetKey={resetKey} />
          ) : undefined,
        }}
        privacyHref="/privacy"
        sending={busy}
        onBack={() => setStep('time')}
        onSend={() => void send()}
      />
    );
  }
  if (step === 'verify' && hold && chosen) {
    const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
    return (
      <PublicVerifyStep
        {...frame}
        steps={at(4)}
        summary={summary(true)}
        email={form.email.trim()}
        code={code}
        onCode={(c) => {
          setCode(c);
          if (verify.state === 'wrong') setVerify({ state: 'idle' });
        }}
        state={verify.state}
        triesLeft={verify.tries}
        held={{ time: chosen.time, left: leftOf(hold.expiresAt, now) }}
        resendIn={resendIn}
        onResend={() =>
          void resendPublicCodeAction({ slug, holdId: hold.id }).then((r) => {
            if (r.ok) {
              setHold({ ...hold, expiresAt: r.expiresAt });
              setResendAt(resendFrom(r.expiresAt));
              setVerify({ state: 'idle' });
            }
          })
        }
        onChangeEmail={() => setStep('details')}
        busy={busy}
        onConfirm={() => void confirm()}
      />
    );
  }
  if (step === 'done' && done && chosen && service) {
    return (
      <PublicDone
        {...frame}
        summary={summary(true)}
        pending={done.pending}
        when={`${dayLong(chosen.date, locale)}, ${chosen.time}`}
        email={form.email.trim()}
        onAddCal={() =>
          downloadIcs(
            'programare.ics',
            icsOf({
              uid: `${crypto.randomUUID()}@ventora-hub.com`,
              title: `${service.name} · ${page.name}`,
              startsAt: chosen.startsAt,
              endsAt: chosen.endsAt,
              location: location?.address ?? page.locations[0]?.address ?? null,
              now: new Date().toISOString(),
            }),
          )
        }
        onManage={() =>
          router.push(`/r/${encodeURIComponent(slug)}/m/${encodeURIComponent(done.token)}`)
        }
      />
    );
  }
  return null;
}
