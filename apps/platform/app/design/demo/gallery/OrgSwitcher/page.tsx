/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { OrgSwitcher } from '@ventora/ui';
import { Row, ThPair } from '../_shared/QPair';
import { ORG_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → States()
const ORGS = [
  { id: 'aurora', name: 'Salon Aurora', role: 'Proprietar' },
  { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Recepție' },
  { id: 'nord', name: 'Agenția Nord Studio', role: 'Manager de proiect' },
];
const LONG = [
  {
    id: 1,
    name: 'Școala de șoferi Ștefănescu și Asociații din Târgu Mureș',
    role: 'Recepție și programări',
  },
  { id: 2, name: 'Salon Aurora', role: 'Proprietar' },
];

function States() {
  return (
    <div className={f.d0}>
      <Row label="Mai multe afaceri">
        <OrgSwitcher orgs={ORGS} currentId="dentis" labels={ORG_RO} />
      </Row>
      <Row label="O afacere (text, fără meniu)">
        <OrgSwitcher
          orgs={[{ id: 'x', name: 'Cofetăria Țuțu', role: 'Proprietar' }]}
          labels={ORG_RO}
        />
      </Row>
      <Row label="Compact">
        <OrgSwitcher orgs={ORGS} compact labels={ORG_RO} />
      </Row>
      <Row label="Nume lung">
        <div style={{ maxWidth: 300, minWidth: 0 }}>
          <OrgSwitcher orgs={LONG} labels={ORG_RO} />
        </div>
      </Row>
    </div>
  );
}

export default function OrgSwitcherGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <States />} />;
}
