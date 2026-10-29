'use client';

import { useState } from 'react';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import ib from '../IconButton/IconButton.module.css';
import { Input } from '../Input/Input';
import { cn } from '../lib/cn';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { Select } from '../Select/Select';
import styles from './RuleBuilder.module.css';

export interface RuleCriterion {
  value: string;
  label: string;
  operators: string[];
  /** Valorile posibile (Select); fără ele, valoarea se scrie (Input, cu `unit` ca sufix). */
  values?: Array<{ value: string; label: string } | string>;
  unit?: string;
}

export interface RuleRow {
  id: string;
  criterion: string;
  operator: string;
  value: string;
}

export interface RuleBuilderLabels {
  /** S.matchLabel, S.matchAll, S.matchAny. */
  matchLabel: string;
  matchAll: string;
  matchAny: string;
  /** S.ruleN, ex. (n) => `Condiția ${n}` — numele rândului. */
  ruleN: (n: number) => string;
  /** S.criterion, S.operator, S.value — numele câmpurilor. */
  criterion: string;
  operator: string;
  value: string;
  removeCondition: string;
  addCondition: string;
  /** S.eligibleN, ex. (n) => `Aproximativ ${n} afaceri eligibile`. */
  eligibleN: (n: number) => string;
}

export interface RuleBuilderProps {
  criteria: RuleCriterion[];
  rules?: RuleRow[];
  match?: 'all' | 'any';
  onChange?: (rules: RuleRow[]) => void;
  onMatchChange?: (match: 'all' | 'any') => void;
  /** Câte afaceri ar intra acum (apare lângă „Adaugă o condiție”). */
  estimate?: number;
  labels: RuleBuilderLabels;
  className?: string;
}

const opts = (values: RuleCriterion['values'] = []) =>
  values.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

/* RuleBuilder din bundle.js: „toate / oricare” condițiile, rânduri criteriu · condiție · valoare,
   „Adaugă o condiție” și estimarea; sub 520px (container) rândul se așază pe trei linii. */
export function RuleBuilder({
  criteria,
  rules = [],
  match = 'all',
  onChange,
  onMatchChange,
  estimate,
  labels,
  className,
}: RuleBuilderProps) {
  const [inner, setInner] = useState(rules);
  const [m, setM] = useState(match);
  const list = onChange ? rules : inner;
  const set = (next: RuleRow[]) => (onChange ? onChange(next) : setInner(next));
  const crit = (id: string): RuleCriterion =>
    criteria.find((c) => c.value === id) ?? criteria[0] ?? { value: '', label: '', operators: [] };
  const patch = (id: string, p: Partial<RuleRow>) =>
    set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className={cn(styles.rules, className)}>
      <div className={styles.match}>
        <span className="body-small">{labels.matchLabel}</span>
        <SegmentedControl
          size="sm"
          aria-label={labels.matchLabel}
          value={m}
          onChange={(v) => {
            setM(v as 'all' | 'any');
            onMatchChange?.(v as 'all' | 'any');
          }}
          options={[
            { value: 'all', label: labels.matchAll },
            { value: 'any', label: labels.matchAny },
          ]}
        />
      </div>
      <ul className={styles.list}>
        {list.map((r, i) => {
          const c = crit(r.criterion);
          const valLabel = opts(c.values).find((o) => o.value === r.value)?.label ?? r.value;
          const unit = c.unit && !c.values ? ` ${c.unit}` : '';
          return (
            <li
              key={r.id}
              className={styles.row}
              role="group"
              aria-label={`${labels.ruleN(i + 1)}: ${c.label} ${r.operator} ${valLabel}${unit}`}
            >
              <div className={styles.cell}>
                <Select
                  size="sm"
                  aria-label={labels.criterion}
                  value={r.criterion}
                  options={criteria.map((x) => ({ value: x.value, label: x.label }))}
                  onChange={(v) => patch(r.id, { criterion: v })}
                />
              </div>
              <div className={styles.cell}>
                <Select
                  size="sm"
                  aria-label={labels.operator}
                  value={r.operator}
                  options={c.operators.map((o) => ({ value: o, label: o }))}
                  onChange={(v) => patch(r.id, { operator: v })}
                />
              </div>
              <div className={styles.cell}>
                {c.values ? (
                  <Select
                    size="sm"
                    aria-label={labels.value}
                    value={r.value}
                    options={opts(c.values)}
                    onChange={(v) => patch(r.id, { value: v })}
                  />
                ) : (
                  <Input
                    size="sm"
                    aria-label={labels.value}
                    defaultValue={r.value}
                    suffix={c.unit}
                  />
                )}
              </div>
              <button
                type="button"
                className={cn(ib.root, ib.quiet, ib.sm)}
                aria-label={labels.removeCondition}
                title={labels.removeCondition}
                onClick={() => set(list.filter((x) => x.id !== r.id))}
              >
                <Icon icon="x" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.foot}>
        <Button
          size="sm"
          variant="quiet"
          icon="plus"
          onPress={() =>
            set([
              ...list,
              {
                id: `r${Date.now()}`,
                criterion: criteria[0]?.value ?? '',
                operator: criteria[0]?.operators[0] ?? '',
                value: '',
              },
            ])
          }
        >
          {labels.addCondition}
        </Button>
        {estimate != null && (
          <span className={cn('body-small', 'v-num', styles.est)}>
            <Icon icon="users" size={14} />
            {labels.eligibleN(estimate)}
          </span>
        )}
      </div>
    </div>
  );
}
