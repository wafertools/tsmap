// The test editor's model: the table of what each measured test is called, the limits it is judged
// against, its units and its type; what Apply turns the edits into; and what was the data's own value.
// Pure, so every rule is tested without a DOM — `testEditorUI.ts` is the dialog over it.
//
// A test override stores only the fields that differ from what the data stated, so an edit is
// compared with the data's value, not with the table's opening state: typing the data's value back
// removes the override, and a blank cell means "the data's value" (an override cannot say "no
// limit"). Rows start at the *effective* value — data, then any override already loaded.

import type { TestDef, TestOverride } from './types';
import { TableModel, type TableRow } from './definitionsTable';

export const LIMIT_FIELDS = ['loLimit', 'hiLimit', 'loSpec', 'hiSpec', 'loValid', 'hiValid'] as const;
export type LimitField = typeof LIMIT_FIELDS[number];

/** Columns a user may edit; each has a `data.<id>` twin holding what the data stated. */
export const EDITABLE = ['name', ...LIMIT_FIELDS, 'units', 'parametric'] as const;
const dataKey = (c: string) => `data.${c}`;

export interface TestEditorEntry {
  num: number;
  /** The test as the data (or a definitions file applied before it) stated it. */
  def: TestDef;
  /** Overrides already in force from a file or an earlier edit. */
  override?: TestOverride;
}

const text = (n: number | undefined): string | undefined => (n === undefined ? undefined : String(n));

export function buildTestRows(entries: readonly TestEditorEntry[]): TableRow[] {
  return entries.map(({ num, def, override: ov }) => {
    const cells: TableRow['cells'] = { num: String(num) };
    const put = (col: string, effective: string | boolean | undefined, data: string | boolean | undefined) => {
      cells[col] = effective;
      cells[dataKey(col)] = data;
    };
    put('name', ov?.name ?? def.name, def.name);
    for (const f of LIMIT_FIELDS) put(f, text(ov?.[f] ?? def[f]), text(def[f]));
    put('units', ov?.units ?? def.units, def.units);
    put('parametric', (ov?.testType ?? def.testType) === 'P', def.testType === 'P');
    return { id: String(num), cells };
  });
}

/** A limit as typed: blank, a finite number (kept as its canonical text), or `null` for neither. */
export function parseLimitText(raw: string): string | undefined | null {
  const t = raw.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : null;
}

const blank = (v: unknown) => v === undefined || v === '';
const sameCell = (a: unknown, b: unknown) => (blank(a) && blank(b)) || a === b;

/** Whether any editable cell of the row differs from the data's value. */
export function differsFromData(row: TableRow): boolean {
  return EDITABLE.some(c => !sameCell(row.cells[c], row.cells[dataKey(c)]));
}

/**
 * A cleared cell goes back to the data's value rather than staying blank: an override cannot remove
 * a limit the data states. Returns how many cells were put back.
 */
export function restoreBlanks(model: TableModel): number {
  let n = 0;
  for (const row of model.rows()) {
    for (const c of EDITABLE) {
      if (c === 'parametric') continue;
      const data = row.cells[dataKey(c)];
      if (blank(row.cells[c]) && !blank(data)) { model.set(row.id, c, data); n++; }
    }
  }
  return n;
}

/** Put the given rows back to what the data states, discarding every override on them. */
export function useDataValues(model: TableModel, ids: readonly string[]): void {
  for (const id of ids) {
    const row = model.row(id);
    if (!row) continue;
    for (const c of EDITABLE) model.set(id, c, row.cells[dataKey(c)]);
  }
}

/**
 * The overrides the edited rows now stand for, by test number: only the fields that differ from the
 * data, or `undefined` when a row is back to the data and its override should go. Rows not edited are
 * absent — whatever override they have is left as it is.
 */
export function rowsToOverrides(model: TableModel): Map<number, TestOverride | undefined> {
  const out = new Map<number, TestOverride | undefined>();
  for (const id of model.editedIds()) {
    const row = model.row(id)!;
    const c = row.cells;
    const ov: TestOverride = {};
    if (!blank(c.name) && c.name !== c[dataKey('name')]) ov.name = String(c.name);
    for (const f of LIMIT_FIELDS) {
      if (blank(c[f])) continue;
      const v = Number(c[f]);
      const d = blank(c[dataKey(f)]) ? undefined : Number(c[dataKey(f)]);
      if (v !== d) ov[f] = v;
    }
    const units = typeof c.units === 'string' ? c.units.trim() : '';
    if (units !== '' && units !== (c[dataKey('units')] ?? '')) ov.units = units;
    if (c.parametric !== c[dataKey('parametric')]) ov.testType = c.parametric === true ? 'P' : 'F';
    out.set(Number(id), Object.keys(ov).length ? ov : undefined);
  }
  return out;
}

/** What is wrong with the edited rows, one sentence each — a low limit above its high limit. */
export function editProblems(model: TableModel): string[] {
  const problems: string[] = [];
  const pairs = [['loLimit', 'hiLimit', 'test'], ['loSpec', 'hiSpec', 'spec'], ['loValid', 'hiValid', 'validity']] as const;
  for (const id of model.editedIds()) {
    const c = model.row(id)!.cells;
    for (const [lo, hi, kind] of pairs) {
      if (blank(c[lo]) || blank(c[hi])) continue;
      if (Number(c[lo]) > Number(c[hi])) problems.push(`Test ${id}: the low ${kind} limit is above the high one.`);
    }
  }
  return problems;
}
