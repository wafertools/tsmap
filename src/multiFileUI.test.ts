import { describe, it, expect } from 'vitest';
import { resolveWaferId, detectMismatches, buildRenameRows, needsWaferLabelPrompt } from './multiFileUI';
import type { RenamedWafer, FileWaferEntry } from './multiFileUI';
import type { WaferData } from './types';

// ── resolveWaferId ────────────────────────────────────────────────────────────

describe('resolveWaferId', () => {
  it('returns non-generic IDs unchanged (data wins)', () => {
    expect(resolveWaferId('LOT123-W05', 'lot.stdf')).toBe('LOT123-W05');
    expect(resolveWaferId('LOT123-W05', 'lot.stdf', 'LOT123')).toBe('LOT123-W05');
  });

  it('combines a generic wafer ID with the lot ID when available', () => {
    expect(resolveWaferId('W01', 'EDGE-LOT-01.stdf', 'EDGE-LOT-01')).toBe('EDGE-LOT-01 · W01');
    expect(resolveWaferId('W02', 'EDGE-LOT-01.stdf', 'EDGE-LOT-01')).toBe('EDGE-LOT-01 · W02');
  });

  it('falls back to the filename stem only when there is no lot ID', () => {
    expect(resolveWaferId('W1', 'lot_wafer3.stdf')).toBe('lot_wafer3');
    expect(resolveWaferId('W01', 'wafer01.stdf', '')).toBe('wafer01'); // empty lot id ignored
  });

  it('falls back to contentId when neither lot ID nor filename stem is usable', () => {
    expect(resolveWaferId('W1', '.stdf')).toBe('W1');
  });

  it('marks a placeholder ID the parser made up, wherever it is shown', () => {
    expect(resolveWaferId('W1', 'lot.stdf', 'LOT9', true)).toBe('LOT9 · W1 (no ID)');
    expect(resolveWaferId('W1', 'lot_wafer3.stdf', undefined, true)).toBe('lot_wafer3');
    expect(resolveWaferId('W1', 'lot.stdf', 'LOT9', false)).toBe('LOT9 · W1');
  });
});

// ── needsWaferLabelPrompt ─────────────────────────────────────────────────────

describe('needsWaferLabelPrompt', () => {
  const file = (fileName: string, waferIds: string[], lotId?: string): FileWaferEntry => ({
    filePath: `/x/${fileName}`,
    fileName,
    parsed: {
      fileName,
      meta: { fields: lotId === undefined ? [] : [{ key: 'lotId', value: lotId }] },
      wafers: waferIds.map(id => ({ waferId: id, results: [{ x: 0, y: 0, hbin: 1 }] })),
      testDefs: {},
    },
  });

  it('does not prompt for one generic-ID wafer whose lot ID already labels it', () => {
    // PARAM-LOT-02_W06.stdf — resolveWaferId gives "PARAM-LOT-02 · W06" unaided.
    expect(needsWaferLabelPrompt([file('PARAM-LOT-02_W06.stdf', ['W06'], 'PARAM-LOT-02')])).toBe(false);
  });

  it('prompts for one generic-ID wafer with no lot ID, whose label would be the file name', () => {
    expect(needsWaferLabelPrompt([file('wafer06.csv', ['W06'])])).toBe(true);
    expect(needsWaferLabelPrompt([file('wafer06.csv', ['W06'], '  ')])).toBe(true); // blank lot ignored
  });

  it('does not prompt for a single wafer with a distinctive ID', () => {
    expect(needsWaferLabelPrompt([file('x.stdf', ['LOT123-W05'])])).toBe(false);
  });

  it('does not prompt for a single multi-wafer file, even with generic IDs and no lot', () => {
    expect(needsWaferLabelPrompt([file('lot.stdf', ['W01', 'W02'])])).toBe(false);
  });

  it('always prompts for several files', () => {
    expect(needsWaferLabelPrompt([
      file('A_W01.stdf', ['W01'], 'A'),
      file('A_W02.stdf', ['W02'], 'A'),
    ])).toBe(true);
  });
});

// ── detectMismatches ──────────────────────────────────────────────────────────

function makeExisting(dieCount: number, bins: number[], x = 0): WaferData {
  return {
    waferId: 'E1',
    results: Array.from({ length: dieCount }, (_, i) => ({ x: x + i, y: 0, hbin: bins[i % bins.length] })),
  };
}

function makeIncoming(id: string, dieCount: number, bins: number[], x = 0): RenamedWafer {
  return {
    waferId: id,
    results: Array.from({ length: dieCount }, (_, i) => ({ x: x + i, y: 0, hbin: bins[i % bins.length] })),
  };
}

