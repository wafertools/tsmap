// Reading and editing a wafer's records as columns (`WaferData.results`, a
// wmap `DieColumns` straight from the parser's `decodeColumns`). tsmap passes
// the columns to `buildWaferMap` untouched; these are the few things it needs
// to know or change before that, each done column by column, never per die.
import type { DieColumns, DieResult } from '@wafertools/wafermap';

/** STDF's missing values in integer columns (`NaN` is missing in any column). */
const COORD_MISSING = -32768;
const U16_MISSING = 65535;

const present = (v: number, missing: number) => v !== missing && !Number.isNaN(v);

/** The positioned records' coordinates. */
export function positions(c: DieColumns): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  if (!c.x || !c.y) return out;
  for (let i = 0; i < c.count; i++) {
    const x = c.x[i], y = c.y[i];
    if (present(x, COORD_MISSING) && present(y, COORD_MISSING)) out.push({ x, y });
  }
  return out;
}

/** Every hard bin on the records. */
export function hardBins(c: DieColumns): Set<number> {
  const bins = new Set<number>();
  if (c.hbin) for (let i = 0; i < c.count; i++) if (present(c.hbin[i], U16_MISSING)) bins.add(c.hbin[i]);
  return bins;
}

/** True when any record has a hard (or soft) bin. */
export function hasBins(c: DieColumns, which: 'hbin' | 'sbin'): boolean {
  const col = c[which];
  if (!col) return false;
  for (let i = 0; i < c.count; i++) if (present(col[i], U16_MISSING)) return true;
  return false;
}

/** Test numbers with at least one value (or, with `'all'`, a value or a verdict). */
export function testNumbers(c: DieColumns, which: 'values' | 'all' = 'values'): number[] {
  const nums = new Set<number>();
  for (const [k, p] of Object.entries(c.testValues ?? {})) if (p.indices.length) nums.add(Number(k));
  if (which === 'all') for (const [k, p] of Object.entries(c.testPass ?? {})) if (p.indices.length) nums.add(Number(k));
  return [...nums].sort((a, b) => a - b);
}

/** The records with only the tests in `keep`: a new object; the columns themselves are shared, not copied. */
export function keepTests(c: DieColumns, keep: ReadonlySet<number>): DieColumns {
  const pick = <P>(byTest: Record<number, P> | undefined) => byTest === undefined ? undefined
    : Object.fromEntries(Object.entries(byTest).filter(([k]) => keep.has(Number(k))));
  const out: DieColumns = { ...c };
  if (c.testValues) out.testValues = pick(c.testValues);
  if (c.testPass) out.testPass = pick(c.testPass);
  return out;
}

/**
 * Replaces test `testNumber`'s values with `f(value)`, in place. The new values
 * are 64-bit, whatever the column was: a scaled reading is not a raw one, and
 * its digits are not the parser's to round.
 */
export function mapTestValues(c: DieColumns, testNumber: number, f: (v: number) => number): void {
  const pair = c.testValues?.[testNumber];
  if (!pair) return;
  c.testValues![testNumber] = { indices: pair.indices, values: Float64Array.from(pair.values as ArrayLike<number>, f) };
}

/**
 * Rows as columns. For tests and for data that arrives as rows: the parser
 * already hands tsmap columns.
 */
export function columnsFromRows(rows: readonly DieResult[]): DieColumns {
  const n = rows.length;
  const col = (get: (r: DieResult) => number | undefined, missing: number) =>
    Float64Array.from(rows, r => get(r) ?? missing);
  const values: Record<number, { indices: number[]; values: number[] }> = {};
  const verdicts: Record<number, { indices: number[]; values: boolean[] }> = {};
  rows.forEach((r, i) => {
    for (const [k, v] of Object.entries(r.testValues ?? {})) {
      const p = (values[Number(k)] ??= { indices: [], values: [] });
      p.indices.push(i); p.values.push(v);
    }
    for (const [k, v] of Object.entries(r.testPass ?? {})) {
      const p = (verdicts[Number(k)] ??= { indices: [], values: [] });
      p.indices.push(i); p.values.push(v);
    }
  });
  const out: DieColumns = {
    count: n,
    x: col(r => r.x, NaN), y: col(r => r.y, NaN),
    hbin: col(r => r.hbin, NaN), sbin: col(r => r.sbin, NaN), siteNum: col(r => r.siteNum, NaN),
  };
  if (rows.some(r => r.partId !== undefined)) out.partId = rows.map(r => r.partId);
  if (rows.some(r => r.supersedes !== undefined)) out.supersedes = rows.map(r => r.supersedes);
  if (rows.some(r => r.metadata !== undefined)) out.metadata = rows.map(r => r.metadata);
  if (Object.keys(values).length) out.testValues = values;
  if (Object.keys(verdicts).length) out.testPass = verdicts;
  return out;
}

/** Record `i`'s test values and verdicts as objects (empty when it has none). For tests and diagnostics. */
export function recordOf(c: DieColumns, i: number): { testValues: Record<number, number>; testPass: Record<number, boolean> } {
  const testValues: Record<number, number> = {}, testPass: Record<number, boolean> = {};
  for (const [k, { indices, values }] of Object.entries(c.testValues ?? {})) {
    const at = Array.prototype.indexOf.call(indices, i);
    if (at >= 0) testValues[Number(k)] = values[at];
  }
  for (const [k, { indices, values }] of Object.entries(c.testPass ?? {})) {
    const at = Array.prototype.indexOf.call(indices, i);
    if (at >= 0) testPass[Number(k)] = values[at] === true || values[at] === 1;
  }
  return { testValues, testPass };
}
