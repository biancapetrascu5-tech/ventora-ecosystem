'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  BillingProfileCard,
  BillingProfileDrawer,
  BillingProfileForm,
  InvoiceHistorySection,
  InvoiceNotIssuedNotice,
  ManualIssueDialog,
  money,
  useIsPhone,
  type BillingProfileErrors,
  type BillingProfileValues,
  type InvoiceHistoryRow,
  type ManualIssueValues,
} from '@ventora/screens';
import { checkRegCom, checkRomanianCui } from '@ventora/billing/billing-profile';
import {
  markManual,
  retryNotIssued,
  saveProfile,
  type BillingTabData,
  type InvoiceData,
} from '@/server/lifecycle-actions';

/* Lotul 3.8 (S121) în „Plăți și facturi”: „Factura se emite pe” (FounderBillingProfile), factura
   neemisă cu „Reîncearcă” și „Am emis-o manual…” (FounderInvoiceNotIssued), istoricul facturilor. */

const EMPTY: BillingProfileValues = {
  type: 'company',
  name: '',
  taxId: '',
  regCom: '',
  street: '',
  city: '',
  county: '',
  country: 'RO',
  email: '',
};

export function toProfileValues(p: BillingTabData['profile']): BillingProfileValues | null {
  if (!p) return null;
  return {
    type: p.entityType,
    name: p.name,
    taxId: p.taxId ?? '',
    regCom: p.regCom ?? '',
    street: p.street,
    city: p.city,
    county: p.county ?? '',
    country: p.country,
    email: p.email,
  };
}

/** The same checks as the server, so the form names the error before saving. */
export function checkProfile(v: BillingProfileValues): BillingProfileErrors {
  const e: BillingProfileErrors = {};
  if (v.name.trim().length < 2) e.name = true;
  if (v.type === 'company') {
    if (v.country === 'RO') {
      const c = checkRomanianCui(v.taxId);
      if (c === 'format') e.cui = 'format';
      if (c === 'control') e.cui = 'check';
      if (!checkRegCom(v.regCom)) e.regCom = true;
    } else if (
      !/^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(v.taxId.replace(/\s+/g, '').toUpperCase()) ||
      /^RO/i.test(v.taxId)
    ) {
      e.vatCode = true;
    }
  }
  if (v.street.trim().length < 2) e.street = true;
  if (v.city.trim().length < 2) e.city = true;
  if (v.country === 'RO' && !v.county) e.county = true;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = true;
  return e;
}

export function toProfileInput(v: BillingProfileValues) {
  return {
    entityType: v.type,
    name: v.name,
    country: v.country,
    taxId: v.type === 'company' ? v.taxId : null,
    regCom: v.type === 'company' ? v.regCom || null : null,
    street: v.street,
    city: v.city,
    county: v.county || null,
    email: v.email,
  };
}

/** The server's names (BillingProfileError) → the form's. */
export function serverProfileErrors(list: string[] | undefined): BillingProfileErrors {
  const e: BillingProfileErrors = {};
  for (const x of list ?? []) {
    if (x === 'cuiFormat') e.cui = 'format';
    else if (x === 'cuiControl') e.cui = 'check';
    else if (x in { name: 1, vatCode: 1, regCom: 1, street: 1, city: 1, county: 1, email: 1 }) {
      (e as Record<string, boolean>)[x] = true;
    }
  }
  return e;
}

const SHORT = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Bucharest',
});
const LONG = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Bucharest',
});
const day = (iso: string | null, f = SHORT) =>
  iso ? f.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : '';
const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

function rowOf(i: InvoiceData): InvoiceHistoryRow {
  const st: InvoiceHistoryRow['st'] =
    i.kind === 'storno'
      ? 'storno'
      : i.status === 'failed'
        ? 'notIssued'
        : i.status === 'manual'
          ? 'manual'
          : i.status === 'pending'
            ? 'invoicePending'
            : i.collection === 'transfer' && !i.paidOn
              ? 'pending'
              : 'paid';
  return {
    id: i.id,
    what: i.what ?? '',
    date: day(i.paymentDate ?? i.issueDate ?? i.createdAt),
    amount: money(i.amountMinor, i.currency),
    inv: i.series && i.number ? `${i.series} ${i.number}` : '—',
    st,
  };
}

