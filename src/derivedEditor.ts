// The derived-test editor's model: the table of computed tests (number, name, expression, units, test limits,
// type), what each expression reads, and whether wmap would accept it. Pure, so the rules are tested without a
// DOM; `derivedEditorUI.ts` is the dialog over it.
//
// tsmap never parses an expression. `checkDerivedExpression` (wmap) is the only judge: it runs the parser, the
// namespace and the kind rule `buildWaferMap` applies, so what the editor accepts is what gets computed. What
// this module adds is the list-level rules wmap cannot know — the numbers must be unique and unused, and a test
// the expression reads must be one that will actually be imported.

import { checkDerivedExpression, type DerivedTestDef, type TestDef as WmapTestDef } from '@wafertools/wafermap';
import { TableModel, type TableRow } from './definitionsTable';
import type { TestListEntry } from './testSelectorUI';
import { parseLimitText } from './testEditor';

/** A derived test must not reuse a measured test's number; this is where new ones start, as the template does. */
export const FIRST_DERIVED_NUMBER = 900001;
const STDF_TEST_NUM_MAX = 4294967295;

export function nextFreeNumber(used: ReadonlySet<number>, from = FIRST_DERIVED_NUMBER): number {
  let n = from;
  while (used.has(n)) n++;
  return n;
}

let counter = 0;
/** A fresh row id. Ids are not test numbers, so a row can be renumbered without losing its identity. */
export const newRowId = (): string => `d${++counter}`;

const text = (n: number | undefined): string | undefined => (n === undefined ? undefined : String(n));

/** Rows from the derived tests as the selector holds them, with any renames and limits already folded in. */
export function buildDerivedRows(entries: readonly TestListEntry[]): TableRow[] {
  return entries.map(e => ({
    id: newRowId(),
    cells: {
      num: String(e.num),
      name: e.name,
      expression: e.expression ?? '',
      units: e.units,
      loLimit: text(e.loLimit),
      hiLimit: text(e.hiLimit),
      parametric: (e.testType ?? 'P') === 'P',
    },
  }));
}

export function newDerivedRow(used: ReadonlySet<number>): TableRow {
  return {
    id: newRowId(),
    cells: { num: String(nextFreeNumber(used)), name: undefined, expression: '', units: undefined, loLimit: undefined, hiLimit: undefined, parametric: true },
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOf = (row: TableRow): number | undefined => {
  const t = str(row.cells.num).trim();
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n <= STDF_TEST_NUM_MAX ? n : undefined;
};

/** A row as wmap's derived-test definition, which is what the check and the build both take. */
export function toDerivedDef(row: TableRow): DerivedTestDef | undefined {
  const num = numOf(row);
  if (num === undefined) return undefined;
  const lo = parseLimitText(str(row.cells.loLimit));
  const hi = parseLimitText(str(row.cells.hiLimit));
  return {
    testNumber: num,
    name: str(row.cells.name).trim() || `Derived ${num}`,
    unit: str(row.cells.units).trim() || undefined,
    limitLow: typeof lo === 'string' ? Number(lo) : undefined,
    limitHigh: typeof hi === 'string' ? Number(hi) : undefined,
    testType: row.cells.parametric === false ? 'F' : 'P',
    expression: str(row.cells.expression),
  };
}

export interface DerivedContext {
  /** Every measured test listed, as wmap states them (limits included, for `specPass[n]`). */
  measured: readonly WmapTestDef[];
  /** The measured tests that will be imported; an expression may only read these. */
  selected: ReadonlySet<number>;
}

export interface RowCheck {
  ok: boolean;
  /** One line for the table: what is wrong, or how the test reads. */
  summary: string;
  /** The tests it reads, as `#1002 Idsat`, for the dependency column. */
  reads: string;
  /** Advice that does not stop it being built. */
  warnings: string[];
}

const labelOf = (num: number, names: ReadonlyMap<number, string>) => `#${num}${names.has(num) ? ` ${names.get(num)}` : ''}`;

/** Whether wmap accepts this row's expression, and what it depends on. */
export function checkRow(row: TableRow, others: readonly TableRow[], ctx: DerivedContext): RowCheck {
  const num = numOf(row);
  if (num === undefined) {
    return { ok: false, summary: 'The test number must be a whole number from 0 to 4294967295.', reads: '', warnings: [] };
  }
  const otherDefs = others.map(toDerivedDef).filter((d): d is DerivedTestDef => d !== undefined);
  if (otherDefs.some(d => d.testNumber === num)) {
    return { ok: false, summary: `Test number ${num} is used by another derived test.`, reads: '', warnings: [] };
  }
  const def = toDerivedDef(row)!;
  const r = checkDerivedExpression(
    { expression: def.expression, testNumber: num, testType: def.testType }, ctx.measured, otherDefs);
  if (!r.ok) {
    return { ok: false, summary: r.message, reads: '', warnings: [] };
  }
  const names = new Map<number, string>([...ctx.measured.map(d => [d.testNumber, d.name] as const), ...otherDefs.map(d => [d.testNumber, d.name ?? ''] as const)]);
  const reads = [...new Set(r.reads.map(x => x.test))];
  const notImported = reads.filter(t => ctx.measured.some(d => d.testNumber === t) && !ctx.selected.has(t));
  const readsText = reads.map(t => labelOf(t, names)).join(', ');
  if (notImported.length > 0) {
    return {
      ok: false,
      summary: `Reads ${notImported.map(t => labelOf(t, names)).join(', ')}, which ${notImported.length > 1 ? 'are' : 'is'} not selected for import.`,
      reads: readsText,
      warnings: r.warnings,
    };
  }
  return { ok: true, summary: r.produces === 'verdict' ? 'Verdict (functional)' : 'Number', reads: readsText, warnings: r.warnings };
}

/** The derived tests as the selector keeps them, from the table as it stands. */
export function rowsToEntries(model: TableModel): TestListEntry[] {
  const out: TestListEntry[] = [];
  for (const row of model.rows()) {
    const def = toDerivedDef(row);
    if (!def) continue;
    const lo = parseLimitText(str(row.cells.loLimit));
    const hi = parseLimitText(str(row.cells.hiLimit));
    out.push({
      num: def.testNumber,
      name: def.name,
      expression: def.expression,
      testType: def.testType,
      ...(def.unit ? { units: def.unit } : {}),
      ...(typeof lo === 'string' ? { loLimit: Number(lo) } : {}),
      ...(typeof hi === 'string' ? { hiLimit: Number(hi) } : {}),
    });
  }
  return out;
}

/** Why Apply is refused: one sentence per row that wmap would drop. Empty when every row is sound. */
export function editProblems(model: TableModel, ctx: DerivedContext): string[] {
  const rows = model.rows();
  const problems: string[] = [];
  for (const row of rows) {
    const c = checkRow(row, rows.filter(r => r.id !== row.id), ctx);
    if (!c.ok) problems.push(`${str(row.cells.name).trim() || `Test ${str(row.cells.num)}`}: ${c.summary}`);
  }
  for (const id of model.editedIds()) {
    const c = model.row(id)!.cells;
    for (const f of ['loLimit', 'hiLimit'] as const) {
      if (parseLimitText(str(c[f])) === null) problems.push(`Test ${str(c.num)}: the ${f === 'loLimit' ? 'low' : 'high'} limit must be a number.`);
    }
  }
  return problems;
}
