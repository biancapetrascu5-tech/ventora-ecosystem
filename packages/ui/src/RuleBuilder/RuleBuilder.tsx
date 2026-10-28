'use client';

import { useState, useId } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import { fmtNumber } from '../lib/fmt';
import styles from './RuleBuilder.module.css';

export interface RuleCriterion {
  value: string;
  label: string;
  operators: string[];
  values?: Array<{ value: string; label: string } | string>;
  unit?: string;
}

export interface RuleRow {
  id: string;
  criterion: string;
  operator: string;
  value: string | string[];
}

export interface RuleBuilderProps {
  criteria: RuleCriterion[];
  rules: RuleRow[];
  onChange?: (rules: RuleRow[]) => void;
  estimate?: number;
  estimateLabel?: string;
  addLabel?: string;
  locale?: string;
  className?: string;
}

function normalizeValues(c: RuleCriterion): Array<{ value: string; label: string }> {
  if (!c.values) return [];
  return c.values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v));
}

let _counter = 0;
function uid() {
  return `rule-${++_counter}`;
}

export function RuleBuilder({
  criteria,
  rules: rulesProp,
  onChange,
  estimate,
  estimateLabel = 'organizații estimate',
  addLabel = 'Adaugă regulă',
  locale,
  className,
}: RuleBuilderProps) {
  const controlled = onChange !== undefined;
  const [internalRules, setInternalRules] = useState<RuleRow[]>(rulesProp);
  const rules = controlled ? rulesProp : internalRules;
  const baseId = useId();

  const commit = (next: RuleRow[]) => {
    if (!controlled) setInternalRules(next);
    onChange?.(next);
  };

  const addRule = () => {
    const first = criteria[0];
    if (!first) return;
    const newRow: RuleRow = {
      id: uid(),
      criterion: first.value,
      operator: first.operators[0] ?? '',
      value: '',
    };
    commit([...rules, newRow]);
  };

  const removeRule = (id: string) => {
    commit(rules.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, patch: Partial<Omit<RuleRow, 'id'>>) => {
    commit(
      rules.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Reset operator/value when criterion changes
        if (patch.criterion && patch.criterion !== r.criterion) {
          const c = criteria.find((c) => c.value === patch.criterion);
          next.operator = c?.operators[0] ?? '';
          next.value = '';
        }
        return next;
      }),
    );
  };

  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.rows}>
        {rules.map((rule, idx) => {
          const criterion = criteria.find((c) => c.value === rule.criterion);
          const vals = criterion ? normalizeValues(criterion) : [];
          const rowId = `${baseId}-row-${rule.id}`;

          return (
            <div key={rule.id} className={styles.row} role="group" aria-label={`Regulă ${idx + 1}`}>
              {/* Criterion select */}
              <select
                id={`${rowId}-crit`}
                aria-label="Criteriu"
                className={styles.select}
                value={rule.criterion}
                onChange={(e) => updateRule(rule.id, { criterion: e.target.value })}
              >
                {criteria.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* Operator select */}
              <select
                aria-label="Operator"
                className={styles.select}
                value={rule.operator}
                onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
              >
                {(criterion?.operators ?? []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>

              {/* Value input */}
              {vals.length > 0 ? (
                <select
                  aria-label="Valoare"
                  className={cn(styles.select, styles.valueSelect)}
                  value={Array.isArray(rule.value) ? (rule.value[0] ?? '') : rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                >
                  <option value="">— alege —</option>
                  {vals.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={styles.valueInputWrap}>
                  <input
                    type="text"
                    aria-label="Valoare"
                    className={styles.valueInput}
                    value={Array.isArray(rule.value) ? rule.value.join(', ') : rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder="valoare"
                  />
                  {criterion?.unit && <span className={styles.unit}>{criterion.unit}</span>}
                </div>
              )}

              {/* Remove */}
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={`Șterge regula ${idx + 1}`}
                onClick={() => removeRule(rule.id)}
              >
                <Icon icon="trash" size="sm" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.addBtn} onClick={addRule}>
          <Icon icon="plus" size="sm" aria-hidden />
          {addLabel}
        </button>
        {estimate !== undefined && (
          <span className={styles.estimate}>
            <span className={styles.estimateNum}>{fmtNumber(estimate, locale)}</span>{' '}
            {estimateLabel}
          </span>
        )}
      </div>
    </div>
  );
}
