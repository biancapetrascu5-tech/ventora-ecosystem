/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { SegmentedControl } from '@ventora/ui';
import { Row, ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → SG(SG_RO)
const T = {
  l: ['Vizualizare', 'Afișare', 'Doar iconuri', 'Mic', 'Pe toată lățimea', 'Dezactivat'],
  v: ['Zi', 'Săptămână', 'Resurse'],
  i: ['Listă', 'Grilă', 'Calendar'],
  b: ['Toate programările', 'Doar neconfirmate'],
};

function SG() {
  return (
    <div className={f.d0}>
      <Row label={T.l[0]!}>
        <SegmentedControl
          aria-label={T.l[0]}
          defaultValue="w"
          options={[
            { value: 'd', label: T.v[0]! },
            { value: 'w', label: T.v[1]! },
            { value: 'r', label: T.v[2]! },
          ]}
        />
      </Row>
      <Row label={T.l[1]!}>
        <SegmentedControl
          aria-label={T.l[1]}
          defaultValue="list"
          options={[
            { value: 'list', label: T.i[0]!, icon: 'list' },
            { value: 'grid', label: T.i[1]!, icon: 'layout-grid' },
            { value: 'cal', label: T.i[2]!, icon: 'calendar', isDisabled: true },
          ]}
        />
      </Row>
      <Row label={T.l[2]!}>
        <SegmentedControl
          iconOnly
          aria-label={T.l[1]}
          defaultValue="list"
          options={[
            { value: 'list', label: T.i[0]!, icon: 'list' },
            { value: 'grid', label: T.i[1]!, icon: 'layout-grid' },
          ]}
        />
      </Row>
      <Row label={T.l[3]!}>
        <SegmentedControl
          size="sm"
          aria-label={T.l[0]}
          defaultValue="d"
          options={[
            { value: 'd', label: T.v[0]! },
            { value: 'w', label: T.v[1]! },
          ]}
        />
      </Row>
      <Row label={T.l[4]!}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SegmentedControl
            block
            aria-label={T.l[4]}
            defaultValue="all"
            options={[
              { value: 'all', label: T.b[0]! },
              { value: 'unc', label: T.b[1]! },
            ]}
          />
        </div>
      </Row>
      <Row label={T.l[5]!}>
        <SegmentedControl
          isDisabled
          aria-label={T.l[5]}
          defaultValue="d"
          options={[
            { value: 'd', label: T.v[0]! },
            { value: 'w', label: T.v[1]! },
          ]}
        />
      </Row>
    </div>
  );
}

export default function SegmentedControlGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <SG />} />;
}
