import { describe, it, expect } from 'vitest';
import { derivedNoneBuilt, definitionsAnchorOf, definitionsAnchorMismatch, webDieBudgetWarning, WEB_DIE_BUDGET, shouldMountProgressively, GALLERY_PROGRESSIVE_DIE_THRESHOLD, errMsg, errCode, basename, toWmapTestDefs, unionTestDefs, unionBinInfo, autoPlotMode, applyTestSelection, applyTestOverrides, diffTestOverride, makeWaferSource, toWmapWaferMeta, wcrGeometryFrom, mergeBinDefs, mergePassHbins, toWaferData, stableTestNumber, testNumberForColumn, deriveFileName, isUrlImportFormat, effectiveFileExtension, checkSameExtension, formatFamily, isTesterExt, isAtdfExt } from './lib';
import type { LotMeta, ParsedFile, TestDef, TestOverride, WaferData, WaferSource } from './types';

// ── basename ──────────────────────────────────────────────────────────────────

describe('basename', () => {
  it('extracts filename from unix path', () => {
    expect(basename('/home/user/data/lot.stdf')).toBe('lot.stdf');
  });
  it('extracts filename from windows path', () => {
    expect(basename('C:\\Users\\user\\lot.stdf')).toBe('lot.stdf');
  });
  it('returns bare filename unchanged', () => {
    expect(basename('lot.stdf')).toBe('lot.stdf');
  });
  it('returns empty string for trailing slash', () => {
    expect(basename('/some/dir/')).toBe('');
  });
});

// ── effectiveFileExtension / checkSameExtension ─────────────────────────────────

describe('effectiveFileExtension', () => {
  it('returns the plain extension', () => {
    expect(effectiveFileExtension('lot.stdf')).toBe('stdf');
  });
  it('strips a .gz wrapper to expose the inner format', () => {
    expect(effectiveFileExtension('lot.stdf.gz')).toBe('stdf');
  });
  it('lowercases the extension', () => {
    expect(effectiveFileExtension('LOT.STDF')).toBe('stdf');
  });
  it('treats a dot-less name as its own "extension" (matches split-on-dot behaviour, not a special case)', () => {
    expect(effectiveFileExtension('lot')).toBe('lot');
  });
});

describe('checkSameExtension', () => {
  it('returns null when every file shares the same extension', () => {
    expect(checkSameExtension(['a.stdf', 'b.stdf', 'c.stdf.gz'])).toBeNull();
  });
  it('returns an error naming the offending extensions when mixed', () => {
    const err = checkSameExtension(['a.stdf', 'b.csv']);
    expect(err).toContain('Mixed formats not supported');
    expect(err).toContain('stdf');
    expect(err).toContain('csv');
  });
  it('is the same rule handleFiles enforces — relaxed=true skips the check (mixed-content zip)', () => {
    expect(checkSameExtension(['a.stdf', 'b.csv'], true)).toBeNull();
  });
  it('returns null for a single file', () => {
    expect(checkSameExtension(['only.stdf'])).toBeNull();
  });
  it('lets STDF and ATDF load together — one family, parsed per file', () => {
    expect(checkSameExtension(['a.stdf', 'b.atdf', 'c.std', 'd.atd.gz'])).toBeNull();
  });
  it('still refuses tester files mixed with table files, or table formats mixed', () => {
    expect(checkSameExtension(['a.atdf', 'b.csv'])).toContain('atdf');
    expect(checkSameExtension(['a.csv', 'b.parquet'])).not.toBeNull();
  });
});

describe('formatFamily / isTesterExt / isAtdfExt', () => {
  it('groups STDF and ATDF, and leaves every other format on its own', () => {
    expect(formatFamily('stdf')).toBe(formatFamily('atd'));
    expect(formatFamily('csv')).not.toBe(formatFamily('json'));
    expect(formatFamily('csv')).not.toBe(formatFamily('stdf'));
  });
  it('recognises both spellings of each tester format', () => {
    expect(['stdf', 'std', 'atdf', 'atd'].every(isTesterExt)).toBe(true);
    expect(isTesterExt('csv')).toBe(false);
    expect(isAtdfExt('atd')).toBe(true);
    expect(isAtdfExt('stdf')).toBe(false);
  });
});

// ── isUrlImportFormat ─────────────────────────────────────────────────────────

describe('isUrlImportFormat', () => {
  it('accepts every supported format', () => {
    for (const f of ['stdf', 'atdf', 'csv', 'json', 'parquet']) {
      expect(isUrlImportFormat(f)).toBe(true);
    }
  });
  it('is case-insensitive', () => {
    expect(isUrlImportFormat('JSON')).toBe(true);
    expect(isUrlImportFormat('Stdf')).toBe(true);
  });
  it('rejects an unsupported format', () => {
    expect(isUrlImportFormat('xlsx')).toBe(false);
    expect(isUrlImportFormat('')).toBe(false);
  });
});

// ── deriveFileName ────────────────────────────────────────────────────────────

describe('deriveFileName', () => {
  it('uses the last path segment as the stem', () => {
    expect(deriveFileName('https://example.com/lots/wafer-42.stdf', 'stdf')).toBe('wafer-42.stdf');
  });
  it('strips an existing extension from the segment and forces the declared format', () => {
    expect(deriveFileName('https://example.com/export.bin', 'json')).toBe('export.json');
  });
  it('ignores query strings when deriving the stem', () => {
    expect(deriveFileName('https://example.com/data/lot?token=abc123&sig=xyz', 'csv')).toBe('lot.csv');
  });
  it('falls back to a generic stem for a bare-root URL', () => {
    expect(deriveFileName('https://example.com/', 'json')).toBe('url-import.json');
  });
  it('falls back to a generic stem for a malformed URL', () => {
    expect(deriveFileName('not a url', 'json')).toBe('url-import.json');
  });
  it('lowercases the forced extension regardless of the format hint casing', () => {
    expect(deriveFileName('https://example.com/lot.stdf', 'STDF')).toBe('lot.stdf');
  });
});

// ── toWmapTestDefs ────────────────────────────────────────────────────────────

