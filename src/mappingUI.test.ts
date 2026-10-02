import { describe, it, expect } from 'vitest';
import { tokenize, detectRole, detectRoles, skipReason, validateRoleAssignments, isTypeMismatch, validateXYAssignment } from './mappingUI';

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
  it.each(['x', 'die_x', 'xloc', 'col', 'column', 'step_x', 'chip_x', 'chipx', 'position_x', 'positionx'])('detects x: %s', col => {
    expect(detectRole(col, noSample)).toBe('x');
  });
  it.each(['y', 'die_y', 'yloc', 'row', 'step_y', 'chip_y', 'chipy', 'position_y', 'positiony'])('detects y: %s', col => {
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
  it.each(['lo_limit', 'low_limit', 'min_limit', 'Lower Limit', 'LL'])('detects loLimit: %s', col => {
    expect(detectRole(col, noSample)).toBe('loLimit');
  });
  it.each(['hi_limit', 'high_limit', 'max_limit', 'Upper Limit', 'UL'])('detects hiLimit: %s', col => {
    expect(detectRole(col, noSample)).toBe('hiLimit');
  });
  // LSL/USL are spec limits by definition — never read as the test limits.
  it.each(['lsl', 'LSL', 'lo_spec', 'spec_lo', 'min_spec', 'Low Spec Limit', 'loSpec'])('detects loSpec: %s', col => {
    expect(detectRole(col, noSample)).toBe('loSpec');
  });
  it.each(['usl', 'USL', 'hi_spec', 'spec_hi', 'max_spec', 'High Spec Limit', 'hiSpec'])('detects hiSpec: %s', col => {
    expect(detectRole(col, noSample)).toBe('hiSpec');
  });
  it.each(['min', 'max', 'lower', 'upper'])('does not guess a limit family for %s', col => {
    expect(detectRole(col, noSample)).not.toMatch(/Limit$|Spec$/);
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

  it.each([
    'Centre die X', 'Centre die Y', 'Center die X', 'Center die Y',
    'centre_die_x', 'centre_die_y', 'center_die_x', 'center_die_y',
    'X Min', 'Y Min', 'X Max', 'Y Max',
    'X Range', 'Y Range', 'X Mean', 'Y Mean',
    'X Avg', 'Y Avg', 'X StdDev', 'Y StdDev',
  ])('does not detect %s as position column', col => {
    expect(detectRole(col, noSample)).not.toBe('x');
    expect(detectRole(col, noSample)).not.toBe('y');
  });

  it.each(['delta_x', 'delta_y', 'offset_x', 'offset_y'])('classifies %s as metadata when numeric', col => {
    expect(detectRole(col, numericSample(col))).toBe('metadata');
  });

  it.each([
    'X Y Increases', 'X Y Increase', 'x y increases', 'x y increase',
    'X Y Delta', 'Y X Delta', 'delta_x', 'delta_y',
    'X Change', 'Y Change', 'X Offset', 'Y Offset',
    'X Y Increments', 'delta X', 'delta Y',
    'change_x', 'change_y', 'diff_x', 'diff_y',
  ])('does not detect %s as position column', col => {
    expect(detectRole(col, noSample)).not.toBe('x');
    expect(detectRole(col, noSample)).not.toBe('y');
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
    expect(msg).toContain('Low test limit (long format)');
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

// ── validateXYAssignment ─────────────────────────────────────────────────────

describe('validateXYAssignment', () => {
  it('accepts both x and y mapped', () => {
    expect(validateXYAssignment({ x: 'colX', y: 'colY' })).toBeNull();
  });
  it('accepts neither x nor y mapped (coordinate-less file)', () => {
    expect(validateXYAssignment({ x: null, y: null })).toBeNull();
  });
  it('rejects x mapped without y', () => {
    expect(validateXYAssignment({ x: 'colX', y: null })).toMatch(/both X and Y/);
  });
  it('rejects y mapped without x', () => {
    expect(validateXYAssignment({ x: null, y: 'colY' })).toMatch(/both X and Y/);
  });
});

// ── Columns recalculated on load ──────────────────────────────────────────────

describe('skipReason — columns the app works out for itself', () => {
  it.each([
    'Ring', 'Quadrant', 'Edge excluded', 'edge_excluded', 'EdgeExcluded',
    'Vth [derived from Vth_n - Vth_p]',
  ])('skips %s', col => {
    expect(skipReason(col)).not.toBeNull();
    expect(detectRole(col, numericSample(col))).toBe('');
  });

  it.each([
    'Ring Oscillator', 'ring_freq', 'Quadrant Yield', 'Die Size', 'Wafer', 'Wafer ID', 'Wafer Notch',
    'Wafer Slot', 'X', 'Y', 'Die X', 'delta_x', 'X Offset', 'Temperature', 'Vth',
    // wafer geometry a file may supply: kept as display info, not skipped
    'Centre die X', 'Center die Y', 'X Increases', 'Die Height', 'Die Width', 'Wafer Diameter', 'Wafer Flat',
  ])('does not skip %s', col => {
    expect(skipReason(col)).toBeNull();
  });
});

// ── Standard run-condition and provenance columns ─────────────────────────────

describe('detectRole — standard condition columns are display info, not tests', () => {
  it.each([
    'Temperature', 'Temp', 'Test Temp', 'Test Temperature', 'Temp (C)', 'temp_c', 'Chuck Temp', 'TestTemp', 'Set Temperature',
    'Operator', 'Operator ID', 'Oper', 'Test Program', 'Program Rev', 'Job Name', 'Recipe',
    'Burn-in Time', 'burnin_time', 'Burn-in Hours', 'burnin_hrs', 'Stress Hours', 'Stress Cycles',
    'Tester ID', 'Handler', 'Probe Card', 'Loadboard', 'Product', 'Customer', 'Mask Set',
    'Slot', 'Wafer Slot', 'Cassette', 'Fab', 'Station', 'DUT', 'Revision', 'Software Version', 'Timestamp', 'Test Date',
  ])('%s with numeric values is metadata', col => {
    expect(detectRole(col, numericSample(col, '25'))).toBe('metadata');
  });

  it.each(['Temp Sensor 1', 'Temperature Coefficient', 'Vth', 'Idsat', 'Frequency'])(
    '%s with numeric values is still a test', col => {
      expect(detectRole(col, numericSample(col, '25'))).toBe('test');
    });
});

describe('detectRole — near-misses of the main roles', () => {
  it.each([['Sub Lot', 'metadata'], ['Sublot', 'metadata'], ['Lot ID', 'lot'], ['Lot Number', 'lot'],
    ['Wafer Notch', 'metadata'], ['Wafer Slot', 'metadata'], ['Wafer ID', 'wafer'], ['Wafer Number', 'wafer'],
    ['Bin Name', 'metadata'], ['Bin Description', 'metadata'], ['Soft Bin Name', 'metadata'],
    ['Hard bin', 'hbin'], ['Bin Number', 'hbin']] as const)('%s → %s', (col, role) => {
    expect(detectRole(col, numericSample(col, 'abc'))).toBe(role);
  });
});

// ── One column per main role, settled at detection ────────────────────────────

describe('detectRoles — single-valued roles', () => {
  it('gives each main role to one column, and says why the others lost it', () => {
    const headers = ['Wafer', 'Wafer Name', 'Wafer Slot', 'X', 'Die X', 'Y', 'Hard bin', 'HBin'];
    const { roles, notes } = detectRoles(headers, []);
    const claimed = (r: string) => headers.filter(h => roles[h] === r);
    for (const r of ['wafer', 'x', 'y', 'hbin']) expect(claimed(r).length).toBeLessThanOrEqual(1);
    expect(roles['Wafer']).toBe('wafer');
    expect(roles['X']).toBe('x');
    expect(roles['Wafer Name']).toBe('metadata');
    expect(notes['Wafer Name']).toMatch(/better match/);
    expect(validateRoleAssignments(headers.map(col => ({ col, role: roles[col] })))).toBeNull();
  });

  it('prefers the stronger match, then the earlier column', () => {
    expect(detectRoles(['die_col_number_x', 'X'], []).roles).toMatchObject({ X: 'x' });
    // a bare `bin` is the weakest claim: a spelled-out hard bin wins in either order
    for (const specific of ['Hard bin', 'hbin', 'h-bin', 'HardBin', 'hard_bin', 'HBIN_NUM']) {
      expect(detectRoles([specific, 'bin'], []).roles).toMatchObject({ [specific]: 'hbin', bin: 'metadata' });
      expect(detectRoles(['bin', specific], []).roles).toMatchObject({ [specific]: 'hbin', bin: 'metadata' });
    }
    for (const specific of ['Soft bin', 'sbin', 's-bin', 'SoftBin']) {
      expect(detectRoles(['bin', specific], []).roles).toMatchObject({ [specific]: 'sbin', bin: 'hbin' });
    }
    expect(detectRoles(['bin_a', 'bin_b'], []).roles).toMatchObject({ bin_a: 'hbin', bin_b: 'metadata' });
  });

  it('notes a skipped column, and detects the same without a note elsewhere', () => {
    const { roles, notes } = detectRoles(['Wafer', 'X', 'Y', 'Ring', 'Centre Die X', 'vth'], numericSample('vth'));
    expect(roles['Ring']).toBe('');
    expect(roles['Centre Die X']).toBe('metadata');
    expect(notes['Ring']).toMatch(/recalculated/);
    expect(notes['vth']).toBeUndefined();
  });
});
