import { describe, it, expect } from 'vitest';
import { parseTestListFile, formatTestListCsv, resolveLoadedTestList } from './testSelectorUI';
import type { TestListEntry } from './testSelectorUI';
import type { TestDef } from './types';

describe('parseTestListFile', () => {
  it('parses comma-separated number and name', () => {
    const result = parseTestListFile('1001,Continuity\n1002,Voltage');
    expect(result).toEqual([
      { num: 1001, name: 'Continuity' },
      { num: 1002, name: 'Voltage' },
    ]);
  });

  it('parses semicolon separator', () => {
    const result = parseTestListFile('1001;Continuity');
    expect(result).toEqual([{ num: 1001, name: 'Continuity' }]);
  });

  it('parses space separator', () => {
    const result = parseTestListFile('1001 Continuity');
    expect(result).toEqual([{ num: 1001, name: 'Continuity' }]);
  });

  it('parses number-only lines (no name)', () => {
    const result = parseTestListFile('1001\n1002');
    expect(result).toEqual([
      { num: 1001, name: undefined },
      { num: 1002, name: undefined },
    ]);
  });

  it('skips comment lines starting with #', () => {
    const text = '# tsmap test list\n# Saved: 2026-01-01\n1001,Foo';
    const result = parseTestListFile(text);
    expect(result).toEqual([{ num: 1001, name: 'Foo' }]);
  });

  it('skips blank lines', () => {
    const result = parseTestListFile('\n1001,A\n\n1002,B\n');
    expect(result).toHaveLength(2);
  });

  it('skips non-numeric first token with no recognizable header alias', () => {
    const result = parseTestListFile('not_a_number,Foo\n1001,Bar');
    expect(result).toEqual([{ num: 1001, name: 'Bar' }]);
  });

  it('handles names with spaces (space-separated becomes joined)', () => {
    const result = parseTestListFile('1001,My First Test');
    expect(result[0].name).toBe('My First Test');
  });

  it('trims whitespace from lines', () => {
    const result = parseTestListFile('  1001  ,  Foo  ');
    expect(result[0].num).toBe(1001);
  });

  it('returns empty array for empty input', () => {
    expect(parseTestListFile('')).toEqual([]);
    expect(parseTestListFile('# comment only')).toEqual([]);
  });

  it('parses the tsmap saved format', () => {
    const saved = [
      '# tsmap test list',
      '# Saved: 2026-06-09T06:26:25.547Z',
      '1001,My first test',
      '1002,My second test',
    ].join('\n');
    const result = parseTestListFile(saved);
    expect(result).toEqual([
      { num: 1001, name: 'My first test' },
      { num: 1002, name: 'My second test' },
    ]);
  });

  // ── Headerless positional columns (default order) ──────────────────────────

  it('parses a headerless 3-column row (loLimit)', () => {
    const result = parseTestListFile('1001,Vdd,1.0');
    expect(result).toEqual([{ num: 1001, name: 'Vdd', loLimit: 1.0 }]);
  });

  it('parses a headerless 4-column row (loLimit, hiLimit)', () => {
    const result = parseTestListFile('1001,Vdd,1.0,3.0');
    expect(result).toEqual([{ num: 1001, name: 'Vdd', loLimit: 1.0, hiLimit: 3.0 }]);
  });

  it('parses a headerless 5-column row (units)', () => {
    const result = parseTestListFile('1001,Vdd,1.0,3.0,V');
    expect(result).toEqual([{ num: 1001, name: 'Vdd', loLimit: 1.0, hiLimit: 3.0, units: 'V' }]);
  });

  it('parses a headerless 6-column row (testType)', () => {
    const result = parseTestListFile('1001,Vdd,1.0,3.0,V,P');
    expect(result).toEqual([{ num: 1001, name: 'Vdd', loLimit: 1.0, hiLimit: 3.0, units: 'V', testType: 'P' }]);
  });

  it('leaves trailing columns absent as undefined, not zero/empty', () => {
    const result = parseTestListFile('1001,Vdd,,,V');
    expect(result[0].loLimit).toBeUndefined();
    expect(result[0].hiLimit).toBeUndefined();
    expect(result[0].units).toBe('V');
  });

  // ── Header-driven columns ───────────────────────────────────────────────────

  it('parses the canonical header in default order', () => {
    const text = 'num,name,loLimit,hiLimit,units,testType\n1001,Vdd,1.0,3.0,V,P';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, name: 'Vdd', loLimit: 1.0, hiLimit: 3.0, units: 'V', testType: 'P' },
    ]);
  });

  it('parses a header with columns in a non-default order', () => {
    const text = 'type,num,usl,lsl,name\nP,1001,3.0,1.0,Vdd Test';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, name: 'Vdd Test', loLimit: 1.0, hiLimit: 3.0, testType: 'P' },
    ]);
  });

  it('parses a header with only a subset of columns (no name)', () => {
    const text = 'num,lsl,usl\n1001,1.0,3.0\n1002,,5.0';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, loLimit: 1.0, hiLimit: 3.0 },
      { num: 1002, hiLimit: 5.0 },
    ]);
  });

  it('matches header aliases case-insensitively and with separators', () => {
    const text = 'NUM,LSL,USL,TYPE\n1001,1.0,3.0,f';
    expect(parseTestListFile(text)).toEqual([{ num: 1001, loLimit: 1.0, hiLimit: 3.0, testType: 'F' }]);
  });

  it('matches Lo_Limit / lo-limit / Hi Limit style aliases', () => {
    const text = 'num,Lo_Limit,Hi Limit\n1001,1.0,3.0';
    expect(parseTestListFile(text)).toEqual([{ num: 1001, loLimit: 1.0, hiLimit: 3.0 }]);
  });

  it('warns on an unrecognized header column but keeps the recognized ones', () => {
    const warnings: string[] = [];
    const text = 'num,name,foo\n1001,Vdd,bar';
    const result = parseTestListFile(text, (_line, msg) => warnings.push(msg));
    expect(result).toEqual([{ num: 1001, name: 'Vdd' }]);
    expect(warnings.some(w => w.includes('foo'))).toBe(true);
  });

  it('a later header line resets the active column mapping', () => {
    const text = [
      'num,lsl,usl',
      '1001,1.0,3.0',
      'num,name',
      '1002,Idd',
    ].join('\n');
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, loLimit: 1.0, hiLimit: 3.0 },
      { num: 1002, name: 'Idd' },
    ]);
  });

  // ── Value edge cases ─────────────────────────────────────────────────────────

  it('parses negative and scientific-notation limits', () => {
    const result = parseTestListFile('1001,Vdd,-3.3,1e-6');
    expect(result[0].loLimit).toBe(-3.3);
    expect(result[0].hiLimit).toBe(1e-6);
  });

  it('parses an explicit 0 limit (not treated as blank)', () => {
    const result = parseTestListFile('1001,Vdd,0,0');
    expect(result[0].loLimit).toBe(0);
    expect(result[0].hiLimit).toBe(0);
  });

  it('drops an invalid numeric field but keeps the rest of the row, with a warning', () => {
    const warnings: string[] = [];
    const result = parseTestListFile('1001,Vdd,garbage,3.0', (_line, msg) => warnings.push(msg));
    expect(result).toEqual([{ num: 1001, name: 'Vdd', hiLimit: 3.0 }]);
    expect(warnings.some(w => w.includes('loLimit'))).toBe(true);
  });

  it('accepts p/P/f/F test type, normalized to uppercase', () => {
    const text = 'num,name,loLimit,hiLimit,units,testType\n1001,A,,,,p\n1002,B,,,,F';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, name: 'A', testType: 'P' },
      { num: 1002, name: 'B', testType: 'F' },
    ]);
  });

  it('drops an invalid test type value, with a warning, but keeps the rest of the row', () => {
    const warnings: string[] = [];
    const text = 'num,name,loLimit,hiLimit,units,testType\n1001,A,,,,X';
    const result = parseTestListFile(text, (_line, msg) => warnings.push(msg));
    expect(result).toEqual([{ num: 1001, name: 'A' }]);
    expect(warnings.some(w => w.toLowerCase().includes('test type'))).toBe(true);
  });

  it('warns on and ignores columns beyond the active (header-narrowed) mapping', () => {
    const warnings: string[] = [];
    const text = 'num,name\n1001,Vdd,extra,stuff';
    const result = parseTestListFile(text, (_line, msg) => warnings.push(msg));
    expect(result).toEqual([{ num: 1001, name: 'Vdd' }]);
    expect(warnings.filter(w => w.includes('extra column')).length).toBe(2);
  });

  it('does not throw on garbage input', () => {
    expect(() => parseTestListFile('\0,,,\ngarbage\n,,,,,,,,\n1001,,,,,,,,')).not.toThrow();
  });
});