describe('toWmapTestDefs', () => {
  it('maps keys to testNumber', () => {
    const defs: Record<string, TestDef> = {
      '1001': { name: 'Continuity', testType: 'P', loLimit: 0.1, hiLimit: 1.5, units: 'mA' },
    };
    const result = toWmapTestDefs(defs);
    expect(result).toHaveLength(1);
    expect(result[0].testNumber).toBe(1001);
  });

  it('maps limit field names', () => {
    const defs: Record<string, TestDef> = {
      '5': { name: 'Vt', testType: 'P', loLimit: 0.5, hiLimit: 1.2, units: 'V' },
    };
    const [r] = toWmapTestDefs(defs);
    expect(r.limitLow).toBe(0.5);
    expect(r.limitHigh).toBe(1.2);
    expect(r.unit).toBe('V');
    expect(r.name).toBe('Vt');
  });

  it('passes spec limits through separately from test limits', () => {
    const defs: Record<string, TestDef> = {
      '5': { name: 'Vt', testType: 'P', loLimit: 0.5, hiLimit: 1.2, loSpec: 0.4, hiSpec: 1.3 },
    };
    const [r] = toWmapTestDefs(defs);
    expect(r.limitLow).toBe(0.5);
    expect(r.specLow).toBe(0.4);
    expect(r.specHigh).toBe(1.3);
  });

  it('passes the file\'s limit-equality rule through', () => {
    const defs: Record<string, TestDef> = {
      '5': { name: 'Vt', testType: 'P', loLimit: 0.5, hiLimit: 1.2, loLimitInclusive: false },
    };
    const [r] = toWmapTestDefs(defs);
    expect(r.limitLowInclusive).toBe(false);
    expect(r.limitHighInclusive).toBeUndefined();
  });

  it('handles missing optional fields', () => {
    const defs: Record<string, TestDef> = {
      '10': { name: '', testType: 'F' },
    };
    const [r] = toWmapTestDefs(defs);
    expect(r.limitLow).toBeUndefined();
    expect(r.limitHigh).toBeUndefined();
    expect(r.unit).toBeUndefined();
  });

  it('falls back to "Test N" when name is empty', () => {
    const defs: Record<string, TestDef> = {
      '9001': { name: '', testType: 'F' },
    };
    expect(toWmapTestDefs(defs)[0].name).toBe('Test 9001');
  });

  it('returns one entry per key', () => {
    const defs: Record<string, TestDef> = {
      '1': { name: 'A', testType: 'P' },
      '2': { name: 'B', testType: 'P' },
      '3': { name: 'C', testType: 'F' },
    };
    expect(toWmapTestDefs(defs)).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(toWmapTestDefs({})).toEqual([]);
  });
});

// ── autoPlotMode ──────────────────────────────────────────────────────────────

describe('autoPlotMode', () => {
  it('prefers hardBin when hbin present', () => {
    const wafers = [{ waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1, sbin: 2, testValues: { 1: 0.5 } }] }];
    expect(autoPlotMode(wafers)).toBe('hardBin');
  });

  it('falls back to softBin when no hbin', () => {
    const wafers = [{ waferId: 'W1', results: [{ x: 0, y: 0, sbin: 2, testValues: { 1: 0.5 } }] }];
    expect(autoPlotMode(wafers)).toBe('softBin');
  });

  it('falls back to value when only testValues', () => {
    const wafers = [{ waferId: 'W1', results: [{ x: 0, y: 0, testValues: { 1: 0.5 } }] }];
    expect(autoPlotMode(wafers)).toBe('value');
  });

  it('falls back to value when only functional verdicts (testPass) exist', () => {
    const wafers = [{ waferId: 'W1', results: [{ x: 0, y: 0, testPass: { 2001: true } }] }];
    expect(autoPlotMode(wafers)).toBe('value');
  });

  it('defaults to hardBin for empty results', () => {
    expect(autoPlotMode([{ waferId: 'W1', results: [] }])).toBe('hardBin');
  });

  it('defaults to hardBin for empty wafers', () => {
    expect(autoPlotMode([])).toBe('hardBin');
  });
});

// ── applyTestSelection ────────────────────────────────────────────────────────

function makeParsed(testDefs: Record<string, TestDef>, testValues: Record<number, number> = {}): ParsedFile {
  return {
    fileName: 'test.stdf',
    meta: { fields: [] },
    wafers: [{
      waferId: 'W1',
      results: [{ x: 0, y: 0, hbin: 1, testValues }],
    }],
    testDefs,
  };
}

