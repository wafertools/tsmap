import { describe, it, expect } from 'vitest';
import { parseBinDefsFile, formatBinDefsCsv, applyBinDefOverrides } from './binDefs';

describe('parseBinDefsFile', () => {
  it('parses a full header with all four columns', () => {
    const text = 'bin,type,name,pass\n1,hard,Pass,P\n2,hard,Contact Open,F\n10,soft,Leakage Fail,F\n';
    const entries = parseBinDefsFile(text);
    expect(entries).toEqual([
      { bin: 1, type: 'hard', name: 'Pass', pass: true },
      { bin: 2, type: 'hard', name: 'Contact Open', pass: false },
      { bin: 10, type: 'soft', name: 'Leakage Fail', pass: false },
    ]);
  });

  it('defaults type to hard when no type column or hbin/sbin header is present', () => {
    const text = 'bin,name\n1,Pass\n';
    expect(parseBinDefsFile(text)).toEqual([{ bin: 1, type: 'hard', name: 'Pass', pass: undefined }]);
  });

  it('hbin header implies hard type without a separate type column', () => {
    const text = 'hbin,name\n1,Pass\n';
    expect(parseBinDefsFile(text)[0].type).toBe('hard');
  });

  it('sbin header implies soft type without a separate type column', () => {
    const text = 'sbin,name\n10,Leakage Fail\n';
    expect(parseBinDefsFile(text)[0].type).toBe('soft');
  });

  it('an explicit type column overrides what the bin-column header would imply', () => {
    // Contradictory input (both an hbin-style column name and an explicit
    // type value) — explicit wins.
    const text = 'hbin,type,name\n10,soft,Leakage Fail\n';
    expect(parseBinDefsFile(text)[0].type).toBe('soft');
  });

  it.each([
    ['P', true], ['pass', true], ['Y', true], ['yes', true], ['TRUE', true], ['1', true],
    ['F', false], ['fail', false], ['N', false], ['no', false], ['FALSE', false], ['0', false],
  ])('accepts pass token %s -> %s', (token, expected) => {
    const text = `bin,pass\n1,${token}\n`;
    expect(parseBinDefsFile(text)[0].pass).toBe(expected);
  });

  it('blank pass leaves it undefined (no override)', () => {
    const text = 'bin,name,pass\n1,Pass,\n';
    expect(parseBinDefsFile(text)[0].pass).toBeUndefined();
  });

  it('drops a malformed field but keeps the rest of the row', () => {
    const warnings: string[] = [];
    const text = 'bin,name,pass\n1,Pass,maybe\n';
    const entries = parseBinDefsFile(text, (_, msg) => warnings.push(msg));
    expect(entries).toEqual([{ bin: 1, type: 'hard', name: 'Pass', pass: undefined }]);
    expect(warnings.some(w => w.includes('pass value'))).toBe(true);
  });

  it('drops a row with no identifiable bin number', () => {
    const text = 'bin,name\nabc,Pass\n2,Fail\n';
    expect(parseBinDefsFile(text).map(e => e.bin)).toEqual([2]);
  });

  it('skips blank lines and comments', () => {
    const text = '# a comment\nbin,name\n\n1,Pass\n';
    expect(parseBinDefsFile(text)).toEqual([{ bin: 1, type: 'hard', name: 'Pass', pass: undefined }]);
  });

  it('warns and ignores an unrecognized column but still parses recognized ones', () => {
    const warnings: string[] = [];
    const text = 'bin,foo,name\n1,xyz,Pass\n';
    const entries = parseBinDefsFile(text, (_, msg) => warnings.push(msg));
    expect(entries).toEqual([{ bin: 1, type: 'hard', name: 'Pass', pass: undefined }]);
    expect(warnings.some(w => w.includes('foo'))).toBe(true);
  });
});

describe('formatBinDefsCsv', () => {
  it('round-trips through parseBinDefsFile', () => {
    const original = [
      { bin: 1, type: 'hard' as const, name: 'Pass', pass: true },
      { bin: 2, type: 'hard' as const, name: 'Contact Open', pass: false },
      { bin: 10, type: 'soft' as const, name: 'Leakage Fail', pass: undefined },
    ];
    const csv = formatBinDefsCsv(original);
    expect(parseBinDefsFile(csv)).toEqual(original);
  });

  it('writes header comment lines', () => {
    const csv = formatBinDefsCsv([]);
    expect(csv).toContain('# tsmap bin definitions');
    expect(csv).toContain('bin,type,name,pass');
  });
});

describe('applyBinDefOverrides', () => {
  it('builds fresh bin defs from nothing (CSV/JSON/Parquet case)', () => {
    const result = applyBinDefOverrides({}, [
      { bin: 1, type: 'hard', name: 'Pass', pass: true },
      { bin: 10, type: 'soft', name: 'Leakage Fail', pass: false },
    ]);
    expect(result.hbinDefs).toEqual([{ bin: 1, name: 'Pass' }]);
    expect(result.sbinDefs).toEqual([{ bin: 10, name: 'Leakage Fail' }]);
    expect(result.passHbins).toEqual([1]);
  });

  it('keeps hard bin 1 and soft bin 1 independent (composite key)', () => {
    const result = applyBinDefOverrides({}, [
      { bin: 1, type: 'hard', name: 'Hard Pass' },
      { bin: 1, type: 'soft', name: 'Soft Pass' },
    ]);
    expect(result.hbinDefs).toEqual([{ bin: 1, name: 'Hard Pass' }]);
    expect(result.sbinDefs).toEqual([{ bin: 1, name: 'Soft Pass' }]);
  });

  it('a blank name in the override leaves an existing name alone', () => {
    const current = { hbinDefs: [{ bin: 1, name: 'Pass' }] };
    const result = applyBinDefOverrides(current, [{ bin: 1, type: 'hard', name: undefined, pass: true }]);
    expect(result.hbinDefs).toEqual([{ bin: 1, name: 'Pass' }]);
  });

  it('pass undefined in the override leaves existing pass-membership alone', () => {
    const current = { hbinDefs: [{ bin: 1, name: 'Pass' }], passHbins: [1] };
    const result = applyBinDefOverrides(current, [{ bin: 1, type: 'hard', name: 'Pass', pass: undefined }]);
    expect(result.passHbins).toEqual([1]);
  });

  it('explicit pass:false removes an already-passing bin from passHbins', () => {
    const current = { hbinDefs: [{ bin: 1, name: 'Pass' }], passHbins: [1] };
    const result = applyBinDefOverrides(current, [{ bin: 1, type: 'hard', pass: false }]);
    expect(result.passHbins).toBeUndefined();
  });

  it('a soft-bin pass flag never affects passHbins', () => {
    const result = applyBinDefOverrides({}, [{ bin: 10, type: 'soft', name: 'Leakage Fail', pass: true }]);
    expect(result.passHbins).toBeUndefined();
  });

  it('collapses to undefined fields when the result is empty', () => {
    const result = applyBinDefOverrides({}, []);
    expect(result).toEqual({ hbinDefs: undefined, sbinDefs: undefined, passHbins: undefined });
  });

  it('sorts results by bin number', () => {
    const result = applyBinDefOverrides({}, [
      { bin: 3, type: 'hard', name: 'Three' },
      { bin: 1, type: 'hard', name: 'One' },
    ]);
    expect(result.hbinDefs).toEqual([{ bin: 1, name: 'One' }, { bin: 3, name: 'Three' }]);
  });
});