describe('formatTestListCsv / parseTestListFile round-trip', () => {
  it('round-trips a full entry', () => {
    const entries = [{ num: 1001, name: 'Vdd', loLimit: -3.3, hiLimit: 3.3, units: 'V', testType: 'P' as const }];
    const csv = formatTestListCsv(entries);
    expect(parseTestListFile(csv)).toEqual(entries);
  });

  it('round-trips a name-only entry (blank limit columns stay undefined)', () => {
    const entries = [{ num: 1001, name: 'Vdd' }];
    const csv = formatTestListCsv(entries);
    expect(parseTestListFile(csv)).toEqual(entries);
  });

  it('sanitizes commas in name/units on save rather than corrupting columns', () => {
    const entries = [{ num: 1001, name: 'Vdd, Core', units: 'mA, RMS' }];
    const csv = formatTestListCsv(entries);
    const result = parseTestListFile(csv);
    expect(result).toEqual([{ num: 1001, name: 'Vdd  Core', units: 'mA  RMS' }]);
  });

  it('writes the canonical header', () => {
    const csv = formatTestListCsv([{ num: 1001, name: 'Vdd' }]);
    expect(csv).toContain('num,name,loLimit,hiLimit,units,testType');
  });
});

// ── resolveLoadedTestList ──────────────────────────────────────────────────────
// The mechanism that lets a saved test list survive a stale test number:
// match by number first, fall back to an exact name match when the number
// isn't in the current scan, and never silently guess when a name matches
// more than one current test.