describe('applyTestSelection', () => {
  it('prunes testDefs to selection', () => {
    const parsed = makeParsed({
      '1001': { name: 'A', testType: 'P' },
      '1002': { name: 'B', testType: 'P' },
      '1003': { name: 'C', testType: 'P' },
    });
    applyTestSelection(parsed, [1001, 1003], null, new Map());
    expect(Object.keys(parsed.testDefs)).toEqual(['1001', '1003']);
  });

  it('prunes per-die testValues to selection', () => {
    const parsed = makeParsed(
      { '1001': { name: 'A', testType: 'P' }, '1002': { name: 'B', testType: 'P' } },
      { 1001: 0.5, 1002: 1.2 },
    );
    applyTestSelection(parsed, [1001], null, new Map());
    expect(parsed.wafers[0].results[0].testValues).toEqual({ 1001: 0.5 });
  });

  it('prunes per-die testPass to selection', () => {
    const parsed = makeParsed(
      { '1001': { name: 'A', testType: 'P' }, '2001': { name: 'scan', testType: 'F' }, '2002': { name: 'bist', testType: 'F' } },
    );
    parsed.wafers[0].results[0].testPass = { 2001: true, 2002: false };
    applyTestSelection(parsed, [1001, 2001], null, new Map());
    expect(parsed.wafers[0].results[0].testPass).toEqual({ 2001: true });
  });

  it('backfills stop-on-fail tests from firstPassDefs', () => {
    const parsed = makeParsed({ '1001': { name: 'A', testType: 'P' } });
    const firstPass = {
      '1001': { name: 'A', testType: 'P' as const },
      '1002': { name: 'B', testType: 'P' as const },
    };
    applyTestSelection(parsed, [1001, 1002], firstPass, new Map());
    expect('1002' in parsed.testDefs).toBe(true);
    expect(parsed.testDefs['1002'].name).toBe('B');
  });

  it('does not backfill tests not in firstPassDefs', () => {
    const parsed = makeParsed({ '1001': { name: 'A', testType: 'P' } });
    applyTestSelection(parsed, [1001, 9999], { '1001': { name: 'A', testType: 'P' } }, new Map());
    expect('9999' in parsed.testDefs).toBe(false);
  });

  it('applies name overrides', () => {
    const parsed = makeParsed({ '1001': { name: 'Original', testType: 'P' } });
    applyTestSelection(parsed, [1001], null, new Map([[1001, { name: 'User Name' }]]));
    expect(parsed.testDefs['1001'].name).toBe('User Name');
  });

  it('name overrides win over backfill names', () => {
    const parsed = makeParsed({});
    const firstPass = { '1001': { name: 'STDF Name', testType: 'P' as const } };
    applyTestSelection(parsed, [1001], firstPass, new Map([[1001, { name: 'User Name' }]]));
    expect(parsed.testDefs['1001'].name).toBe('User Name');
  });

  it('applies limit, units, and testType overrides', () => {
    const parsed = makeParsed({ '1001': { name: 'A', testType: 'P', loLimit: 0, hiLimit: 1 } });
    applyTestSelection(parsed, [1001], null, new Map([[1001, { loLimit: -5, hiLimit: 5, units: 'mA', testType: 'P' }]]));
    expect(parsed.testDefs['1001']).toEqual({ name: 'A', testType: 'P', loLimit: -5, hiLimit: 5, units: 'mA' });
  });

  it('empty selection removes all testDefs and testValues', () => {
    const parsed = makeParsed(
      { '1001': { name: 'A', testType: 'P' } },
      { 1001: 0.5 },
    );
    applyTestSelection(parsed, [], null, new Map());
    expect(Object.keys(parsed.testDefs)).toHaveLength(0);
    expect(parsed.wafers[0].results[0].testValues).toEqual({});
  });

  it('returns the mutated parsed object', () => {
    const parsed = makeParsed({ '1': { name: 'X', testType: 'P' } });
    const returned = applyTestSelection(parsed, [1], null, new Map());
    expect(returned).toBe(parsed);
  });

  it('handles dies with no testValues gracefully', () => {
    const parsed: ParsedFile = {
      fileName: 'test.stdf',
      meta: { fields: [] },
      wafers: [{ waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1 }] }],
      testDefs: { '1001': { name: 'A', testType: 'P' } },
    };
    expect(() => applyTestSelection(parsed, [1001], null, new Map())).not.toThrow();
  });
});

// ── applyTestOverrides ──────────────────────────────────────────────────────────

describe('applyTestOverrides', () => {
  it('partial override leaves other fields untouched', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P', loLimit: 0, hiLimit: 1, units: 'V' } };
    applyTestOverrides(testDefs, new Map([[1001, { hiLimit: 5 }]]));
    expect(testDefs['1001']).toEqual({ name: 'A', testType: 'P', loLimit: 0, hiLimit: 5, units: 'V' });
  });

  it('override always wins over the parsed value', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P', loLimit: 0 } };
    applyTestOverrides(testDefs, new Map([[1001, { loLimit: -99 }]]));
    expect(testDefs['1001'].loLimit).toBe(-99);
  });

  it('name-only override does not blank existing limits', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P', loLimit: 0, hiLimit: 1 } };
    applyTestOverrides(testDefs, new Map([[1001, { name: 'Renamed' }]]));
    expect(testDefs['1001']).toEqual({ name: 'Renamed', testType: 'P', loLimit: 0, hiLimit: 1 });
  });

  it('ignores an override for a test number absent from testDefs', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P' } };
    applyTestOverrides(testDefs, new Map([[9999, { name: 'Ghost' }]]));
    expect(testDefs).toEqual({ '1001': { name: 'A', testType: 'P' } });
  });

  it('applies an explicit 0 override (not treated as falsy-skip)', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P', loLimit: 5 } };
    applyTestOverrides(testDefs, new Map([[1001, { loLimit: 0 }]]));
    expect(testDefs['1001'].loLimit).toBe(0);
  });

  it('applies a testType override', () => {
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P' } };
    applyTestOverrides(testDefs, new Map([[1001, { testType: 'F' }]]));
    expect(testDefs['1001'].testType).toBe('F');
  });

  it('drops loLimit/hiLimit for an already-functional test, but keeps name/units', () => {
    const testDefs: Record<string, TestDef> = { '2001': { name: 'scan', testType: 'F' } };
    applyTestOverrides(testDefs, new Map([[2001, { name: 'Scan Chain', loLimit: 0, hiLimit: 1, units: 'x' }]]));
    expect(testDefs['2001']).toEqual({ name: 'Scan Chain', testType: 'F', units: 'x' });
  });

  it('drops a new loLimit/hiLimit override when the same override reclassifies to functional', () => {
    // Reclassifying to F blocks *new* limit overrides on this merge — it doesn't
    // retroactively scrub limits already present on the TestDef (that combination
    // can't occur from real parser output; FTR-based tests never carry limits).
    const testDefs: Record<string, TestDef> = { '1001': { name: 'A', testType: 'P', loLimit: 0.1, hiLimit: 1.5 } };
    applyTestOverrides(testDefs, new Map([[1001, { testType: 'F', loLimit: 0, hiLimit: 1 }]]));
    expect(testDefs['1001']).toEqual({ name: 'A', testType: 'F', loLimit: 0.1, hiLimit: 1.5 });
  });

  it('allows loLimit/hiLimit when an override reclassifies a test to parametric', () => {
    const testDefs: Record<string, TestDef> = { '2001': { name: 'scan', testType: 'F' } };
    applyTestOverrides(testDefs, new Map([[2001, { testType: 'P', loLimit: 0, hiLimit: 1 }]]));
    expect(testDefs['2001']).toEqual({ name: 'scan', testType: 'P', loLimit: 0, hiLimit: 1 });
  });
});

// ── diffTestOverride ────────────────────────────────────────────────────────────

describe('diffTestOverride', () => {
  it('returns undefined when there is no diff', () => {
    const def: TestDef = { name: 'A', testType: 'P', loLimit: 0, hiLimit: 1, units: 'V' };
    expect(diffTestOverride(def, { ...def })).toBeUndefined();
  });

  it('returns only the field(s) that differ', () => {
    const original: TestDef = { name: 'A', testType: 'P' };
    const current: TestDef = { name: 'Renamed', testType: 'P' };
    const diff: TestOverride | undefined = diffTestOverride(current, original);
    expect(diff).toEqual({ name: 'Renamed' });
  });

  it('returns multiple differing fields', () => {
    const original: TestDef = { name: 'A', testType: 'P', loLimit: 0 };
    const current: TestDef = { name: 'A', testType: 'F', loLimit: -5, hiLimit: 5 };
    expect(diffTestOverride(current, original)).toEqual({ testType: 'F', loLimit: -5, hiLimit: 5 });
  });
});

