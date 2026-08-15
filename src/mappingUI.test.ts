import { describe, it, expect } from 'vitest';
import { tokenize, detectRole, validateRoleAssignments, isTypeMismatch } from './mappingUI';

const noSample: Record<string, string>[] = [];
const numericSample = (col: string, val = '1.5'): Record<string, string>[] => [{ [col]: val }];

// ── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits snake_case', () => expect(tokenize('die_x')).toEqual(['die', 'x']));
  it('splits camelCase', () => expect(tokenize('waferIndex')).toEqual(['wafer', 'index']));
  it('splits PascalCase', () => expect(tokenize('WaferID')).toEqual(['wafer', 'id']));
  it('splits dash-case', () => expect(tokenize('hard-bin')).toEqual(['hard', 'bin']));
  it('lowercases all tokens', () => expect(tokenize('HardBin')).toEqual(['hard', 'bin']));
  it('filters empty tokens', () => expect(tokenize('_x_')).toEqual(['x']));
});

// ── detectRole ────────────────────────────────────────────────────────────────

describe('detectRole — x/y', () => {
  it.each(['x', 'die_x', 'xloc', 'col', 'column', 'step_x'])('detects x: %s', col => {
    expect(detectRole(col, noSample)).toBe('x');
  });
  it.each(['y', 'die_y', 'yloc', 'row', 'step_y'])('detects y: %s', col => {
    expect(detectRole(col, noSample)).toBe('y');
  });
});

describe('detectRole — bins', () => {
  it.each(['hbin', 'hard_bin', 'bin', 'hardbin'])('detects hbin: %s', col => {
    expect(detectRole(col, noSample)).toBe('hbin');
  });
  it.each(['sbin', 'soft_bin', 'softbin'])('detects sbin: %s', col => {
    expect(detectRole(col, noSample)).toBe('sbin');
  });
});

describe('detectRole — wafer / lot', () => {
  it.each(['wafer', 'wafer_id', 'wfr_id', 'wafernum'])('detects wafer: %s', col => {
    expect(detectRole(col, noSample)).toBe('wafer');
  });
  it.each(['lot', 'lot_id', 'lotid'])('detects lot: %s', col => {
    expect(detectRole(col, noSample)).toBe('lot');
  });
});

describe('detectRole — limits / units', () => {
  it.each(['lo_limit', 'low_limit', 'lsl', 'min_limit'])('detects loLimit: %s', col => {
    expect(detectRole(col, noSample)).toBe('loLimit');
  });
  it.each(['hi_limit', 'high_limit', 'usl', 'max_limit'])('detects hiLimit: %s', col => {
    expect(detectRole(col, noSample)).toBe('hiLimit');
  });
  it.each(['units', 'unit', 'uom'])('detects units: %s', col => {
    expect(detectRole(col, noSample)).toBe('units');
  });
});

describe('detectRole — long-format identity/value columns', () => {
  // `test_val` is the real-world regression: correlated_long.csv (a bundled
  // fixture) uses this exact header, which matched no EXACT_ROLES pattern
  // (only `test_value`/`val`/`meas_val` were listed, not this compound) and
  // fell through to the numeric-fallback heuristic, classifying it as a
  // single WIDE-format "Test value" column. With testvalueCol then unset, the
  // whole file parsed as one bogus wide test instead of ~30 long-format ones
  // — no error, no warning, just silently wrong.
  it.each(['test_val', 'test_value', 'testval', 'testvalue', 'result_val', 'meas_val'])(
    'detects testvalue: %s', col => {
      expect(detectRole(col, numericSample(col))).toBe('testvalue');
    });
  it.each(['test_name', 'testname', 'param', 'test_item'])('detects testname: %s', col => {
    expect(detectRole(col, noSample)).toBe('testname');
  });
  // A column literally holding the test's real number (not its name) — e.g.
  // "testno"/"test number" — used to fall through to the testname pattern
  // (test_num/tnum were listed there), silently discarding the real number in
  // favour of a hashed one. Own role now, own patterns.
  it.each(['test_num', 'testnum', 'tnum', 'test_number', 'testnumber', 'testno', 'test_no'])(
    'detects testnumber: %s', col => {
      expect(detectRole(col, noSample)).toBe('testnumber');
    });
});

