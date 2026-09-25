import { describe, it, expect } from 'vitest';
import { parseTestListFile, formatTestListCsv, resolveLoadedTestList, matchTestRange } from './testSelectorUI';
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
    const text = 'type,num,hi_limit,lo_limit,name\nP,1001,3.0,1.0,Vdd Test';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, name: 'Vdd Test', loLimit: 1.0, hiLimit: 3.0, testType: 'P' },
    ]);
  });

  it('parses a header with only a subset of columns (no name)', () => {
    const text = 'num,lo_limit,hi_limit\n1001,1.0,3.0\n1002,,5.0';
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, loLimit: 1.0, hiLimit: 3.0 },
      { num: 1002, hiLimit: 5.0 },
    ]);
  });

  it('matches header aliases case-insensitively and with separators', () => {
    const text = 'NUM,Lo Limit,HI-LIMIT,TYPE\n1001,1.0,3.0,f';
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
      'num,lo_limit,hi_limit',
      '1001,1.0,3.0',
      'num,name',
      '1002,Idd',
    ].join('\n');
    expect(parseTestListFile(text)).toEqual([
      { num: 1001, loLimit: 1.0, hiLimit: 3.0 },
      { num: 1002, name: 'Idd' },
    ]);
  });

  // ── Test limits and spec limits: two families, never paired across ───────────

  it('reads LSL/USL as spec limits, and says so', () => {
    const notes: string[] = [];
    const text = 'num,lsl,usl\n1001,1.0,3.0';
    expect(parseTestListFile(text, undefined, m => notes.push(m))).toEqual([{ num: 1001, loSpec: 1.0, hiSpec: 3.0 }]);
    expect(notes.some(n => /LSL\/USL columns were read as spec limits/.test(n))).toBe(true);
  });

  it('reads every spec-limit spelling, and keeps each family to its own pair', () => {
    for (const [lo, hi] of [['lo_spec', 'hi_spec'], ['Spec Low', 'Spec High'], ['lower_spec', 'upper_spec'], ['min_spec', 'max_spec']]) {
      expect(parseTestListFile(`num,${lo},${hi}\n1001,1,3`)).toEqual([{ num: 1001, loSpec: 1, hiSpec: 3 }]);
    }
    // One spec limit and one test limit: two one-sided limits, not a pair.
    expect(parseTestListFile('num,lsl,hi_limit\n1001,1,3')).toEqual([{ num: 1001, loSpec: 1, hiLimit: 3 }]);
  });

  it('reads neither of two columns naming the same limit', () => {
    const notes: string[] = [];
    const rows = parseTestListFile('num,lsl,spec_lo,usl\n1001,1,2,3', undefined, m => notes.push(m));
    expect(rows).toEqual([{ num: 1001, hiSpec: 3 }]);
    expect(notes.some(n => /"lsl" and "spec_lo" both name the low spec limit/.test(n))).toBe(true);
  });

  it('ignores a limit column that does not say which family, and says so', () => {
    const notes: string[] = [];
    const rows = parseTestListFile('num,min,max\n1001,1,3', undefined, m => notes.push(m));
    expect(rows).toEqual([{ num: 1001 }]);
    expect(notes.filter(n => /does not say whether it is a test limit or a spec limit/.test(n))).toHaveLength(2);
  });

  it('drops an inverted pair but keeps the other family', () => {
    const warnings: string[] = [];
    const rows = parseTestListFile('num,lo_limit,hi_limit,lsl,usl\n1001,5,1,2,4', m => warnings.push(String(m)), () => {});
    expect(rows).toEqual([{ num: 1001, loSpec: 2, hiSpec: 4 }]);
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

  it('reports a column the header names but ignores once, not on every row', () => {
    const warnings: string[] = [];
    const notes: string[] = [];
    const text = 'num,comment,lsl,spec_lo,max\n1001,a,1,2,3\n1002,b,1,2,3';
    const result = parseTestListFile(text, (_line, msg) => warnings.push(msg), m => notes.push(m));
    expect(result).toEqual([{ num: 1001 }, { num: 1002 }]);
    expect(warnings).toEqual(['Unrecognized column "comment" ignored']);
    expect(notes.filter(n => n.includes('"lsl" and "spec_lo"'))).toHaveLength(1);
    expect(notes.filter(n => n.includes('"max"'))).toHaveLength(1);
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

  it('quotes commas in name/units on save, so they round-trip exactly', () => {
    const entries = [{ num: 1001, name: 'Vdd, Core', units: 'mA, RMS' }];
    const csv = formatTestListCsv(entries);
    expect(csv).toContain('1001,"Vdd, Core",,,,,"mA, RMS",,');
    expect(parseTestListFile(csv)).toEqual(entries);
  });

  it('writes the canonical header, expression last', () => {
    const csv = formatTestListCsv([{ num: 1001, name: 'Vdd' }]);
    expect(csv).toContain('num,name,loLimit,hiLimit,loSpec,hiSpec,units,testType,expression');
  });

  it('round-trips spec limits separately from test limits', () => {
    const entries = [{ num: 1001, name: 'Vth', loLimit: 0.2, hiLimit: 0.4, loSpec: 0.25, hiSpec: 0.35, units: 'V', testType: 'P' as const }];
    expect(parseTestListFile(formatTestListCsv(entries))).toEqual(entries);
  });

  it('round-trips a derived test, quoting an expression only when it has a comma', () => {
    const entries = [
      { num: 900001, name: 'Shift', units: 'uA', testType: 'P' as const, hiLimit: 5, expression: 'abs(t[1020] - t[1010])' },
      { num: 900002, name: 'Guarded', expression: 'log10(t[1] / max(t[2], 0.01))' },
      { num: 900003, name: 'Quoted', expression: 'if(t[1] > 0, 1, 2) + "x"' },
    ];
    const csv = formatTestListCsv(entries);
    expect(csv).toContain(',abs(t[1020] - t[1010])');
    expect(csv).toContain(',"log10(t[1] / max(t[2], 0.01))"');
    expect(parseTestListFile(csv)).toEqual(entries);
  });
});

// ── Derived tests: the expression column ───────────────────────────────────────
// An expression contains commas. As the last column it reads the same whether
// or not it was quoted — a hand-edited file that forgot the quotes still loads.

describe('parseTestListFile — expression column', () => {
  const HEADER = 'num,name,loLimit,hiLimit,units,testType,expression';

  it('reads an unquoted expression with commas as one cell', () => {
    const [row] = parseTestListFile(`${HEADER}\n900001,Ratio,,,,P,max(t[1], t[2]) / min(t[3],t[4])`);
    expect(row).toEqual({ num: 900001, name: 'Ratio', testType: 'P', expression: 'max(t[1], t[2]) / min(t[3],t[4])' });
  });

  it('reads the same expression quoted, as Excel writes it', () => {
    const [row] = parseTestListFile(`${HEADER}\n900001,Ratio,,,,P,"max(t[1], t[2]) / min(t[3],t[4])"`);
    expect(row.expression).toBe('max(t[1], t[2]) / min(t[3],t[4])');
  });

  it('a row with a blank expression is an ordinary test row', () => {
    const [row] = parseTestListFile(`${HEADER}\n1001,Vdd,1,2,V,P,`);
    expect(row).toEqual({ num: 1001, name: 'Vdd', loLimit: 1, hiLimit: 2, units: 'V', testType: 'P' });
  });

  it('accepts the "Derived from" header wmap exports use', () => {
    const [row] = parseTestListFile('num,name,Derived from\n900001,Sum,t[1] + t[2]');
    expect(row.expression).toBe('t[1] + t[2]');
  });

  it('ignores an expression column that is not last, and says so', () => {
    const warnings: string[] = [];
    const rows = parseTestListFile('num,expression,name\n900001,t[1],Oops', (_n, m) => warnings.push(m));
    expect(rows[0].expression).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/must be the last column/);
  });

  it('never reads an expression from a header-less file', () => {
    const warnings: string[] = [];
    const [row] = parseTestListFile('1001,Vdd,1,2,V,P,t[1]', (_n, m) => warnings.push(m));
    expect(row.expression).toBeUndefined();
    expect(warnings.length).toBe(1);
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

describe('matchTestRange', () => {
  // Test order, not numeric order — name ranges walk list position, so the
  // fixture has to be able to tell the two apart.
  const E = [
    { num: 1001, def: { name: 'vth_n_mV' } },
    { num: 1002, def: { name: 'vth_p_mV' } },
    { num: 1050, def: { name: 'idsat_n_uA' } },
    { num: 1051, def: { name: 'idsat_p_uA' } },
    { num: 2000, def: { name: 'cont_check' } },
  ];
  const got = (s: string) => [...matchTestRange(s, E)].sort((a, b) => a - b);

  it('matches a numeric range inclusively at both ends', () => {
    expect(got('1001-1050')).toEqual([1001, 1002, 1050]);
  });

  it('matches a single test number', () => {
    expect(got('1050')).toEqual([1050]);
  });

  it('ignores a number no test has', () => {
    expect(got('9999')).toEqual([]);
  });

  it('matches a bare name by prefix', () => {
    expect(got('vth')).toEqual([1001, 1002]);
  });

  it('splits a name range on the last dash, not the first', () => {
    // The whole reason for the last-dash rule: these names contain dashes'
    // moral equivalent (underscores) but a naive first-dash split on a name
    // like "a-b - c-d" would take the wrong halves.
    expect(got('vth_n_mV-idsat_n_uA')).toEqual([1001, 1002, 1050]);
  });

  it('prefers an explicit spaced dash over the last-dash fallback', () => {
    expect(got('vth_n_mV - idsat_p_uA')).toEqual([1001, 1002, 1050, 1051]);
  });

  it('takes a name range by list position, not alphabetically', () => {
    // Alphabetically cont_check sorts before idsat/vth; by position it is last.
    expect(got('idsat_n_uA - cont_check')).toEqual([1050, 1051, 2000]);
  });

  it('unions comma-separated segments', () => {
    expect(got('1001, 2000')).toEqual([1001, 2000]);
  });

  it('mixes ranges and singles across segments, de-duplicating', () => {
    expect(got('1001-1002, 1002, cont_check')).toEqual([1001, 1002, 2000]);
  });

  it('returns nothing for an empty or whitespace expression', () => {
    expect(got('')).toEqual([]);
    expect(got('   ,  , ')).toEqual([]);
  });

  it('returns nothing when a name range resolves backwards', () => {
    // last-before-first: no sensible span, so select nothing rather than guess.
    expect(got('cont_check - vth_n_mV')).toEqual([]);
  });

  it('is case-insensitive on names', () => {
    expect(got('VTH_N_MV')).toEqual([1001]);
  });

  it('matches over ALL entries, leaving filter scoping to the caller', () => {
    // The selector intersects this with what the search/type filter shows. The
    // matcher itself must stay filter-blind, or the caller cannot tell "matches
    // nothing" from "matches, but hidden" — which is the distinction the
    // dialog's inline message depends on.
    expect(got('1001-2000')).toEqual([1001, 1002, 1050, 1051, 2000]);
  });
});

describe('derived tests meeting a lot that measures their number', () => {
  it('the measured test wins: the derived one is split out and named in the warning', async () => {
    const { splitDerivedByClash, derivedClashMessage } = await import('./testSelectorUI');
    const derived = [
      { num: 900001, name: 'Leakage shift', expression: 'abs(t[1020] - t[1010])' },
      { num: 900002, name: 'Ratio', expression: 't[1010] / t[1020]' },
    ] as Parameters<typeof splitDerivedByClash>[0];
    const measured = { '900001': { name: 'Real 900001' }, '1010': {}, '1020': {} };
    const { kept, clashing } = splitDerivedByClash(derived, measured);
    expect(kept.map(d => d.num)).toEqual([900002]);
    expect(clashing.map(d => d.num)).toEqual([900001]);
    expect(derivedClashMessage(clashing)).toBe("1 derived test ignored — 900001 is already a measured test's number; give it an unused number");
  });
});
