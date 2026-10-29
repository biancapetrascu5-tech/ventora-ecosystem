'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../Button/Button';
import { seriesVar, type ChartColor } from './chart';
import styles from './Chart.module.css';

/** Textele traduse ale graficelor. */
export interface ChartLabels {
  /** „Vezi ca tabel” */
  viewTable: string;
  /** „Vezi graficul” */
  viewChart: string;
  /** Sufixul pentru milioane pe axă („mil.”). Fără el, numărul se scrie întreg. */
  millions?: string;
}

export interface ChartLegendItem {
  label: string;
  color?: ChartColor;
  line?: boolean;
}

export interface ChartTable {
  head: string[];
  rows: string[][];
}

/* ChartFrame din bundle.js: titlu, descriere, „Vezi ca tabel”, legendă, grafic sau tabel */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  labels,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: ChartLegendItem[] | null;
  table?: ChartTable;
  labels: ChartLabels;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className={cn(styles.chart, className)}>
      <figcaption className={styles.head}>
        <span className={styles.titles}>
          <span className={cn('subheading', styles.title)}>{title}</span>
          {description && <span className={cn('body-small', styles.desc)}>{description}</span>}
        </span>
        <span className={styles.actions}>
          {actions}
          {table && (
            <Button
              variant="quiet"
              size="sm"
              icon={asTable ? 'chart-column' : 'table'}
              aria-pressed={asTable}
              data-chart-toggle=""
              onPress={() => setAsTable(!asTable)}
            >
              {asTable ? labels.viewChart : labels.viewTable}
            </Button>
          )}
        </span>
      </figcaption>
      {legend && legend.length > 1 && !asTable && (
        <ul className={cn(styles.legend, 'body-small')}>
          {legend.map((l) => (
            <li key={l.label}>
              <span
                className={cn(styles.key, l.line && styles.keyLine)}
                style={{ background: seriesVar(l.color) }}
                aria-hidden="true"
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {asTable && table ? (
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={i} scope="col" className={cn('caption', i > 0 && styles.end)}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={cn('body', j > 0 && styles.num, j > 0 && styles.end)}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}
