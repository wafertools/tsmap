import { describe, it, expect } from 'vitest';
import { TableModel } from './definitionsTable';
import type { TestDef } from './types';
import {
  buildTestRows, parseLimitText, differsFromData, restoreBlanks, useDataValues, rowsToOverrides, editProblems,
} from './testEditor';

const def = (o: Partial<TestDef> = {}): TestDef => ({ name: 'Vdd', testType: 'P', loLimit: 1.6, hiLimit: 2, units: 'V', ...o });
const modelOf = (entries = [{ num: 1001, def: def() }, { num: 1002, def: def({ name: 'Idsat', loLimit: undefined, hiLimit: undefined, units: 'mA' }) }]) =>
  new TableModel(buildTestRows(entries));

describe('buildTestRows', () => {
  it('starts at the effective value: data, then an override already in force', () => {
    const m = new TableModel(buildTestRows([{ num: 1001, def: def(), override: { hiLimit: 2.2, name: 'Supply' } }]));
    expect(m.get('1001', 'hiLimit')).toBe('2.2');
    expect(m.get('1001', 'data.hiLimit')).toBe('2');
    expect(m.get('1001', 'name')).toBe('Supply');
    expect(m.isEdited('1001')).toBe(false);
  });

  it('marks a row that differs from the data even before any edit', () => {
    const m = new TableModel(buildTestRows([{ num: 1001, def: def(), override: { hiLimit: 2.2 } }]));
    expect(differsFromData(m.row('1001')!)).toBe(true);
    expect(differsFromData(modelOf().row('1001')!)).toBe(false);
  });

  it('reads type as parametric or not', () => {
    const m = new TableModel(buildTestRows([{ num: 5, def: def({ testType: 'F' }) }]));
    expect(m.get('5', 'parametric')).toBe(false);
  });
});

describe('parseLimitText', () => {
  it.each([['', undefined], [' ', undefined], ['1.60', '1.6'], ['-3', '-3'], ['1e-9', '1e-9']])('%j -> %j', (raw, want) => {
    expect(parseLimitText(raw)).toBe(want);
  });
  it.each(['abc', '1,5', 'NaN', 'Infinity'])('rejects %j', raw => {
    expect(parseLimitText(raw)).toBeNull();
  });
});

describe('rowsToOverrides', () => {
  it('carries only the fields that differ from the data', () => {
    const m = modelOf();
    m.set('1001', 'hiLimit', '2.2');
    m.set('1001', 'loSpec', '1.5');
    m.set('1001', 'name', 'Supply');
    expect(rowsToOverrides(m).get(1001)).toEqual({ hiLimit: 2.2, loSpec: 1.5, name: 'Supply' });
  });

  it('drops the override when the data value is typed back', () => {
    const m = new TableModel(buildTestRows([{ num: 1001, def: def(), override: { hiLimit: 2.2 } }]));
    m.set('1001', 'hiLimit', '2');
    expect(rowsToOverrides(m).get(1001)).toBeUndefined();
    expect(rowsToOverrides(m).has(1001)).toBe(true);
  });

  it('leaves unedited rows out entirely', () => {
    const m = modelOf();
    m.set('1001', 'units', 'mV');
    expect([...rowsToOverrides(m).keys()]).toEqual([1001]);
  });

  it('writes a type change both ways', () => {
    const m = modelOf();
    m.set('1002', 'parametric', false);
    expect(rowsToOverrides(m).get(1002)).toEqual({ testType: 'F' });
  });

  it('compares limits as numbers, so 2.0 is the data’s 2', () => {
    const m = modelOf();
    m.set('1001', 'hiLimit', parseLimitText('2.0') as string);
    expect(m.isEdited('1001')).toBe(false);
  });
});

describe('blank cells and data values', () => {
  it('puts the data back where a cell was cleared', () => {
    const m = modelOf();
    m.set('1001', 'loLimit', undefined);
    expect(restoreBlanks(m)).toBe(1);
    expect(m.get('1001', 'loLimit')).toBe('1.6');
  });

  it('leaves a cell blank when the data has nothing there', () => {
    const m = modelOf();
    m.set('1002', 'loLimit', '1');
    m.set('1002', 'loLimit', undefined);
    expect(restoreBlanks(m)).toBe(0);
  });

  it('useDataValues discards every change on the rows', () => {
    const m = modelOf();
    m.set('1001', 'hiLimit', '9');
    m.set('1001', 'units', 'mV');
    useDataValues(m, ['1001']);
    expect(m.isEdited('1001')).toBe(false);
    expect(rowsToOverrides(m).size).toBe(0);
  });
});

describe('editProblems', () => {
  it('flags a low limit above a high limit on an edited row', () => {
    const m = modelOf();
    m.set('1001', 'loLimit', '5');
    expect(editProblems(m)).toEqual(['Test 1001: the low test limit is above the high one.']);
  });
  it('is quiet when nothing is wrong', () => {
    expect(editProblems(modelOf())).toEqual([]);
  });
});