describe('detectMismatches', () => {
  it('returns no warnings when existing is empty', () => {
    const incoming = [makeIncoming('W1', 100, [1, 2])];
    expect(detectMismatches(incoming, [])).toHaveLength(0);
  });

  it('returns no warnings for matching wafers', () => {
    const existing = [makeExisting(100, [1, 2])];
    const incoming = [makeIncoming('W2', 100, [1, 2])];
    expect(detectMismatches(incoming, existing)).toHaveLength(0);
  });

  it('warns on die count difference >5%', () => {
    const existing = [makeExisting(100, [1])];
    const incoming = [makeIncoming('W2', 50, [1])];
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.some(w => w.message.includes('Die count'))).toBe(true);
  });

  it('does not warn on die count difference <=5%', () => {
    const existing = [makeExisting(100, [1])];
    const incoming = [makeIncoming('W2', 102, [1])];
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.some(w => w.message.includes('Die count'))).toBe(false);
  });

  it('warns on grid size (X-span) mismatch >4', () => {
    const existing = [makeExisting(10, [1], 0)];   // X: 0..9, span 9
    const incoming = [makeIncoming('W2', 10, [1], 20)]; // X: 20..29, span 9 — same span, no warn
    expect(detectMismatches(incoming, existing)).toHaveLength(0);
  });

  it('warns on different X-span', () => {
    // existing span = 9, incoming span = 20 → diff 11 > 4
    const existing = [{ waferId: 'E1', results: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, hbin: 1 })) }];
    const incoming = [{ waferId: 'W2', results: Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0, hbin: 1 })) }];
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.some(w => w.message.includes('grid size'))).toBe(true);
  });

  it('warns on hard bin set mismatch', () => {
    const existing = [makeExisting(4, [1, 2])];
    const incoming = [makeIncoming('W2', 4, [3, 4])];
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.some(w => w.message.includes('bin sets'))).toBe(true);
  });

  it('warns on duplicate wafer IDs', () => {
    const existing: WaferData[] = [{ waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1 }] }];
    const incoming: RenamedWafer[] = [{ waferId: 'W1', results: [{ x: 0, y: 0, hbin: 1 }] }];
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
  });

  it('says how duplicate IDs from different lots will be told apart', () => {
    const src = (lot: string, file: string) => ({ sourceFile: file, fields: [{ key: 'lotId', value: lot }] });
    const existing: WaferData[] = [{ waferId: 'W01', results: [{ x: 0, y: 0, hbin: 1 }], source: src('LOT-A', 'a.stdf') }];
    const incoming: RenamedWafer[] = [{ waferId: 'W01', results: [{ x: 0, y: 0, hbin: 1 }], source: src('LOT-B', 'b.stdf') }];
    const msg = detectMismatches(incoming, existing).find(w => w.message.includes('Duplicate'))!.message;
    expect(msg).toContain('LOT-A · W01, LOT-B · W01');
    expect(msg).not.toContain('load order');
  });

  it('flags a duplicate that only load order separates as possibly the same wafer twice', () => {
    const src = { sourceFile: 'a.stdf', fields: [{ key: 'lotId', value: 'LOT-A' }] };
    const existing: WaferData[] = [{ waferId: 'W01', results: [{ x: 0, y: 0, hbin: 1 }], source: src }];
    const incoming: RenamedWafer[] = [{ waferId: 'W01', results: [{ x: 0, y: 0, hbin: 1 }], source: src }];
    const msg = detectMismatches(incoming, existing).find(w => w.message.includes('Duplicate'))!.message;
    expect(msg).toContain('load order');
  });

  it('can produce multiple warnings at once', () => {
    const existing = [makeExisting(100, [1, 2])];
    const incoming = [makeIncoming('W1', 50, [3, 4])]; // die count, bin set, duplicate
    const warnings = detectMismatches(incoming, existing);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('all warnings have level warn', () => {
    const existing = [makeExisting(100, [1])];
    const incoming = [makeIncoming('W1', 50, [2])];
    for (const w of detectMismatches(incoming, existing)) {
      expect(w.level).toBe('warn');
    }
  });
});

// ── buildRenameRows (shared-by-reference provenance) ────────────────────────────

