import { describe, it, expect } from 'vitest';
import { TableModel } from './definitionsTable';
import {
  buildDerivedRows, newDerivedRow, nextFreeNumber, checkRow, rowsToEntries, editProblems, toDerivedDef, FIRST_DERIVED_NUMBER,
  type DerivedContext,
} from './derivedEditor';

const ctx = (selected = [1001, 1002]): DerivedContext => ({
  measured: [
    { testNumber: 1001, name: 'Vdd', unit: 'V' },
    { testNumber: 1002, name: 'Idsat', unit: 'mA' },
    { testNumber: 1003, name: 'Spare', unit: 'mA' },
  ],
  selected: new Set(selected),
});

const entry = (o: Record<string, unknown> = {}) => ({ num: 900001, name: 'Ratio', expression: 't[1002] / t[1001]', units: 'mA/V', testType: 'P' as const, ...o });
const modelOf = (...entries: ReturnType<typeof entry>[]) => new TableModel(buildDerivedRows(entries.length ? entries : [entry()]));

describe('nextFreeNumber', () => {
  it('starts at 900001 and skips what is taken', () => {
    expect(nextFreeNumber(new Set())).toBe(FIRST_DERIVED_NUMBER);
    expect(nextFreeNumber(new Set([900001, 900002]))).toBe(900003);
  });
});

describe('buildDerivedRows', () => {
  it('carries number, name, expression, units, limits and kind', () => {
    const m = modelOf(entry({ loLimit: 0.5, hiLimit: 3 }));
    const c = m.rows()[0].cells;
    expect(c).toMatchObject({ num: '900001', name: 'Ratio', expression: 't[1002] / t[1001]', units: 'mA/V', loLimit: '0.5', hiLimit: '3', parametric: true });
  });
  it('reads a functional test as not parametric', () => {
    expect(modelOf(entry({ testType: 'F' })).rows()[0].cells.parametric).toBe(false);
  });
});

describe('checkRow', () => {
  it('accepts an expression wmap accepts and lists what it reads, with names', () => {
    const m = modelOf();
    const c = checkRow(m.rows()[0], [], ctx());
    expect(c.ok).toBe(true);
    expect(c.reads).toBe('#1002 Idsat, #1001 Vdd');
  });

  it('gives wmap’s own message, position included, for a bad expression', () => {
    const m = modelOf(entry({ expression: 't[1002] / ' }));
    const c = checkRow(m.rows()[0], [], ctx());
    expect(c.ok).toBe(false);
    expect(c.summary).toMatch(/position \d+/);
  });

  it('refuses a read of a listed test that is not selected for import', () => {
    const m = modelOf(entry({ expression: 't[1003] + t[1001]' }));
    const c = checkRow(m.rows()[0], [], ctx());
    expect(c.ok).toBe(false);
    expect(c.summary).toBe('Reads #1003 Spare, which is not selected for import.');
  });

  it('refuses a number that is not a whole STDF number', () => {
    const m = modelOf();
    m.set(m.rows()[0].id, 'num', '12.5');
    expect(checkRow(m.rows()[0], [], ctx()).ok).toBe(false);
  });

  it('refuses a number another derived test already has', () => {
    const m = modelOf(entry(), entry({ name: 'Other', expression: 't[1001] * 2' }));
    const [a, b] = m.rows();
    expect(checkRow(b, [a], ctx()).summary).toMatch(/used by another/);
  });

  it('refuses a number that is a measured test’s', () => {
    const m = modelOf(entry({ num: 1001 }));
    expect(checkRow(m.rows()[0], [], ctx()).ok).toBe(false);
  });

  it('lets one derived test read another', () => {
    const m = modelOf(entry(), entry({ num: 900002, name: 'Double', expression: 't[900001] * 2' }));
    const [a, b] = m.rows();
    const c = checkRow(b, [a], ctx());
    expect(c.ok).toBe(true);
    expect(c.reads).toBe('#900001 Ratio');
  });

  it('wants a verdict to be functional', () => {
    const m = modelOf(entry({ expression: 't[1001] > 1.6' }));
    expect(checkRow(m.rows()[0], [], ctx()).ok).toBe(false);
    m.set(m.rows()[0].id, 'parametric', false);
    expect(checkRow(m.rows()[0], [], ctx()).summary).toBe('Verdict (functional)');
  });
});

describe('rowsToEntries and editProblems', () => {
  it('writes the rows back as entries, leaving out blank optional fields', () => {
    const m = modelOf();
    expect(rowsToEntries(m)).toEqual([{ num: 900001, name: 'Ratio', expression: 't[1002] / t[1001]', testType: 'P', units: 'mA/V' }]);
  });

  it('follows a renumbered row and a new row, and drops a deleted one', () => {
    const m = modelOf(entry(), entry({ num: 900002, name: 'B', expression: 't[1001] * 2' }));
    const [a, b] = m.rows();
    m.set(a.id, 'num', '900010');
    m.remove(b.id);
    const fresh = newDerivedRow(new Set([900010]));
    m.add(fresh);
    m.set(fresh.id, 'expression', 't[1001] + 1');
    expect(rowsToEntries(m).map(e => e.num)).toEqual([900010, 900001]);
  });

  it('refuses Apply while a row would be dropped, naming it', () => {
    const m = modelOf(entry({ expression: 'nonsense(' }));
    const p = editProblems(m, ctx());
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Ratio: /);
  });

  it('has no problem for sound rows', () => {
    expect(editProblems(modelOf(), ctx())).toEqual([]);
  });

  it('reports a limit that is not a number', () => {
    const m = modelOf();
    m.set(m.rows()[0].id, 'hiLimit', 'abc');
    expect(editProblems(m, ctx()).some(p => /must be a number/.test(p))).toBe(true);
  });
});

describe('toDerivedDef', () => {
  it('names an unnamed test the way the file reader does', () => {
    const m = modelOf(entry({ name: undefined }));
    expect(toDerivedDef(m.rows()[0])?.name).toBe('Derived 900001');
  });
});