// ── makeWaferSource ─────────────────────────────────────────────────────────────

describe('makeWaferSource', () => {
  it('carries the lot fields and filename onto a WaferSource', () => {
    const meta: LotMeta = { fields: [
      { key: 'lotId', value: 'LOT1' }, { key: 'partType', value: 'NMOS' },
    ] };
    const src = makeWaferSource(meta, 'lot1.stdf');
    expect(src.sourceFile).toBe('lot1.stdf');
    expect(src.fields).toEqual(meta.fields);
  });

  it('handles an empty lot meta', () => {
    const src = makeWaferSource({ fields: [] }, 'bare.csv');
    expect(src.sourceFile).toBe('bare.csv');
    expect(src.fields).toEqual([]);
  });
});

// ── toWaferData ─────────────────────────────────────────────────────────────────

describe('toWaferData', () => {
  const src: WaferSource = { sourceFile: 'a.stdf', fields: [{ key: 'lotId', value: 'A' }] };

  it('carries per-wafer fields and source through the merge projection', () => {
    // Regression: the rename/merge flow used to drop `fields`, killing WIR/WRR facets.
    const fields = [{ key: 'frameId', value: 'F1' }, { key: 'maskId', value: 'M1' }];
    const out = toWaferData({
      waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1 }],
      partCount: 10, goodCount: 9, failCount: 1, fields, source: src,
    });
    expect(out.fields).toBe(fields);   // same reference, not dropped
    expect(out.source).toBe(src);      // shared provenance reference preserved
    expect(out).toEqual({
      waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1 }],
      partCount: 10, goodCount: 9, failCount: 1, fields, source: src,
    });
  });

  it('tolerates a minimal wafer (only id + results)', () => {
    const out = toWaferData({ waferId: 'W1', results: [] });
    expect(out.fields).toBeUndefined();
    expect(out.source).toBeUndefined();
  });
});

// ── toWmapWaferMeta ─────────────────────────────────────────────────────────────

const source = (o: Record<string, string>): WaferSource =>
  ({ sourceFile: 'f', fields: Object.entries(o).map(([key, value]) => ({ key, value })) });

describe('toWmapWaferMeta', () => {
  it('returns undefined when there is no source', () => {
    expect(toWmapWaferMeta(undefined, 'W1')).toBeUndefined();
  });

  it('maps known keys to wmap WaferMetadata names', () => {
    const m = toWmapWaferMeta(source({ lotId: 'LOT1', partType: 'NMOS', jobName: 'PGM_X', startT: '2026-06-23', testTemp: '25' }), 'W7')!;
    expect(m.waferId).toBe('W7');
    expect(m.lot).toBe('LOT1');
    expect(m.product).toBe('NMOS');
    expect(m.testProgram).toBe('PGM_X');
    expect(m.testDate).toBe('2026-06-23');
    expect(m.temperature).toBe(25); // coerced to number
  });

  it('keeps temperature as a string field when not numeric', () => {
    const m = toWmapWaferMeta(source({ testTemp: 'hot' }), 'W1')!;
    expect(m.temperature).toBeUndefined();
    expect(m.testTemp).toBe('hot');
  });

  it('passes unknown keys through wmap’s open index signature', () => {
    const m = toWmapWaferMeta(source({ frameId: 'FR-9', customThing: 'X' }), 'W1')!;
    expect(m.frameId).toBe('FR-9');
    expect(m.customThing).toBe('X');
  });

  it('emits only waferId when the source has no fields', () => {
    const m = toWmapWaferMeta(source({}), 'W1')!;
    expect(m.waferId).toBe('W1');
    expect('lot' in m).toBe(false);
  });

  it('sends WCR fields to wmap decoded, under keys that label correctly — never raw codes', () => {
    const m = toWmapWaferMeta(source({
      wafrSiz: '300', dieHt: '16.9', dieWid: '16.9', wfUnits: '3', wfFlat: 'D',
      centerX: '0', centerY: '0', posX: 'R', posY: 'U',
    }), 'W1')!;
    expect(m).toEqual({
      waferId: 'W1', waferDiameter: '300 mm', dieHeight: '16.9 mm', dieWidth: '16.9 mm',
      waferFlat: 'Bottom', centreDieX: '0', centreDieY: '0', xIncreases: 'Right', yIncreases: 'Up',
    });
  });

  it('maps a wafer split (splitLabel) to wmap\'s first-class `split` field', () => {
    const m = toWmapWaferMeta(source({ lotId: 'LOT1' }), 'W1', [{ key: 'splitLabel', value: 'TT' }])!;
    expect(m.lot).toBe('LOT1');
    expect(m.split).toBe('TT');
  });

  it('per-wafer fields win over same-named lot-level fields', () => {
    const m = toWmapWaferMeta(source({ lotId: 'LOT1' }), 'W1', [{ key: 'lotId', value: 'OVERRIDE' }])!;
    expect(m.lot).toBe('OVERRIDE');
  });

  it('still produces metadata from waferFields alone when there is no source', () => {
    const m = toWmapWaferMeta(undefined, 'W1', [{ key: 'splitLabel', value: 'FF' }])!;
    expect(m).toBeDefined();
    expect(m.waferId).toBe('W1');
    expect(m.split).toBe('FF');
  });
});

// ── wcrGeometryFrom ──────────────────────────────────────────────────────────

