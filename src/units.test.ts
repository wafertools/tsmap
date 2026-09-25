import { describe, it, expect } from 'vitest';
import { unitShift, shiftUnit, harmoniseTestUnits } from './units';
import type { TestDef } from './types';

describe('unitShift', () => {
  it('converts between SI prefixes on the same base unit', () => {
    expect(unitShift('mV', 'V')).toBe(-3);
    expect(unitShift('V', 'mV')).toBe(3);
    expect(unitShift('nA', 'µA')).toBe(-3);
    expect(unitShift('uA', 'μA')).toBe(0);
    expect(unitShift('kHz', 'MHz')).toBe(-3);
    expect(unitShift('MΩ', 'kΩ')).toBe(3);
    expect(unitShift(' V ', 'V')).toBe(0);
  });

  it('refuses anything that is not a prefix-only difference', () => {
    expect(unitShift('V', 'A')).toBeUndefined();
    expect(unitShift('dB', 'B')).toBeUndefined();
    expect(unitShift('Pa', 'a')).toBeUndefined();
    expect(unitShift('widgets', 'mwidgets')).toBeUndefined();
  });

  it('refuses a letter-case difference and mega-and-up on units that do not use them', () => {
    // A tool that upper-cases units turns mV into MV; reading that as megavolts
    // would rescale the data a billionfold.
    expect(unitShift('mV', 'MV')).toBeUndefined();
    expect(unitShift('MA', 'A')).toBeUndefined();
    expect(unitShift('GV', 'V')).toBeUndefined();
  });
});

describe('shiftUnit', () => {
  it('lands on the exact decimal, not a rounding neighbour', () => {
    expect(shiftUnit(350, -3)).toBe(0.35);
    expect(shiftUnit(0.35, 3)).toBe(350);
    expect(shiftUnit(1.5, 0)).toBe(1.5);
  });
});

describe('harmoniseTestUnits', () => {
  const def = (units: string, lo?: number, hi?: number): TestDef => ({ name: 'Vth', testType: 'P', units, loLimit: lo, hiLimit: hi });
  const file = (fileName: string, units: string, values: number[], lo?: number, hi?: number) => ({
    fileName,
    parsed: { testDefs: { '1010': def(units, lo, hi) }, wafers: [{ results: values.map(v => ({ testValues: { 1010: v } })) }] },
  });

  it('converts a later file to the first file\'s unit — values, limits and the unit', () => {
    const a = file('a.stdf', 'V', [0.3], 0.2, 0.4);
    const b = file('b.stdf', 'mV', [300, 350], 200, 400);
    const conversions = harmoniseTestUnits([a, b]);
    expect(conversions).toEqual([{ testNumber: '1010', fileName: 'b.stdf', from: 'mV', to: 'V' }]);
    expect(b.parsed.testDefs['1010']).toMatchObject({ units: 'V', loLimit: 0.2, hiLimit: 0.4 });
    expect(b.parsed.wafers[0].results.map(d => d.testValues[1010])).toEqual([0.3, 0.35]);
    expect(a.parsed.testDefs['1010'].units).toBe('V');
  });

  it('uses the already-loaded lot as the reference when appending', () => {
    const b = file('b.stdf', 'V', [0.3]);
    harmoniseTestUnits([b], { '1010': def('mV') });
    expect(b.parsed.testDefs['1010'].units).toBe('mV');
    expect(b.parsed.wafers[0].results[0].testValues[1010]).toBe(300);
  });

  it('leaves a real unit clash, and tests with no unit, alone', () => {
    const a = file('a.stdf', 'V', [1]);
    const b = file('b.stdf', 'A', [2]);
    const c = file('c.stdf', '', [3]);
    expect(harmoniseTestUnits([a, b, c])).toEqual([]);
    expect(b.parsed.wafers[0].results[0].testValues[1010]).toBe(2);
    expect(b.parsed.testDefs['1010'].units).toBe('A');
  });

  it('adds no limits a file did not state', () => {
    const b = file('b.stdf', 'mV', [300]);
    harmoniseTestUnits([file('a.stdf', 'V', [0.3]), b]);
    expect('loLimit' in b.parsed.testDefs['1010'] && b.parsed.testDefs['1010'].loLimit !== undefined).toBe(false);
  });
});