describe('buildRenameRows', () => {
  const entry = (fileName: string, lotId: string, waferIds: string[]): FileWaferEntry => ({
    filePath: `/x/${fileName}`,
    fileName,
    parsed: {
      fileName,
      meta: { fields: [{ key: 'lotId', value: lotId }] },
      wafers: waferIds.map(id => ({ waferId: id, results: [{ x: 0, y: 0, hbin: 1 }] })),
      testDefs: {},
    },
  });
  const lotOf = (src: { fields: { key: string; value: string }[] }) =>
    src.fields.find(f => f.key === 'lotId')?.value;

  it('produces one row per wafer across all entries', () => {
    const rows = buildRenameRows([
      entry('a.stdf', 'A', ['W1', 'W2']),
      entry('b.stdf', 'B', ['W1']),
    ]);
    expect(rows).toHaveLength(3);
  });

  it('shares ONE source instance by reference across an entry’s wafers', () => {
    const rows = buildRenameRows([entry('a.stdf', 'A', ['W1', 'W2', 'W3'])]);
    expect(rows[0].source).toBe(rows[1].source); // same reference, not just equal
    expect(rows[1].source).toBe(rows[2].source);
    expect(lotOf(rows[0].source)).toBe('A');
    expect(rows[0].source.sourceFile).toBe('a.stdf');
  });

  it('uses distinct source instances for distinct entries', () => {
    const rows = buildRenameRows([
      entry('a.stdf', 'A', ['W1']),
      entry('b.stdf', 'B', ['W1']),
    ]);
    expect(rows[0].source).not.toBe(rows[1].source);
    expect(lotOf(rows[0].source)).toBe('A');
    expect(lotOf(rows[1].source)).toBe('B');
  });
});

// ── detectMismatches: gaps found in the Aug 2026 review ───────────────────────

describe('detectMismatches — optional hbin', () => {
  // hbin is optional on DieResult. A CSV mapped without a hard-bin column
  // yields undefined for every die, which used to land in the bin Set and then
  // print literally as the string "undefined" in the user-facing warning.
  const noBins = (id: string, n: number): RenamedWafer => ({
    waferId: id,
    results: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
  });
  const noBinsExisting = (n: number): WaferData => ({
    waferId: 'E1',
    results: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
  });

  it('never puts "undefined" in a warning message', () => {
    const warnings = detectMismatches([noBins('W1', 50)], [makeExisting(50, [1, 2])]);
    for (const w of warnings) expect(w.message).not.toContain('undefined');
  });

  it('reports no bin mismatch when neither side has bins', () => {
    const warnings = detectMismatches([noBins('W1', 50)], [noBinsExisting(50)]);
    expect(warnings.filter(w => w.message.includes('Hard bin'))).toHaveLength(0);
  });

  it('still reports a genuine bin difference', () => {
    const warnings = detectMismatches([makeIncoming('W1', 50, [1, 7])], [makeExisting(50, [1, 2])]);
    const bin = warnings.find(w => w.message.includes('Hard bin'));
    expect(bin?.message).toContain('2');
    expect(bin?.message).toContain('7');
  });
});

describe('detectMismatches — Y span', () => {
  // The warning says "Wafer grid size differs", but only the X span was ever
  // compared, so a lot whose columns matched and whose rows didn't passed
  // silently under a check that claimed to cover the grid.
  const grid = (w: number, h: number) =>
    Array.from({ length: w * h }, (_, i) => ({ x: i % w, y: Math.floor(i / w), hbin: 1 }));

  it('flags a differing row count even when columns match', () => {
    const existing: WaferData[] = [{ waferId: 'E1', results: grid(20, 20) }];
    const incoming: RenamedWafer[] = [{ waferId: 'W1', results: grid(20, 40) }];
    const grids = detectMismatches(incoming, existing).filter(w => w.message.includes('grid size'));
    expect(grids).toHaveLength(1);
    expect(grids[0].message).toContain('rows');
  });

  it('reports both axes when both differ', () => {
    const existing: WaferData[] = [{ waferId: 'E1', results: grid(20, 20) }];
    const incoming: RenamedWafer[] = [{ waferId: 'W1', results: grid(40, 40) }];
    const msg = detectMismatches(incoming, existing).find(w => w.message.includes('grid size'))!.message;
    expect(msg).toContain('columns');
    expect(msg).toContain('rows');
  });

  it('stays quiet when both spans match', () => {
    const existing: WaferData[] = [{ waferId: 'E1', results: grid(20, 20) }];
    const incoming: RenamedWafer[] = [{ waferId: 'W1', results: grid(20, 20) }];
    expect(detectMismatches(incoming, existing).filter(w => w.message.includes('grid size'))).toHaveLength(0);
  });
});
