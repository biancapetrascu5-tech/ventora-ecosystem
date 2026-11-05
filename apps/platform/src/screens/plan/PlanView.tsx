'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AppIcon,
  APPS,
  Badge,
  Button,
  DataTable,
  Icon,
  IconButton,
  Notice,
  PageHeader,
  PaymentCard,
  Sheet,
  SheetSection,
  StatusPill,
  UsageMeter,
  type AppName,
  type IconName,
  type PaymentCardData,
} from '@ventora/ui';
import { useDataTableLabels, usePaymentLabels, useUsageMeterLabels } from '../labels';
import s from './plan.module.css';

/* HubAdminPlan / HubPlanBilling (Lotul 3.7, S111 / S113 / S117): „Abonament și consum”.
   - „Abonamentul tău”: bundle-ul (sau aplicațiile la bucată), starea, cât și când se plătește;
     „Ce plătești” (bundle, aplicații la bucată, locuri în echipă, pachete, reduceri ca linii
     separate, total); cardul pentru cumpărături (doar owner-ul).
   - „Consum”: perioada abonamentului și data resetării (D3-3), UsageMeter pe fiecare limită.
   - „Pachete în plus”: cumpărate cu cardul sau „Cere activare” / „Doar la cerere” (D3-7).
   - „Facturi”: plățile; factura însăși vine cu Lotul 3.6 („Factura se emite”).
   Vedere fără logică: textele și sumele vin gata scrise; acțiunile vin ca funcții. */

export type PlanHaveRow = {
  label: string;
  sub?: string;
  amount: string;
  /** Rânduri informative (locurile „Inclus”, „Niciun pachet în plus.”) și reducerile. */
  muted?: boolean;
};

export type PlanMeter = {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit?: string;
  format?: (n: number) => string;
  onBuy?: () => void;
  buyLabel?: string;
  onUpgrade?: () => void;
  owner?: string;
  onNotifyOwner?: () => void;
  /** Sub contor (estimarea din design, doar în galerie). */
  note?: string;
};

export type PlanPackRow = {
  id: string;
  icon: IconName;
  name: string;
  /** „49 lei · valabil până pe 16 noiembrie” */
  price: string;
  /** „Ai folosit {used} din {limit} luna aceasta.” (pachetul care rezolvă un consum peste 80%) */
  usageNote?: string;
  /** „Doar la cerere” */
  onRequestOnly?: boolean;
  action?: {
    label: string;
    variant: 'secondary' | 'quiet';
    onPress: () => void;
    pending?: boolean;
  };
};

export type PlanInvoiceRow = {
  id: string;
  number: string;
  what: string;
  date: string;
  amount: string;
  /** Lotul 3.6: factura încă nu e emisă („Factura se emite”). */
  pending: boolean;
  /** Lotul 3.6: factura emisă, pentru „Descarcă PDF”. */
  invoiceId?: string;
};

export type PlanViewProps = {
  phone: boolean;
  plan: {
    name: string;
    status: { label: string; tone: 'done' | 'neutral' | 'attention' };
    /** „Plătești lunar: 349 lei” */
    pay: string;
    /** „Următoarea plată: 17 noiembrie 2026” */
    next: string;
    /** HubAdminPlan: suma îngroșată și data pe același rând („… · următoarea plată pe …”). */
    inline?: { before: string; amount: string; after: string };
    apps: AppName[];
    /** „Cere alt abonament” (doar owner-ul). */
    onUpgrade?: () => void;
  };
  annualNotice?: string;
  have: { rows: PlanHaveRow[]; totalLabel: string; total: string; keep?: string };
  /** HubAdminPlan: fundalul sunken; HubPlanBilling (S117): chenarul. */
  haveStyle?: 'sunken' | 'bordered';
  /** Doar owner-ul: cardul salvat sau „Adaugă card”. */
  card?: { card: PaymentCardData | null; onChange?: () => void; onAdd?: () => void };
  usage?: { title: string; description: string; meters: PlanMeter[] };
  packs?: { rows: PlanPackRow[]; growth?: ReactNode };
  /**
   * Doar owner-ul. `withDate`: coloana „Data” și „Descarcă” lângă „Plătită” (HubAdminPlan);
   * fără ele, ca în HubPlanBilling.
   */
  invoices?: {
    rows: PlanInvoiceRow[];
    withDate?: boolean;
    empty?: string;
    /** Lotul 3.6: „Descarcă PDF” (linkul semnat). */
    onDownload?: (row: PlanInvoiceRow) => void;
  };
  /** Lotul 3.8 (S121): „Date de facturare” și cererile cu implementare, sub abonament. */
  after?: ReactNode;
};

