/* eslint-disable i18next/no-literal-string -- exemplele din preview.html */
'use client';
import { notFound } from 'next/navigation';
import { Button, EmptyState, Notice, RecommendationCard, StatusPill, Toast } from '@ventora/ui';
import { RECO_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';
import s from './states.module.css';

// preview.html → ComStatesGrid, în .stth light / dark (secțiunea DE/IT e testul de lungime, nu cadru).
const noop = () => {};
const TL = { undoLabel: 'Anulează', dismissLabel: 'Închide' };

function Sy({ label, w, children }: { label: string; w?: number; children: React.ReactNode }) {
  return (
    <div className={s.stc} style={w ? { gridColumn: `span ${w}` } : undefined}>
      <p className={`caption ${f.muted}`}>{label}</p>
      <div className={s.stcBox}>{children}</div>
    </div>
  );
}

function ComStatesGrid() {
  return (
    <div className={s.stgrid}>
      <Sy label="Catalog · căutare fără rezultat">
        <EmptyState
          size="sm"
          icon="search"
          title="Nicio aplicație pentru „facturi electronice”"
          description="Încearcă alt cuvânt sau scrie-ne ce ai nevoie."
          actions={<Button>Scrie-ne</Button>}
        />
      </Sy>
      <Sy label="Perioadă de probă · cu 3 zile înainte (notificare)">
        <Toast
          className={s.toast}
          tone="neutral"
          title="Perioada de probă pentru DataView se încheie pe 7 noiembrie."
          description="Atunci se oprește singură; datele rămân."
          action={{ label: 'Vezi opțiunile' }}
          onDismiss={noop}
          {...TL}
        />
      </Sy>
      <Sy label="Perioadă de probă · încheiată (proprietar)" w={2}>
        <Notice
          tone="neutral"
          icon="clock"
          title="Perioada de probă pentru DataView s-a încheiat"
          actions={
            <>
              <Button size="sm" variant="primary">
                Activează · 79 lei pe lună
              </Button>
              <Button size="sm" variant="quiet">
                Nu acum
              </Button>
            </>
          }
        >
          DataView s-a oprit. Datele rămân; o activezi oricând vrei să continui.
        </Notice>
      </Sy>
      <Sy label="Recomandare de la echipă · respinsă (admin)">
        <Toast
          className={s.toast}
          tone="neutral"
          title="Am respins recomandarea."
          description="Ioana Pavel vede „Nu acum” în lista ei; nu primește notificare."
          onUndo={noop}
          onDismiss={noop}
          {...TL}
        />
      </Sy>
      <Sy label="Recomandare de la echipă · activată (membru, notificare)">
        <Toast
          className={s.toast}
          tone="done"
          title="Bianca Petrașcu a activat CampaignKit."
          description="Recomandarea ta e acum o aplicație a echipei."
          action={{ label: 'Deschide CampaignKit' }}
          onDismiss={noop}
          {...TL}
        />
      </Sy>
      <Sy label="Slot comercial · plafon atins sau recomandare respinsă">
        <p className={`body-small ${f.muted}`}>
          Slotul nu se afișează deloc: nicio gaură în pagină, niciun mesaj. Respingerea ține 30 de
          zile; plafoanele globale sunt 1 pe zi și 3 pe săptămână.
        </p>
      </Sy>
      <Sy label="Membru · stările recomandărilor lui" w={2}>
        <div className={s.pills}>
          <StatusPill tone="neutral" icon="clock">
            În așteptare
          </StatusPill>
          <StatusPill tone="done" icon="check">
            Activată
          </StatusPill>
          <StatusPill tone="neutral">Nu acum</StatusPill>
        </div>
      </Sy>
      <Sy label="Membru · decizia ajunge la proprietar">
        <RecommendationCard
          proactive={false}
          role="member"
          app="marketing"
          title="CampaignKit"
          cost="49 lei pe lună"
          actionLabel="Recomandă aplicația"
          decider="Bianca Petrașcu (proprietar)"
          onRecommend={noop}
          labels={RECO_RO}
        />
      </Sy>
    </div>
  );
}

export default function CommercialStatesGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.d}>
        <p className="heading">
          Comercial — stările care completează componentele, cu textele aprobate
        </p>
        {(['light', 'dark'] as const).map((th) => (
          <div key={th} className={s.stth} data-gallery-frame data-theme={th}>
            <ComStatesGrid />
          </div>
        ))}
      </div>
    </div>
  );
}