describe('wcrGeometryFrom', () => {
  it('returns null when there is no source', () => {
    expect(wcrGeometryFrom(undefined)).toBeNull();
  });

  it('returns null when the source has no WCR fields', () => {
    expect(wcrGeometryFrom(source({ lotId: 'LOT1' }))).toBeNull();
  });

  it('converts mm units (wfUnits=3) straight through', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '300', dieHt: '10', dieWid: '12', wfUnits: '3' }))!;
    expect(g.waferConfig.diameter).toBe(300);
    expect(g.dieConfig.height).toBe(10);
    expect(g.dieConfig.width).toBe(12);
  });

  it('converts inch units (wfUnits=1) to mm', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '12', wfUnits: '1' }))!;
    expect(g.waferConfig.diameter).toBeCloseTo(304.8, 5);
  });

  it('converts cm units (wfUnits=2) to mm', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '30', wfUnits: '2' }))!;
    expect(g.waferConfig.diameter).toBe(300);
  });

  it('ignores the whole record when WF_UNITS is outside the spec (0–4) — it was misread', () => {
    // The shape a 2-byte-shifted WCR reads back as: units 135, a centre far
    // off the data, a flat letter. None of it may reach wmap.
    expect(wcrGeometryFrom(source({ wafrSiz: '9e-41', wfUnits: '135', wfFlat: 'D', centerX: '17411', centerY: '0' }))).toBeNull();
  });

  it('keeps unit-free fields when WF_UNITS is 0 (unknown), dropping only sizes', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '300', wfUnits: '0', wfFlat: 'D', centerX: '1', centerY: '2' }))!;
    expect(g.waferConfig.diameter).toBeUndefined();
    expect(g.waferConfig.center).toEqual({ x: 1, y: 2 });
    expect(g.waferConfig.notch).toEqual({ type: 'bottom' });
  });

  it('converts mil units (wfUnits=4) to mm', () => {
    const g = wcrGeometryFrom(source({ dieWid: '1000', wfUnits: '4' }))!;
    expect(g.dieConfig.width).toBeCloseTo(25.4, 5);
  });

  it('never uses wafrSiz/dieHt/dieWid when units are unknown (wfUnits=0)', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '300', dieHt: '10', dieWid: '12', wfUnits: '0' }));
    expect(g).toBeNull();
  });

  it('never uses wafrSiz/dieHt/dieWid when wfUnits is entirely absent', () => {
    const g = wcrGeometryFrom(source({ wafrSiz: '300', centerX: '0', centerY: '0' }))!;
    expect(g.waferConfig.diameter).toBeUndefined();
    expect(g.waferConfig.center).toEqual({ x: 0, y: 0 });
  });

  it('maps centerX/centerY to waferConfig.center with no unit conversion', () => {
    const g = wcrGeometryFrom(source({ centerX: '3', centerY: '-2' }))!;
    expect(g.waferConfig.center).toEqual({ x: 3, y: -2 });
  });

  it('requires both centerX and centerY — a lone one is not emitted', () => {
    const g = wcrGeometryFrom(source({ centerX: '3' }));
    expect(g).toBeNull();
  });

  it('maps wfFlat to waferConfig.notch.type', () => {
    expect(wcrGeometryFrom(source({ wfFlat: 'U' }))!.waferConfig.notch).toEqual({ type: 'top' });
    expect(wcrGeometryFrom(source({ wfFlat: 'D' }))!.waferConfig.notch).toEqual({ type: 'bottom' });
    expect(wcrGeometryFrom(source({ wfFlat: 'L' }))!.waferConfig.notch).toEqual({ type: 'left' });
    expect(wcrGeometryFrom(source({ wfFlat: 'R' }))!.waferConfig.notch).toEqual({ type: 'right' });
  });

  it('maps posX/posY to dieConfig axis directions', () => {
    const g = wcrGeometryFrom(source({ posX: 'L', posY: 'D' }))!;
    expect(g.dieConfig.xAxisDirection).toBe('left');
    expect(g.dieConfig.yAxisDirection).toBe('down');
  });

  it('maps every field together from a full WCR record', () => {
    const g = wcrGeometryFrom(source({
      wafrSiz: '300', dieHt: '10', dieWid: '12', wfUnits: '3', wfFlat: 'D',
      centerX: '0', centerY: '0', posX: 'R', posY: 'U',
    }))!;
    expect(g).toEqual({
      waferConfig: { diameter: 300, center: { x: 0, y: 0 }, notch: { type: 'bottom' } },
      dieConfig: { width: 12, height: 10, xAxisDirection: 'right', yAxisDirection: 'up' },
    });
  });
});

// ── stableTestNumber ─────────────────────────────────────────────────────────
// Mirrors testdata-parser's Rust test_identity.rs — same algorithm (FNV-1a,
// reserved-band floor, collision-probe), independent implementation. See that
// file's doc comment for why: CSV/JSON test numbers used to be assigned by
// column/encounter order, which silently renumbered every test whenever a
// file was reordered or a column added/removed.

describe('stableTestNumber', () => {
  it('is deterministic across separate calls', () => {
    expect(stableTestNumber('GAIN_DB', new Set())).toBe(stableTestNumber('GAIN_DB', new Set()));
  });

  it('gives different identities different numbers (usually)', () => {
    const used = new Set<number>();
    const a = stableTestNumber('GAIN_DB', used);
    const b = stableTestNumber('NF_DB', used);
    expect(a).not.toBe(b);
  });

  it('never lands below the reserved band', () => {
    const used = new Set<number>();
    for (const name of ['', 'a', '1001', '1002', 'test_000', 'x']) {
      expect(stableTestNumber(name, used)).toBeGreaterThanOrEqual(1_000_000);
    }
  });

  it('probes forward on collision rather than reusing the slot', () => {
    const natural = stableTestNumber('collide-me', new Set());
    const used = new Set<number>([natural]);
    const bumped = stableTestNumber('collide-me', used);
    expect(bumped).not.toBe(natural);
    expect(used.has(bumped)).toBe(true);
  });

  it('never collides across many distinct identities in one call sequence', () => {
    const used = new Set<number>();
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = stableTestNumber(`test_${i}`, used);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
    }
  });

  it('respects numbers pre-seeded by the caller', () => {
    // Simulates wide-format numbers reserving slots before a long-format pass
    // (a different call site entirely) computes any of its own.
    const used = new Set<number>([1_000_042]);
    const n = stableTestNumber('a name that happens to hash there', used);
    expect(n).not.toBe(1_000_042);
  });

  it('is stable regardless of what else has already been hashed into the same set', () => {
    // Same identity, empty set both times -> same result, independent of history.
    const usedA = new Set<number>();
    stableTestNumber('unrelated_1', usedA);
    stableTestNumber('unrelated_2', usedA);
    const a = stableTestNumber('GAIN_DB', usedA);

    const usedB = new Set<number>();
    const b = stableTestNumber('GAIN_DB', usedB);

    expect(a).toBe(b);
  });
});