function defs(pairs: Array<[number, string]>): Record<string, TestDef> {
  const out: Record<string, TestDef> = {};
  for (const [num, name] of pairs) out[String(num)] = { name, testType: 'P' };
  return out;
}

function names(pairs: Array<[number, string]>): Map<number, string> {
  return new Map(pairs);
}

describe('resolveLoadedTestList', () => {
  it('matches a row whose number is still current', () => {
    const parsed: TestListEntry[] = [{ num: 5, name: 'Vt' }];
    const result = resolveLoadedTestList(parsed, defs([[5, 'Vt']]), names([[5, 'Vt']]), new Map());
    expect(result.selectedNums).toEqual([5]);
    expect(result.unknownCount).toBe(0);
    expect(result.recoveredByNameCount).toBe(0);
  });

  it('recovers a stale number by exact name match', () => {
    // Row was saved under the OLD number (5); the current scan now has the
    // same test named "Vt" under a different number (3182004981-ish).
    const parsed: TestListEntry[] = [{ num: 5, name: 'Vt' }];
    const current = names([[1_500_001, 'Vt']]);
    const result = resolveLoadedTestList(parsed, defs([[1_500_001, 'Vt']]), current, new Map());
    expect(result.selectedNums).toEqual([1_500_001]);
    expect(result.recoveredByNameCount).toBe(1);
    expect(result.unknownCount).toBe(0);
  });

  it('does not guess when a name matches more than one current test', () => {
    const parsed: TestListEntry[] = [{ num: 5, name: 'Vt' }];
    const current = names([[10, 'Vt'], [20, 'Vt']]); // two different tests, same display name
    const result = resolveLoadedTestList(parsed, defs([[10, 'Vt'], [20, 'Vt']]), current, new Map());
    expect(result.selectedNums).toEqual([]);
    expect(result.ambiguousCount).toBe(1);
    expect(result.unknownCount).toBe(0);
  });

  it('reports unknown when neither number nor name matches', () => {
    const parsed: TestListEntry[] = [{ num: 5, name: 'Gone' }];
    const result = resolveLoadedTestList(parsed, defs([[10, 'Vt']]), names([[10, 'Vt']]), new Map());
    expect(result.selectedNums).toEqual([]);
    expect(result.unknownCount).toBe(1);
    expect(result.recoveredByNameCount).toBe(0);
  });

  it('reports unknown (not a crash) when a stale row carries no name to fall back on', () => {
    const parsed: TestListEntry[] = [{ num: 5 }]; // legacy num-only file
    const result = resolveLoadedTestList(parsed, defs([[10, 'Vt']]), names([[10, 'Vt']]), new Map());
    expect(result.unknownCount).toBe(1);
  });

  it('stores the recovered override under the CURRENT number, not the stale one', () => {
    // The row's name is both the fallback lookup key and the override value,
    // so recovery only works when it matches the test's current display name
    // — the ordinary case when a list is saved, then reloaded unchanged.
    const parsed: TestListEntry[] = [{ num: 5, name: 'Vt' }];
    const current = names([[1_500_001, 'Vt']]);
    const result = resolveLoadedTestList(parsed, defs([[1_500_001, 'Vt']]), current, new Map());
    expect(result.overrides.get(1_500_001)?.name).toBe('Vt');
    expect(result.overrides.has(5)).toBe(false);
  });

  it('carries a non-name override (e.g. a limit) through a name-based recovery', () => {
    const parsed: TestListEntry[] = [{ num: 5, name: 'Vt', loLimit: -3.3 }];
    const current = names([[1_500_001, 'Vt']]);
    const result = resolveLoadedTestList(parsed, defs([[1_500_001, 'Vt']]), current, new Map());
    expect(result.overrides.get(1_500_001)?.loLimit).toBe(-3.3);
  });

  it('preserves an existing override not touched by the loaded row', () => {
    const parsed: TestListEntry[] = [{ num: 5, loLimit: -1 }];
    const existing = new Map([[5, { units: 'mA' }]]);
    const result = resolveLoadedTestList(parsed, defs([[5, 'Vt']]), names([[5, 'Vt']]), existing);
    expect(result.overrides.get(5)).toEqual({ units: 'mA', loLimit: -1 });
  });

  it('drops limits on a row whose effective type is functional', () => {
    const parsed: TestListEntry[] = [{ num: 5, loLimit: 1, hiLimit: 2 }];
    const functionalDefs: Record<string, TestDef> = { '5': { name: 'scan', testType: 'F' } };
    const result = resolveLoadedTestList(parsed, functionalDefs, names([[5, 'scan']]), new Map());
    expect(result.limitOnFunctionalCount).toBe(1);
    expect(result.overrides.get(5)?.loLimit).toBeUndefined();
  });

  it('resolves multiple rows independently in one call', () => {
    const parsed: TestListEntry[] = [
      { num: 1, name: 'A' },   // still current
      { num: 2, name: 'B' },   // stale, recoverable by name
      { num: 3, name: 'Gone' }, // unknown
    ];
    const current = names([[1, 'A'], [99, 'B']]);
    const result = resolveLoadedTestList(parsed, defs([[1, 'A'], [99, 'B']]), current, new Map());
    expect(result.selectedNums.sort((a, b) => a - b)).toEqual([1, 99]);
    expect(result.recoveredByNameCount).toBe(1);
    expect(result.unknownCount).toBe(1);
  });
});