export function LifecycleBilling({
  organizationId,
  business,
  data,
  onDone,
}: {
  organizationId: string;
  business: string;
  data: BillingTabData | null;
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const t = useTranslations('founder.billingProfile');
  const b = useTranslations('founder.billing');
  const phone = useIsPhone();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<BillingProfileValues>(EMPTY);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<BillingProfileErrors>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState<string | null>(null);
  const [manual, setManual] = useState<InvoiceData | null>(null);
  const [manualValues, setManualValues] = useState<ManualIssueValues>({
    series: '',
    number: '',
    date: new Date(),
    reason: '',
  });
  const [manualErrors, setManualErrors] = useState<{
    reason?: boolean;
    series?: boolean;
    number?: boolean;
  }>({});
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const profile = toProfileValues(data?.profile ?? null);
  const invoices = data?.invoices ?? [];
  const notIssued = invoices.find((i) => i.kind === 'invoice' && i.status === 'failed') ?? null;

  function openEdit() {
    setValues(profile ?? EMPTY);
    setReason('');
    setErrors({});
    setFailed(false);
    setEditing(true);
  }

  async function save() {
    const e = checkProfile(values);
    if (profile && !reason.trim()) e.reason = true;
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFailed(false);
    const res = await saveProfile({
      organizationId,
      profile: toProfileInput(values),
      reason: profile ? reason.trim() : null,
    });
    setPending(false);
    if (!res.ok) {
      if (res.profileErrors) setErrors(serverProfileErrors(res.profileErrors));
      else if (res.field === 'reason') setErrors({ reason: true });
      else setFailed(true);
      return;
    }
    setEditing(false);
    onDone(t('saved'));
    router.refresh();
  }

  async function retry(id: string) {
    setRetrying(id);
    setRetryFailed(null);
    const res = await retryNotIssued({ organizationId, invoiceId: id });
    setRetrying(null);
    if (res.ok && res.outcome === 'issued') {
      router.refresh();
      const inv = invoices.find((i) => i.id === id);
      onDone(b('notIssued.retryOk', { invoice: inv?.series ? `${inv.series} ${inv.number}` : '' }));
      return;
    }
    setRetryFailed(id);
    router.refresh();
  }

  function openManual(inv: InvoiceData) {
    setManual(inv);
    setManualValues({ series: '', number: '', date: new Date(), reason: '' });
    setManualErrors({});
    setDuplicate(null);
    setFailed(false);
  }

  async function submitManual() {
    if (!manual) return;
    const e: typeof manualErrors = {};
    if (!manualValues.series.trim()) e.series = true;
    if (!manualValues.number.trim()) e.number = true;
    if (manualValues.reason.trim().length < 10) e.reason = true;
    setManualErrors(e);
    setDuplicate(null);
    if (Object.keys(e).length) return;
    setPending(true);
    const issueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(
      manualValues.date,
    );
    const res = await markManual({
      organizationId,
      invoiceId: manual.id,
      series: manualValues.series,
      number: manualValues.number,
      issueDate,
      reason: manualValues.reason,
    });
    setPending(false);
    const invoice = `${manualValues.series.trim().toUpperCase()} ${manualValues.number.trim()}`;
    if (!res.ok) {
      if (res.conflict === 'invoice_number_used') setDuplicate(invoice);
      else if (res.field === 'reason') setManualErrors({ reason: true });
      else setFailed(true);
      return;
    }
    setManual(null);
    onDone(b('manualIssue.done', { invoice }));
    router.refresh();
  }

  const rows = invoices.map((i) => {
    const r = rowOf(i);
    return retrying === i.id ? { ...r, st: 'retrying' as const } : r;
  });
  const byId = (id: string | number) => invoices.find((i) => i.id === id)!;

  return (
    <>
      <BillingProfileCard profile={profile} onEdit={openEdit} phone={phone} />
      {notIssued ? (
        <InvoiceNotIssuedNotice
          what={notIssued.what ?? ''}
          amount={money(notIssued.amountMinor, notIssued.currency)}
          date={day(notIssued.paymentDate ?? notIssued.createdAt, LONG)}
          reason={notIssued.lastError?.replace(/^(rejected|ambiguous): (SmartBill: )?/, '') ?? ''}
          retryFailed={retryFailed === notIssued.id}
          retrying={retrying === notIssued.id}
          onRetry={() => void retry(notIssued.id)}
          onManual={() => openManual(notIssued)}
          onEditProfile={openEdit}
        />
      ) : null}
      <InvoiceHistorySection
        rows={rows}
        activeRow={notIssued?.id}
        onRetry={(r) => void retry(String(r.id))}
        onManual={(r) => openManual(byId(r.id))}
      />
      <BillingProfileDrawer
        business={business}
        isOpen={editing}
        onOpenChange={setEditing}
        pending={pending}
        failed={failed}
        onSave={() => void save()}
        phone={phone}
      >
        <BillingProfileForm
          values={values}
          errors={errors}
          onChange={setValues}
          cuiOk={values.country === 'RO' && checkRomanianCui(values.taxId) === 'ok'}
          reason={profile ? reason : undefined}
          onReasonChange={profile ? setReason : undefined}
          phone
        />
      </BillingProfileDrawer>
      <DialogTrigger isOpen={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        {manual ? (
          <ManualIssueDialog
            business={business}
            lead={b('manualIssue.lead', {
              what: manual.what ?? '',
              amount: money(manual.amountMinor, manual.currency),
              date: day(manual.paymentDate ?? manual.createdAt, LONG),
            })}
            values={manualValues}
            onChange={setManualValues}
            errors={manualErrors}
            duplicate={duplicate}
            pending={pending}
            failed={failed}
            mob={phone}
            today={new Date(`${todayIso()}T12:00:00`)}
            onCancel={() => setManual(null)}
            onSubmit={() => void submitManual()}
          />
        ) : (
          <></>
        )}
      </DialogTrigger>
    </>
  );
}
