import { describe, it, expect, beforeEach } from 'vitest';
import { limitFieldForHeader } from './limitNames';
import { parseTestListFile, formatTestListCsv } from './testSelectorUI';
import { applyTestOverrides, toWmapTestDefs } from './lib';
import { getValueFilter, setValueFilter, normalizeValueFilter } from './valueFilter';
import type { TestDef } from './types';

describe('validity limits', () => {
  it('reads lvl/uvl as validity limits, and nothing else as one', () => {
    expect(limitFieldForHeader('LVL', { bare: false })).toBe('loValid');
    expect(limitFieldForHeader('uvl', { bare: true })).toBe('hiValid');
    expect(limitFieldForHeader('lsl', { bare: false })).toBe('loSpec');
  });

  it('round-trips through a definitions file, as their own pair', () => {
    const csv = formatTestListCsv([{ num: 1, name: 'Vth', loValid: -100, hiValid: 100, hiLimit: 3 }]);
    const [row] = parseTestListFile(csv);
    expect(row).toMatchObject({ num: 1, loValid: -100, hiValid: 100, hiLimit: 3 });
    expect(row.loLimit).toBeUndefined();
    expect(row.loSpec).toBeUndefined();
  });

  it('reads lvl/uvl columns by their built-in names', () => {
    const [row] = parseTestListFile('num,lvl,uvl\n7,-5,5\n');
    expect(row).toMatchObject({ num: 7, loValid: -5, hiValid: 5 });
  });

  it('drops an inverted validity pair, keeping the other pairs', () => {
    const [row] = parseTestListFile('num,lvl,uvl,hiLimit\n7,10,-10,3\n');
    expect(row.loValid).toBeUndefined();
    expect(row.hiValid).toBeUndefined();
    expect(row.hiLimit).toBe(3);
  });

  it('rescales an override\'s validity limits with its units, so a converted value is not wrongly excluded', () => {
    const defs: Record<string, TestDef> = { '1': { name: 'Vth', testType: 'P', units: 'V' } };
    applyTestOverrides(defs, new Map([[1, { units: 'mV', loValid: -100000, hiValid: 100000 }]]));
    expect(defs['1'].loValid).toBeCloseTo(-100);
    expect(defs['1'].hiValid).toBeCloseTo(100);
  });

  it('hands validity limits to wmap as validLow/validHigh', () => {
    const [def] = toWmapTestDefs({ '1': { name: 'Vth', testType: 'P', loValid: -1, hiValid: 1 } });
    expect(def).toMatchObject({ validLow: -1, validHigh: 1 });
  });
});

// Minimal localStorage stub, as waferGeometry.test.ts uses, rather than pull in jsdom.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

describe('value filter setting', () => {
  beforeEach(() => store.clear());

  it('defaults to validity limits and falls back to it for anything unknown', () => {
    expect(getValueFilter()).toBe('validity');
    expect(normalizeValueFilter('nonsense')).toBe('validity');
  });

  it('remembers a chosen mode, and clears the stored value for the default', () => {
    expect(setValueFilter('spec')).toBe('spec');
    expect(getValueFilter()).toBe('spec');
    setValueFilter('validity');
    expect(localStorage.getItem('tsmap:value-filter')).toBeNull();
  });
});