// ── testNumberForColumn ───────────────────────────────────────────────────────
// Wide format's per-column number: raw exports sometimes name a test column
// literally by its number ("1001", "1002") with no descriptive name at all —
// that real number should be used as-is, not hashed away.

describe('testNumberForColumn', () => {
  it('uses a bare-numeric column header literally', () => {
    expect(testNumberForColumn('1001', new Set())).toBe(1001);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(testNumberForColumn(' 1001 ', new Set())).toBe(1001);
  });

  it('falls back to hashing for a non-numeric header', () => {
    const n = testNumberForColumn('Vt_lin', new Set());
    expect(n).toBe(stableTestNumber('Vt_lin', new Set()));
    expect(n).toBeGreaterThanOrEqual(1_000_000);
  });

  it('never collides a literal number with a previously hashed one', () => {
    const used = new Set<number>();
    const hashed = testNumberForColumn('some_test_name', used);
    // A literal number is always well under the reserved band a hash lands
    // in, so this can never coincide — but assert the actual invariant
    // (used-set membership), not just the value ranges.
    const literal = testNumberForColumn('1001', used);
    expect(literal).not.toBe(hashed);
    expect(used.has(literal)).toBe(true);
    expect(used.has(hashed)).toBe(true);
  });

  it('falls back to hashing when the literal number is already taken', () => {
    const used = new Set<number>([1001]);
    const n = testNumberForColumn('1001', used);
    expect(n).not.toBe(1001);
    expect(n).toBeGreaterThanOrEqual(1_000_000);
  });

  it('falls back to hashing when the literal exceeds u32 range', () => {
    const n = testNumberForColumn('99999999999', new Set());
    expect(n).toBeGreaterThanOrEqual(1_000_000);
  });

  it('registers the literal number in `used` so a later hash cannot land on it', () => {
    const used = new Set<number>();
    testNumberForColumn('1001', used);
    expect(used.has(1001)).toBe(true);
  });
});

// ── mergeBinDefs / mergePassHbins ────────────────────────────────────────────

describe('mergeBinDefs', () => {
  it('returns undefined when every input is empty or absent', () => {
    expect(mergeBinDefs([undefined, [], undefined])).toBeUndefined();
  });

  it('merges bin defs from multiple files, sorted by bin number', () => {
    const merged = mergeBinDefs([
      [{ bin: 2, name: 'Fail' }],
      [{ bin: 1, name: 'Pass' }],
    ]);
    expect(merged).toEqual([{ bin: 1, name: 'Pass' }, { bin: 2, name: 'Fail' }]);
  });

  it('a later list wins for the same bin number', () => {
    const merged = mergeBinDefs([
      [{ bin: 1, name: 'Pass (old)' }],
      [{ bin: 1, name: 'Pass' }],
    ]);
    expect(merged).toEqual([{ bin: 1, name: 'Pass' }]);
  });
});

describe('mergePassHbins', () => {
  it('returns undefined when every input is empty or absent', () => {
    expect(mergePassHbins([undefined, [], undefined])).toBeUndefined();
  });

  it('unions and dedupes across files, sorted', () => {
    expect(mergePassHbins([[3], [1, 3], undefined])).toEqual([1, 3]);
  });
});

// ── unionTestDefs (cross-file test-number reconciliation) ────────────────────
// A test number identifies a test WITHIN a test program. Across files it does
// not, so the old `Object.assign` merge (last-wins) could hand every wafer a
// definition from a different program.
describe('unionTestDefs', () => {
  const def = (over: Partial<TestDef> = {}): TestDef =>
    ({ name: 'vth_n_mV', testType: 'P', units: 'mV', loLimit: 260, hiLimit: 380, ...over });
  const file = (fileName: string, defs: Record<string, TestDef>) => ({ fileName, testDefs: defs });

  it('merges a file with limits and one without, silently', () => {
    const { defs, collisions } = unionTestDefs([
      file('a.stdf', { 1001: def() }),
      file('b.stdf', { 1001: def({ loLimit: undefined, hiLimit: undefined }) }),
    ]);
    expect(collisions).toEqual([]);
    expect(defs[1001].loLimit).toBe(260);
    expect(defs[1001].hiLimit).toBe(380);
  });

  it('backfills a limit stated only by the later file', () => {
    const { defs, collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ loLimit: undefined, hiLimit: undefined }) }),
      file('b.stdf', { 1001: def() }),
    ]);
    expect(collisions).toEqual([]);
    expect(defs[1001].loLimit).toBe(260);
  });

  it('reports a name disagreement and names both files', () => {
    const { collisions } = unionTestDefs([
      file('corner.stdf', { 1001: def() }),
      file('coordless.stdf', { 1001: def({ name: 'leakage_nA', units: 'nA', loLimit: 0, hiLimit: 5 }) }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].kind).toBe('name');
    expect(collisions[0].stated).toEqual([
      { value: 'vth_n_mV', fileName: 'corner.stdf' },
      { value: 'leakage_nA', fileName: 'coordless.stdf' },
    ]);
  });

  it('treats a unit disagreement as a collision — SI prefixes carry magnitude', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ units: 'mV' }) }),
      file('b.stdf', { 1001: def({ units: 'MV' }) }),
    ]);
    expect(collisions[0].kind).toBe('units');
  });

  it('tolerates name case and padding drift', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ name: 'vth_n_mV' }) }),
      file('b.stdf', { 1001: def({ name: '  VTH_N_MV ' }) }),
    ]);
    expect(collisions).toEqual([]);
  });

  it('reports a limits disagreement separately from a name one', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ hiLimit: 380 }) }),
      file('b.stdf', { 1001: def({ hiLimit: 400 }) }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].kind).toBe('limits');
  });

  it('does not treat float32/float64 representation noise as a disagreement', () => {
    const asFloat32 = Math.fround(380.1);
    expect(asFloat32).not.toBe(380.1);
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ hiLimit: 380.1 }) }),
      file('b.stdf', { 1001: def({ hiLimit: asFloat32 }) }),
    ]);
    expect(collisions).toEqual([]);
  });

  it('reports a parametric/functional disagreement', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ testType: 'P' }) }),
      file('b.stdf', { 1001: def({ testType: 'F' }) }),
    ]);
    expect(collisions[0].kind).toBe('testType');
  });

  it('unions test numbers across files rather than taking one file\'s list', () => {
    const { defs } = unionTestDefs([
      file('a.stdf', { 1001: def() }),
      file('b.stdf', { 1002: def({ name: 'idsat' }), 1003: def({ name: 'ioff' }) }),
    ]);
    expect(Object.keys(defs).sort()).toEqual(['1001', '1002', '1003']);
  });

  it('is first-wins, and never mutates a file\'s own defs', () => {
    const a = { 1001: def() };
    const b = { 1001: def({ name: 'other', loLimit: undefined, hiLimit: undefined }) };
    const { defs } = unionTestDefs([file('a.stdf', a), file('b.stdf', b)]);
    expect(defs[1001].name).toBe('vth_n_mV');
    expect(b[1001].loLimit).toBeUndefined();   // the union's backfill stayed in the union
    expect(a[1001].name).toBe('vth_n_mV');
  });

  it('reports each colliding test once, but names EVERY definition of it', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def() }),
      file('b.stdf', { 1001: def({ name: 'x' }) }),
      file('c.stdf', { 1001: def({ name: 'y' }) }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].stated.map(v => `${v.fileName}:${v.value}`)).toEqual([
      'a.stdf:vth_n_mV', 'b.stdf:x', 'c.stdf:y',
    ]);
  });

  it('does not list a later file that restates a definition already named', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ name: 'leakage' }) }),
      file('b.stdf', { 1001: def({ name: 'vth_n_mV' }) }),
      file('c.stdf', { 1001: def({ name: 'LEAKAGE' }) }),
    ]);
    expect(collisions[0].stated).toHaveLength(2);
  });

  it('a name disagreement outranks a limits one on the same test number', () => {
    const { collisions } = unionTestDefs([
      file('a.stdf', { 1001: def({ hiLimit: 380 }) }),
      file('b.stdf', { 1001: def({ hiLimit: 400 }) }),
      file('c.stdf', { 1001: def({ name: 'something_else' }) }),
    ]);
    expect(collisions[0].kind).toBe('name');
  });
});