describe('detectRole — test vs metadata fallback', () => {
  it('classifies numeric column as test', () => {
    expect(detectRole('leakage_current', numericSample('leakage_current'))).toBe('test');
  });
  it('classifies non-numeric column as metadata', () => {
    expect(detectRole('device', [{ device: 'ASIC-42' }])).toBe('metadata');
  });
  it('classifies numeric column with NON_TEST_TOKEN as metadata', () => {
    // 'seq' is a NON_TEST_TOKEN with no dedicated role → metadata fallback.
    // (site/site_id now resolve to the dedicated 'site' role — see below.)
    expect(detectRole('seq', numericSample('seq'))).toBe('metadata');
  });
  it('classifies a site column as the dedicated site role', () => {
    expect(detectRole('site', numericSample('site'))).toBe('site');
    expect(detectRole('site_num', numericSample('site_num'))).toBe('site');
  });
  it('classifies empty-sample numeric-looking column as metadata', () => {
    // No sample data — cannot confirm numeric
    expect(detectRole('mystery', noSample)).toBe('metadata');
  });
});

// ── validateRoleAssignments ───────────────────────────────────────────────────
// readMapping fills the single-valued roles by plain overwrite in DOM order, so
// without this guard a second column claiming the same role silently discards
// the first — and the resulting map looks perfectly plausible, just built from
// the wrong column.

describe('validateRoleAssignments', () => {
  it('accepts a well-formed assignment', () => {
    expect(validateRoleAssignments([
      { col: 'x', role: 'x' },
      { col: 'y', role: 'y' },
      { col: 'hbin', role: 'hbin' },
      { col: 'wafer_id', role: 'wafer' },
    ])).toBeNull();
  });

  it('accepts many columns in the genuinely repeatable roles', () => {
    expect(validateRoleAssignments([
      { col: 'x', role: 'x' },
      { col: 'y', role: 'y' },
      { col: 't1', role: 'test' },
      { col: 't2', role: 'test' },
      { col: 't3', role: 'test' },
      { col: 'operator', role: 'metadata' },
      { col: 'tester', role: 'metadata' },
      { col: 'spare1', role: '' },
      { col: 'spare2', role: '' },
    ])).toBeNull();
  });

  it('rejects two columns claiming the same single-valued role', () => {
    const msg = validateRoleAssignments([
      { col: 'wafer_id', role: 'wafer' },
      { col: 'wafer_num', role: 'wafer' },
    ]);
    expect(msg).toContain('Wafer ID');
    expect(msg).toContain('wafer_id');
    expect(msg).toContain('wafer_num');
  });

  it('names every clash, not just the first', () => {
    const msg = validateRoleAssignments([
      { col: 'x1', role: 'x' },
      { col: 'x2', role: 'x' },
      { col: 'b1', role: 'hbin' },
      { col: 'b2', role: 'hbin' },
    ])!;
    expect(msg).toContain('X position');
    expect(msg).toContain('Hard bin');
  });

  it('lists all offending columns when three share a role', () => {
    const msg = validateRoleAssignments([
      { col: 'a', role: 'y' },
      { col: 'b', role: 'y' },
      { col: 'c', role: 'y' },
    ])!;
    for (const col of ['a', 'b', 'c']) expect(msg).toContain(col);
  });

  it('uses the label the picker shows, not the internal role key', () => {
    const msg = validateRoleAssignments([
      { col: 'p', role: 'loLimit' },
      { col: 'q', role: 'loLimit' },
    ])!;
    expect(msg).toContain('Low limit (long format)');
  });

  it('accepts an empty assignment list', () => {
    expect(validateRoleAssignments([])).toBeNull();
  });
});

// ── isTypeMismatch ────────────────────────────────────────────────────────────

describe('isTypeMismatch', () => {
  it('flags a numeric-only role mapped to a string-typed column', () => {
    expect(isTypeMismatch('x', 'string')).toBe(true);
    expect(isTypeMismatch('testvalue', 'string')).toBe(true);
    expect(isTypeMismatch('testnumber', 'string')).toBe(true);
  });
  it('does not flag a numeric-only role mapped to a number/bool column', () => {
    expect(isTypeMismatch('x', 'number')).toBe(false);
    expect(isTypeMismatch('x', 'bool')).toBe(false);
  });
  it('does not flag when colType is undefined (CSV/JSON — untyped)', () => {
    expect(isTypeMismatch('x', undefined)).toBe(false);
  });
  it('does not flag a non-numeric role regardless of type', () => {
    expect(isTypeMismatch('wafer', 'string')).toBe(false);
    expect(isTypeMismatch('metadata', 'string')).toBe(false);
  });
});
