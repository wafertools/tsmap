// The optional `color` column of a bin definitions file. Kept apart from
// binDefs.test.ts so the name/pass cases there stay about names and passes.

import { describe, it, expect } from 'vitest';
import { parseBinDefsFile, formatBinDefsCsv, applyBinDefOverrides } from './binDefs';
import { mergeBinDefs } from './lib';

describe('bin definition colours', () => {
  it('reads a color column, normalising #rgb and case to #rrggbb', () => {
    const entries = parseBinDefsFile('bin,name,color\n1,Pass,#2CA02C\n2,Open,#f00\n3,Short,1f77b4\n');
    expect(entries.map(e => e.color)).toEqual(['#2ca02c', '#ff0000', '#1f77b4']);
  });

  it('accepts colour spellings in the header', () => {
    expect(parseBinDefsFile('bin,colour\n1,#123456\n')[0].color).toBe('#123456');
    expect(parseBinDefsFile('hbin,bin colour\n1,#123456\n')[0].color).toBe('#123456');
  });

  it('drops an invalid colour with a warning and keeps the rest of the row', () => {
    const warnings: string[] = [];
    const [e] = parseBinDefsFile('bin,name,color\n2,Open,gren\n', (_l, m) => warnings.push(m));
    expect(e).toMatchObject({ bin: 2, name: 'Open', color: undefined });
    expect(warnings[0]).toMatch(/Invalid colour "gren"/);
  });

  it('round-trips through formatBinDefsCsv', () => {
    const entries = [
      { bin: 1, type: 'hard' as const, name: 'Pass', pass: true, color: '#2ca02c' },
      { bin: 10, type: 'soft' as const, name: 'Leak', pass: false },
    ];
    expect(parseBinDefsFile(formatBinDefsCsv(entries))).toEqual(entries);
  });

  it('applyBinDefOverrides carries colours onto the BinDefs wmap reads', () => {
    const merged = applyBinDefOverrides(
      { hbinDefs: [{ bin: 2, name: 'Contact Open' }] },
      parseBinDefsFile('bin,color\n2,#d62728\n'),
    );
    // A colour-only row keeps the existing name rather than blanking it.
    expect(merged.hbinDefs).toEqual([{ bin: 2, name: 'Contact Open', color: '#d62728' }]);
  });

  it('a blank colour cell leaves an existing colour alone', () => {
    const merged = applyBinDefOverrides(
      { hbinDefs: [{ bin: 2, name: 'Open', color: '#d62728' }] },
      parseBinDefsFile('bin,name,color\n2,Contact Open,\n'),
    );
    expect(merged.hbinDefs).toEqual([{ bin: 2, name: 'Contact Open', color: '#d62728' }]);
  });

  it('mergeBinDefs keeps a colour when a later file names the bin without one', () => {
    const merged = mergeBinDefs([
      [{ bin: 2, name: 'Open', color: '#d62728' }],
      [{ bin: 2, name: 'Contact Open' }],   // e.g. a second file's HBR record
    ]);
    expect(merged).toEqual([{ bin: 2, name: 'Contact Open', color: '#d62728' }]);
  });
});