// ── unionBinInfo (cross-file pass-bin reconciliation) ───────────────────────
// A hard bin's pass/fail verdict belongs to the file that produced the dies.
// Unioning it across files makes a bin one file counts as a fail count as a
// pass lot-wide, moving every yield figure.
describe('unionBinInfo', () => {
  const wafer = (hbins: number[]): WaferData => ({
    waferId: 'W1',
    results: hbins.map((hbin, i) => ({ x: i, y: 0, hbin })),
  });
  const file = (
    fileName: string, hbins: number[], passHbins?: number[], hbinDefs?: { bin: number; name: string }[],
  ) => ({ fileName, wafers: [wafer(hbins)], passHbins, hbinDefs });

  it('flags a bin that is pass in one file and fail in another', () => {
    const { collisions } = unionBinInfo([
      file('a.stdf', [1, 5], [1, 5]),
      file('b.stdf', [1, 5], [1]),
    ]);
    expect(collisions).toEqual([{ bin: 5, files: ['a.stdf', 'b.stdf'] }]);
  });

  it('does not flag a bin the other file has never seen', () => {
    const { collisions } = unionBinInfo([
      file('a.stdf', [1, 5], [1, 5]),
      file('b.stdf', [1], [1]),
    ]);
    expect(collisions).toEqual([]);
  });

  it('does not flag a file that states no pass bins at all', () => {
    // Absent is not an assertion. (What such a file then USES is
    // `passBinsForWafer`'s business in main.ts — it inherits the union rather
    // than falling back to wmap's [1], which would reclassify every bin-5 die.)
    const { collisions } = unionBinInfo([
      file('a.stdf', [1, 5], [1, 5]),
      file('b.stdf', [1, 5], undefined),
    ]);
    expect(collisions).toEqual([]);
  });

  it('still reports the union for the lot-level surfaces that need one', () => {
    const { passHbins } = unionBinInfo([
      file('a.stdf', [1, 5], [1, 5]),
      file('b.stdf', [1, 5], [1]),
    ]);
    expect(passHbins).toEqual([1, 5]);
  });

  it('sees a bin a file named but never produced a die for', () => {
    const { collisions } = unionBinInfo([
      file('a.stdf', [1], [1, 5]),
      file('b.stdf', [1], [1], [{ bin: 5, name: 'Leakage Fail' }]),
    ]);
    expect(collisions).toEqual([{ bin: 5, files: ['a.stdf', 'b.stdf'] }]);
  });

  it('reports each disagreeing bin once, however many files disagree', () => {
    const { collisions } = unionBinInfo([
      file('a.stdf', [1, 5], [1, 5]),
      file('b.stdf', [1, 5], [1]),
      file('c.stdf', [1, 5], [1]),
    ]);
    expect(collisions).toHaveLength(1);
  });

  it('is silent for the ordinary case where every file agrees', () => {
    const { collisions } = unionBinInfo([
      file('a.stdf', [1, 2], [1]),
      file('b.stdf', [1, 2], [1]),
    ]);
    expect(collisions).toEqual([]);
  });
});

// ── errMsg / errCode ──────────────────────────────────────────────────────────

describe('errMsg and errCode', () => {
  // The parser fails in two shapes depending on which build is running: the WASM
  // path throws a real Error carrying a `code`, the Tauri path rejects with the
  // serialised `{ code, message }`. Both have to read the same way, or a
  // diagnostic differs between the desktop and web builds of the same version.
  it('reads the message from a thrown Error carrying a code (WASM path)', () => {
    const e = Object.assign(new Error('first record is not a FAR'), { code: 'not-stdf' });
    expect(errMsg(e)).toBe('first record is not a FAR');
    expect(errCode(e)).toBe('not-stdf');
  });

  it('reads the message from a serialised ParseError object (Tauri path)', () => {
    const e = { code: 'column-missing', message: "column 'wafer' not found" };
    expect(errMsg(e)).toBe("column 'wafer' not found");
    expect(errCode(e)).toBe('column-missing');
  });

  it('never leaks an error object as JSON into user-facing text', () => {
    // The regression this guards: before the object case, a rejected Tauri
    // command surfaced as the JSON of its own error payload.
    expect(errMsg({ code: 'file-read', message: 'No such file' })).not.toContain('{');
  });

  it('still handles a plain string and a bare Error', () => {
    expect(errMsg('plain failure')).toBe('plain failure');
    expect(errMsg(new Error('boom'))).toBe('boom');
    expect(errCode('plain failure')).toBeUndefined();
    expect(errCode(new Error('boom'))).toBeUndefined();
  });

  it('falls back for values that are neither', () => {
    expect(errMsg(undefined)).toBeDefined();
    expect(errCode({ code: 42, message: 'not a string code' })).toBeUndefined();
  });
});