export function PlanView({
  phone,
  plan,
  annualNotice,
  have,
  haveStyle = 'bordered',
  card,
  usage,
  packs,
  invoices,
  after,
}: PlanViewProps) {
  const t = useTranslations('hub.plan');
  const pay = useTranslations('pay');
  const billing = useTranslations('billing');
  const payLabels = usePaymentLabels();
  const meterLabels = useUsageMeterLabels();
  const tableLabels = useDataTableLabels();

  const upgrade = plan.onUpgrade && (
    <Button onPress={plan.onUpgrade} block={phone}>
      {pay('upgrade')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : t('lead')} />
      <Sheet>
        <SheetSection title={t('yours')} actions={phone ? undefined : upgrade}>
          <div className={s.plan}>
            <div className={`${s.planHead} ${plan.inline ? s.planHeadInline : ''}`}>
              <div className={s.nameRow}>
                <span className="display-m">{plan.name}</span>
                <StatusPill tone={plan.status.tone}>{plan.status.label}</StatusPill>
              </div>
              {plan.inline ? (
                <p className={`body muted ${s.m0}`}>
                  {plan.inline.before}
                  <span className={`v-num ${s.amount}`}>{plan.inline.amount}</span>
                  {plan.inline.after}
                </p>
              ) : (
                <div className={s.payLines}>
                  <p className={`body-strong v-num ${s.m0}`}>{plan.pay}</p>
                  <p className={`body-small muted ${s.m0}`}>{plan.next}</p>
                </div>
              )}
            </div>
            {plan.apps.length > 0 && (
              <div className={s.appsrow}>
                {plan.apps.map((a) => (
                  <AppIcon key={a} app={a} size={28} title={APPS[a]?.name} />
                ))}
              </div>
            )}
          </div>
          {annualNotice && (
            <div className={s.notice}>
              <Notice tone="neutral" icon="calendar-clock">
                {annualNotice}
              </Notice>
            </div>
          )}
          <div className={s.have}>
            <p className={`subheading ${s.haveTitle}`}>{billing('have.title')}</p>
            <div className={haveStyle === 'sunken' ? s.linesSunken : s.linesBordered}>
              {have.rows.map((r, i) => (
                <div key={`${r.label}-${i}`} className={s.line}>
                  <span className={s.lineText}>
                    <span className={`body${r.muted ? ' muted' : ''}`}>{r.label}</span>
                    {r.sub && <span className="body-small muted">{r.sub}</span>}
                  </span>
                  <span className={`body v-num${r.muted ? ' muted' : ''}`}>{r.amount}</span>
                </div>
              ))}
              <div className={`${s.line} ${s.total}`}>
                <span className="body-strong">{have.totalLabel}</span>
                <span className="body-strong v-num">{have.total}</span>
              </div>
            </div>
            {have.keep && <p className={`body-small muted ${s.keep}`}>{have.keep}</p>}
          </div>
          {card && (
            <div className={s.paymethod}>
              <p className={`caption muted ${s.m0}`}>{t('cardFor')}</p>
              {card.card ? (
                <PaymentCard card={card.card} onChange={card.onChange} labels={payLabels} />
              ) : (
                <div className={s.noCard}>
                  <span className="body-small muted">{t('noCard')}</span>
                  {card.onAdd && (
                    <Button size="sm" icon="credit-card" onPress={card.onAdd}>
                      {pay('addCard')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          {phone && upgrade && <div className={s.phoneUpgrade}>{upgrade}</div>}
        </SheetSection>

        {usage && usage.meters.length > 0 && (
          <SheetSection title={usage.title} description={usage.description}>
            <div className={s.usageGrid}>
              {usage.meters.map((m) => {
                const meter = (
                  <UsageMeter
                    key={m.key}
                    {...meterLabels}
                    label={m.label}
                    used={m.used}
                    limit={m.limit}
                    unit={m.unit}
                    format={m.format}
                    onBuy={m.onBuy}
                    buyLabel={m.buyLabel}
                    onUpgrade={m.onUpgrade}
                    owner={m.owner}
                    onNotifyOwner={m.onNotifyOwner}
                  />
                );
                return m.note ? (
                  <div key={m.key} className={s.meterCol}>
                    {meter}
                    <p className={`body-small muted ${s.m0}`}>{m.note}</p>
                  </div>
                ) : (
                  meter
                );
              })}
            </div>
          </SheetSection>
        )}

        {packs && (packs.rows.length > 0 || packs.growth) && (
          <SheetSection title={t('packs')} description={t('packsLead')}>
            {packs.growth && <div className={s.growth}>{packs.growth}</div>}
            {packs.rows.length > 0 && (
              <div className={s.rows}>
                {packs.rows.map((a) => (
                  <div key={a.id} className={s.mrow}>
                    <Icon icon={a.icon} size={20} />
                    <span className={s.bizText}>
                      <span className="body-strong">{a.name}</span>
                      <span className="body-small muted v-num">{a.price}</span>
                      {a.usageNote && <span className="body-small muted">{a.usageNote}</span>}
                      {a.onRequestOnly && <Badge>{pay('onRequestOnly')}</Badge>}
                    </span>
                    {a.action && (
                      <Button
                        size="sm"
                        variant={a.action.variant}
                        isPending={a.action.pending}
                        onPress={a.action.onPress}
                      >
                        {a.action.label}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SheetSection>
        )}

        {invoices && (
          <SheetSection title={t('invoices')} description={t('invoicesLead')}>
            <DataTable
              labels={tableLabels}
              columns={[
                { key: 'number', header: t('col.invoice'), primary: true },
                { key: 'what', header: t('col.for'), secondary: true },
                ...(invoices.withDate
                  ? [{ key: 'date', header: t('col.date'), secondary: true }]
                  : []),
                { key: 'amount', header: t('col.amount'), align: 'end' as const, secondary: true },
                {
                  key: 'status',
                  header: t('col.status'),
                  trailing: true,
                  render: (r: PlanInvoiceRow) =>
                    r.pending ? (
                      <StatusPill tone="neutral" icon="clock">
                        {billing('invoices.pending')}
                      </StatusPill>
                    ) : invoices.withDate ? (
                      <span className={s.statusCell}>
                        <StatusPill tone="done">{t('paid')}</StatusPill>
                        <IconButton
                          icon="download"
                          label={t('downloadPdf')}
                          variant="quiet"
                          size="sm"
                          onPress={invoices.onDownload ? () => invoices.onDownload!(r) : undefined}
                        />
                      </span>
                    ) : (
                      <StatusPill tone="done">{t('paid')}</StatusPill>
                    ),
                },
              ]}
              rows={invoices.rows}
              rowKey={(r) => r.id}
              rowActions={(r) =>
                r.pending
                  ? []
                  : [
                      {
                        label: t('downloadPdf'),
                        icon: 'download',
                        onClick: invoices.onDownload ? () => invoices.onDownload!(r) : undefined,
                      },
                    ]
              }
              empty={invoices.empty}
            />
          </SheetSection>
        )}
      </Sheet>
      {after}
    </>
  );
}