// ── webDieBudgetWarning ───────────────────────────────────────────────────────

describe('webDieBudgetWarning', () => {
  it('says nothing for a lot within budget', () => {
    expect(webDieBudgetWarning(1)).toBeNull();
    expect(webDieBudgetWarning(50_000)).toBeNull();
    expect(webDieBudgetWarning(WEB_DIE_BUDGET)).toBeNull();
  });

  it('warns above budget, naming the count and the limit', () => {
    const w = webDieBudgetWarning(266_325);
    expect(w).not.toBeNull();
    expect(w).toContain('266,325');
    expect(w).toContain(WEB_DIE_BUDGET.toLocaleString());
  });

  it('points at the desktop app, which has no such limit', () => {
    // The whole value of the message is offering a way forward rather than just
    // announcing a wall.
    expect(webDieBudgetWarning(400_000)).toMatch(/desktop/i);
  });

  it('treats an unknown count as no basis to judge', () => {
    // 0 is what the scan reports when nothing gave a die count; NaN guards a
    // divide or a failed parse upstream.
    expect(webDieBudgetWarning(0)).toBeNull();
    expect(webDieBudgetWarning(NaN)).toBeNull();
  });

  it('classifies every measured case correctly', () => {
    // Measured 2026-09-19 — the point of thresholding on die count
    // rather than dies x tests is that 200k x 100 loads while 400k x 50 does not.
    expect(webDieBudgetWarning(200_000)).toBeNull();   // 50 tests: loaded
    expect(webDieBudgetWarning(200_000)).toBeNull();   // 100 tests: loaded
    expect(webDieBudgetWarning(266_325)).not.toBeNull(); // crashed
    expect(webDieBudgetWarning(400_000)).not.toBeNull(); // crashed
  });
});

// ── shouldMountProgressively ──────────────────────────────────────────────────

describe('shouldMountProgressively', () => {
  const T = GALLERY_PROGRESSIVE_DIE_THRESHOLD;

  it('is a total-die rule, not a wafer-count rule', () => {
    // The measured inversion this exists for: fewer, bigger wafers block longer
    // than many small ones, so counting cards gets it backwards.
    expect(shouldMountProgressively([4000, 4000, 4000, 4000])).toBe(true);   // 4 wafers, 16k dies
    expect(shouldMountProgressively(Array(8).fill(500))).toBe(false);        // 8 wafers, 4k dies
  });

  it('never stages a single card — there is nothing to stage', () => {
    expect(shouldMountProgressively([1_000_000])).toBe(false);
    expect(shouldMountProgressively([])).toBe(false);
  });

  it('switches at the threshold', () => {
    expect(shouldMountProgressively([T - 1, 0])).toBe(false);
    expect(shouldMountProgressively([T, 0])).toBe(true);
  });

  it('covers the lot that motivated it', () => {
    expect(shouldMountProgressively(Array(50).fill(8000))).toBe(true);   // 400k dies, 22.6 s blocking
    expect(shouldMountProgressively(Array(50).fill(4000))).toBe(true);   // the 143 MB sweep fixture
    expect(shouldMountProgressively([300, 300, 300])).toBe(false);       // an ordinary small lot
  });
});

// ── Derived tests and sweeps against a new lot ───────────────────────────────

describe('derivedNoneBuilt', () => {
  const P = (n: number, extra: object = {}) => ({ testNumber: n, name: `T${n}`, ...extra });

  it('is true only when none of the requested derived tests was built on any wafer', () => {
    expect(derivedNoneBuilt([{ testDefs: [P(1), P(900, { derived: true })] }], [900, 901])).toBe(false);
    expect(derivedNoneBuilt([{ testDefs: [P(1)] }], [900, 901])).toBe(true);
    expect(derivedNoneBuilt([{ testDefs: [P(1)] }], [])).toBe(false);
  });

  it('does not count a measured test that shares a derived test\'s number', () => {
    expect(derivedNoneBuilt([{ testDefs: [P(900)] }], [900])).toBe(true);
  });
});

describe('definitionsAnchorMismatch', () => {
  const lot = (defs: Array<[number, string]>, program?: string) =>
    [{ testDefs: defs.map(([testNumber, name]) => ({ testNumber, name })), metadata: program ? { testProgram: program } : null }];
  const anchor = definitionsAnchorOf(lot([[3000, 'I_reset_0'], [3001, 'I_reset_1'], [5, 'Vdd']], 'RRAM_T1'));

  it('is quiet for the same program, whatever other tests the lot has', () => {
    expect(definitionsAnchorMismatch(anchor, lot([[3000, 'i_reset_0 '], [7, 'New']], 'RRAM_T1'))).toBeNull();
  });

  it('names test numbers that now mean different tests', () => {
    const m = definitionsAnchorMismatch(anchor, lot([[3000, 'Vth_n'], [3001, 'I_reset_1']]));
    expect(m?.renamed).toEqual([{ testNumber: 3000, was: 'I_reset_0', now: 'Vth_n' }]);
    expect(m?.program).toBeUndefined();
  });

  it('reports a different program only when both lots state one', () => {
    expect(definitionsAnchorMismatch(anchor, lot([[3000, 'I_reset_0']], 'LOGIC_A'))?.program)
      .toEqual({ was: 'RRAM_T1', now: 'LOGIC_A' });
    expect(definitionsAnchorMismatch(anchor, lot([[3000, 'I_reset_0']]))).toBeNull();
  });

  it('ignores derived tests and unnamed tests', () => {
    const a = definitionsAnchorOf([{ testDefs: [{ testNumber: 900, name: 'D', derived: true }, { testNumber: 8, name: '' }], metadata: null }]);
    expect(a.names.size).toBe(0);
  });
});
