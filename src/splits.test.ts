import { describe, it, expect } from 'vitest';
import {
  getSplitLabel, setSplitLabel, clearAllSplits, listSplitValues, parseSplitsCsv, formatSplitsCsv, waferDisplayLabel,
  splitsFingerprint, legacySplitsFingerprint, SPLIT_FIELD_KEY,
  waferLabels, waferIdentities, waferIdentityKey, splitAssignments, restoreSplitAssignments, applySplitRows,
  splitRowsToAssignments,
} from './splits';
import type { WaferData } from './types';

function wafer(id: string, fields?: Array<{ key: string; value: string }>): WaferData {
  return { waferId: id, results: [], fields };
}

/** A wafer stamped with lot-level provenance (source.fields), as real
 * STDF/ATDF loads produce — distinct from `wafer()`'s per-wafer-only fields,
 * since splitsFingerprint reads lotId/partType via facetValueOf, which
 * prefers source.fields. */
function waferWithLot(id: string, sourceFile: string, lotId?: string, partType?: string): WaferData {
  const fields = [
    ...(lotId !== undefined ? [{ key: 'lotId', value: lotId }] : []),
    ...(partType !== undefined ? [{ key: 'partType', value: partType }] : []),
  ];
  return { waferId: id, results: [], source: { sourceFile, fields } };
}

describe('getSplitLabel / setSplitLabel', () => {
  it('returns undefined when no split is assigned', () => {
    expect(getSplitLabel(wafer('W1'))).toBeUndefined();
  });

  it('assigns a split to a wafer with no fields yet', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'TT');
    expect(getSplitLabel(w)).toBe('TT');
    expect(w.fields).toEqual([{ key: SPLIT_FIELD_KEY, value: 'TT' }]);
  });

  it('preserves other fields when assigning a split', () => {
    const w = wafer('W1', [{ key: 'lotId', value: 'LOT1' }]);
    setSplitLabel(w, 'FF');
    expect(w.fields).toEqual([{ key: 'lotId', value: 'LOT1' }, { key: SPLIT_FIELD_KEY, value: 'FF' }]);
  });

  it('overwrites an existing split assignment', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'TT');
    setSplitLabel(w, 'FF');
    expect(getSplitLabel(w)).toBe('FF');
    expect(w.fields).toHaveLength(1);
  });

  it('trims whitespace', () => {
    const w = wafer('W1');
    setSplitLabel(w, '  SS  ');
    expect(getSplitLabel(w)).toBe('SS');
  });

  it('clears the split when set to undefined', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'TT');
    setSplitLabel(w, undefined);
    expect(getSplitLabel(w)).toBeUndefined();
    expect(w.fields).toEqual([]);
  });

  it('clears the split when set to an empty/whitespace string', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'TT');
    setSplitLabel(w, '   ');
    expect(getSplitLabel(w)).toBeUndefined();
  });

  it('never writes to source.fields — only wafer.fields', () => {
    const source = { sourceFile: 'lot.stdf', fields: [] };
    const w: WaferData = { waferId: 'W1', results: [], source };
    setSplitLabel(w, 'TT');
    expect(source.fields).toEqual([]);
    expect(getSplitLabel(w)).toBe('TT');
  });
});

describe('clearAllSplits', () => {
  it('clears every wafer regardless of prior assignment', () => {
    const wafers = [wafer('W1'), wafer('W2'), wafer('W3')];
    setSplitLabel(wafers[0], 'TT');
    setSplitLabel(wafers[1], 'FF');
    // W3 left unassigned.
    clearAllSplits(wafers);
    expect(wafers.map(getSplitLabel)).toEqual([undefined, undefined, undefined]);
  });

  it('is a no-op on an already-empty set of assignments', () => {
    const wafers = [wafer('W1'), wafer('W2')];
    expect(() => clearAllSplits(wafers)).not.toThrow();
    expect(wafers.map(getSplitLabel)).toEqual([undefined, undefined]);
  });
});

describe('waferDisplayLabel', () => {
  it('returns the raw ID when the suffix is disabled', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'TT');
    expect(waferDisplayLabel(w, false)).toBe('W1');
  });

  it('returns the raw ID when no split is assigned, even with the suffix enabled', () => {
    expect(waferDisplayLabel(wafer('W1'), true)).toBe('W1');
  });

  it('appends " · <split>" when enabled and a split is assigned', () => {
    const w = wafer('W1');
    setSplitLabel(w, 'FF');
    expect(waferDisplayLabel(w, true)).toBe('W1 · FF');
  });
});

describe('listSplitValues', () => {
  it('returns distinct split values in first-seen order', () => {
    const wafers = [wafer('W1'), wafer('W2'), wafer('W3')];
    setSplitLabel(wafers[0], 'FF');
    setSplitLabel(wafers[1], 'TT');
    setSplitLabel(wafers[2], 'FF');
    expect(listSplitValues(wafers)).toEqual(['FF', 'TT']);
  });

  it('skips wafers with no split assigned', () => {
    const wafers = [wafer('W1'), wafer('W2')];
    setSplitLabel(wafers[1], 'TT');
    expect(listSplitValues(wafers)).toEqual(['TT']);
  });
});

describe('splitsFingerprint', () => {
  it('is identical for the same lot reloaded from a differently named/sized file', () => {
    const first = [
      waferWithLot('W01', 'lot_25c.stdf', 'LOT1', 'CHIP-A'),
      waferWithLot('W02', 'lot_25c.stdf', 'LOT1', 'CHIP-A'),
    ];
    const second = [
      waferWithLot('W01', 'lot_85c.stdf', 'LOT1', 'CHIP-A'),
      waferWithLot('W02', 'lot_85c.stdf', 'LOT1', 'CHIP-A'),
    ];
    expect(splitsFingerprint(first)).toBe(splitsFingerprint(second));
  });

  it('differs for two unrelated lots that happen to reuse the same wafer IDs', () => {
    const lotA = [waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W02', 'a.stdf', 'LOT-A')];
    const lotB = [waferWithLot('W01', 'b.stdf', 'LOT-B'), waferWithLot('W02', 'b.stdf', 'LOT-B')];
    expect(splitsFingerprint(lotA)).not.toBe(splitsFingerprint(lotB));
  });

  it('differs when part type differs but lot ID and wafer ID match', () => {
    const a = [waferWithLot('W01', 'x.stdf', 'LOT1', 'CHIP-A')];
    const b = [waferWithLot('W01', 'x.stdf', 'LOT1', 'CHIP-B')];
    expect(splitsFingerprint(a)).not.toBe(splitsFingerprint(b));
  });

  // Was: "falls back to wafer ID alone when no lot metadata is present" — it
  // asserted the fallback did not throw, never that it was safe. Without a lot
  // ID the key is just the wafer IDs, so two unrelated CSVs both containing
  // W01/W02 shared one entry and the second inherited the first's splits.
  it('refuses an identity when any wafer has no lot ID, rather than keying on wafer IDs alone', () => {
    expect(splitsFingerprint([wafer('W01'), wafer('W02')])).toBeNull();
  });

  it('refuses when only SOME wafers have a lot ID — a mixed multi-file load', () => {
    const mixed = [waferWithLot('W01', 'a.stdf', 'LOT-A'), wafer('W02')];
    expect(splitsFingerprint(mixed)).toBeNull();
  });

  it('refuses for an empty wafer set', () => {
    expect(splitsFingerprint([])).toBeNull();
  });

  it('does not collide when field boundaries are ambiguous', () => {
    // lot "AB" + part "C" and lot "A" + part "BC" both concatenated to "ABC01".
    const a = [waferWithLot('01', 'x.stdf', 'AB', 'C')];
    const b = [waferWithLot('01', 'x.stdf', 'A', 'BC')];
    expect(splitsFingerprint(a)).not.toBe(splitsFingerprint(b));
  });

  it('does not collide when a lot ID contains a space', () => {
    // Wafers were joined with ' ', so a lot ID like "LOT 1" blurred the
    // boundary between one wafer's token and the next.
    const a = [waferWithLot('W01', 'x.stdf', 'LOT 1'), waferWithLot('W02', 'x.stdf', 'LOT 1')];
    const b = [waferWithLot('W01', 'x.stdf', 'LOT'), waferWithLot('W02', 'x.stdf', '1')];
    expect(splitsFingerprint(a)).not.toBe(splitsFingerprint(b));
  });

  it('still matches the same lot reloaded, which is the whole point', () => {
    const a = [waferWithLot('W01', 'lot_25c.stdf', 'LOT 1', 'CHIP A')];
    const b = [waferWithLot('W01', 'lot_85c.stdf', 'LOT 1', 'CHIP A')];
    expect(splitsFingerprint(a)).toBe(splitsFingerprint(b));
    expect(splitsFingerprint(a)).not.toBeNull();
  });

  it('legacy fingerprint reproduces the pre-0.1.34 shape, so an old entry can be found', () => {
    const wafers = [waferWithLot('W01', 'x.stdf', 'LOT1', 'CHIP-A')];
    expect(legacySplitsFingerprint(wafers)).toBe('LOT1CHIP-AW01');
    // And it is computable even where the current fingerprint refuses, which is
    // what lets an unreachable entry be pruned rather than left behind.
    expect(legacySplitsFingerprint([wafer('W01')])).toBe('W01');
  });

  it('is independent of wafer order', () => {
    const a = [waferWithLot('W01', 'x.stdf', 'LOT1'), waferWithLot('W02', 'x.stdf', 'LOT1')];
    const b = [waferWithLot('W02', 'x.stdf', 'LOT1'), waferWithLot('W01', 'x.stdf', 'LOT1')];
    expect(splitsFingerprint(a)).toBe(splitsFingerprint(b));
  });
});

describe('formatSplitsCsv / parseSplitsCsv round-trip', () => {
  it('round-trips assignments through CSV', () => {
    const wafers = [wafer('W1'), wafer('W2'), wafer('W3')];
    setSplitLabel(wafers[0], 'TT');
    setSplitLabel(wafers[1], 'FF');
    // W3 left unassigned.

    const csv = formatSplitsCsv(wafers);
    const parsed = parseSplitsCsv(csv);

    expect(parsed).toEqual([
      { waferId: 'W1', split: 'TT' },
      { waferId: 'W2', split: 'FF' },
      { waferId: 'W3', split: '' },
    ]);
  });

  it('skips comment and header lines', () => {
    const parsed = parseSplitsCsv('# a comment\nwaferId,split\nW1,TT\n\nW2,FF');
    expect(parsed).toEqual([{ waferId: 'W1', split: 'TT' }, { waferId: 'W2', split: 'FF' }]);
  });

  it('reads a header-less two-column file, as every earlier build wrote', () => {
    expect(parseSplitsCsv('W01,TT\nW02,FF')).toEqual([{ waferId: 'W01', split: 'TT' }, { waferId: 'W02', split: 'FF' }]);
  });

  it('tolerates malformed lines (no comma)', () => {
    const parsed = parseSplitsCsv('W1,TT\ngarbage line\nW2,FF');
    expect(parsed.map(r => r.waferId)).toEqual(['W1', 'W2']);
  });

  it('keeps empty-split rows so a caller can distinguish "cleared" from "not mentioned"', () => {
    expect(parseSplitsCsv('W1,')).toEqual([{ waferId: 'W1', split: '' }]);
  });

  it('reads lot and occurrence columns by header, in any order', () => {
    const parsed = parseSplitsCsv('split,occurrence,waferId,lot\nTT,,W01,LOT-A\nFF,2,W01,LOT-A');
    expect(parsed).toEqual([
      { waferId: 'W01', split: 'TT', lotId: 'LOT-A' },
      { waferId: 'W01', split: 'FF', lotId: 'LOT-A', occurrence: 2 },
    ]);
  });

  it('writes lot always and occurrence only for a genuine repeat, and round-trips both', () => {
    const wafers = [
      waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W01', 'b.stdf', 'LOT-B'),
      waferWithLot('W02', 'a.stdf', 'LOT-A'), waferWithLot('W02', 'a.stdf', 'LOT-A'),
    ];
    wafers.forEach((w, i) => setSplitLabel(w, ['TT', 'FF', 'SS', 'FS'][i]));
    const csv = formatSplitsCsv(wafers);
    expect(csv).toContain('lot,waferId,occurrence,split');
    expect(csv).toContain('LOT-A,W01,,TT');
    expect(csv).toContain('LOT-A,W02,2,FS');
    const fresh = wafers.map(w => ({ ...w, fields: undefined }));
    expect(applySplitRows(fresh, parseSplitsCsv(csv))).toEqual({ matched: 4, unmatched: 0, ambiguous: 0 });
    expect(fresh.map(getSplitLabel)).toEqual(['TT', 'FF', 'SS', 'FS']);
  });
});

// ── Wafer identity: IDs shared across lots, and repeats within a file ─────────

describe('waferLabels', () => {
  it('leaves an ID nobody else shares untouched', () => {
    expect(waferLabels([waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W02', 'a.stdf', 'LOT-A')], false))
      .toEqual(['W01', 'W02']);
  });

  it('prefixes the lot when two lots share a wafer ID', () => {
    expect(waferLabels([waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W01', 'b.stdf', 'LOT-B')], false))
      .toEqual(['LOT-A · W01', 'LOT-B · W01']);
  });

  it('falls back to the file when the lot is the same (one lot, two test temperatures)', () => {
    expect(waferLabels([waferWithLot('W01', 'lot_25c.stdf', 'L1'), waferWithLot('W01', 'lot_85c.stdf', 'L1')], false))
      .toEqual(['L1 · W01 (lot_25c.stdf)', 'L1 · W01 (lot_85c.stdf)']);
  });

  it('uses a per-wafer field that differs before the file (one table, two temperatures)', () => {
    const pass = (temp: string): WaferData => ({
      ...waferWithLot('W01', 'lot.csv', 'L1'),
      fields: [{ key: 'lotId', value: 'L1' }, { key: 'testTemp', value: temp }, { key: 'op', value: 'Ann' }],
    });
    expect(waferLabels([pass('25'), pass('85')], false))
      .toEqual(['L1 · W01 · Temperature 25', 'L1 · W01 · Temperature 85']);
  });

  it('falls back to load order for a repeat inside one file (a retest pass)', () => {
    expect(waferLabels([waferWithLot('W01', 'x.stdf', 'L1'), waferWithLot('W01', 'x.stdf', 'L1')], false))
      .toEqual(['L1 · W01 (x.stdf) #1', 'L1 · W01 (x.stdf) #2']);
  });

  it('does not repeat a lot that the rename step already put in the ID', () => {
    expect(waferLabels([waferWithLot('LOT-A · W01', 'a.stdf', 'LOT-A'), waferWithLot('LOT-A · W01', 'b.stdf', 'LOT-A')], false))
      .toEqual(['LOT-A · W01 (a.stdf)', 'LOT-A · W01 (b.stdf)']);
  });

  it('reads a per-wafer lot before the file\'s — a flat file can hold several lots', () => {
    const a = { ...waferWithLot('W01', 'x.csv', 'FIRST-ROW-LOT'), fields: [{ key: 'lotId', value: 'LOT-A' }] };
    const b = { ...waferWithLot('W01', 'x.csv', 'FIRST-ROW-LOT'), fields: [{ key: 'lotId', value: 'LOT-B' }] };
    expect(waferLabels([a, b], false)).toEqual(['LOT-A · W01', 'LOT-B · W01']);
  });

  it('appends the split after the disambiguation', () => {
    const w = [waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W01', 'b.stdf', 'LOT-B')];
    setSplitLabel(w[0], 'TT');
    expect(waferLabels(w, true)).toEqual(['LOT-A · W01 · TT', 'LOT-B · W01']);
  });

  it('is always unique, whatever collides', () => {
    const w = [
      waferWithLot('W01', 'x.stdf', 'L1'), waferWithLot('W01', 'x.stdf', 'L1'),
      waferWithLot('W01', 'y.stdf', 'L1'), waferWithLot('W01', 'z.stdf', 'L2'), wafer('W01'),
    ];
    const labels = waferLabels(w, false);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('split persistence by wafer identity', () => {
  const twoLots = () => [waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W01', 'b.stdf', 'LOT-B')];

  it('numbers occurrences only among the same lot + wafer ID', () => {
    const ids = waferIdentities([waferWithLot('W01', 'x', 'L1'), waferWithLot('W01', 'x', 'L2'), waferWithLot('W01', 'x', 'L1')]);
    expect(ids.map(i => i.occurrence)).toEqual([1, 1, 2]);
  });

  it('keeps two lots\' W01 in separate entries — neither overwrites the other', () => {
    const w = twoLots();
    setSplitLabel(w[0], 'TT');
    setSplitLabel(w[1], 'FF');
    const saved = splitAssignments(w);
    expect(Object.keys(saved)).toHaveLength(2);
    const fresh = twoLots();
    expect(restoreSplitAssignments(fresh, saved)).toBe(true);
    expect(fresh.map(getSplitLabel)).toEqual(['TT', 'FF']);
  });

  it('keys contain the lot, so a space in a lot ID cannot blur the fields', () => {
    const a = waferIdentityKey({ lotId: 'LOT 1', waferId: 'W01', occurrence: 1 });
    const b = waferIdentityKey({ lotId: 'LOT', waferId: '1 W01', occurrence: 1 });
    expect(a).not.toBe(b);
  });

  it('still honours an old bare-wafer-ID entry when the ID is unambiguous', () => {
    const w = [waferWithLot('W01', 'a.stdf', 'LOT-A'), waferWithLot('W02', 'a.stdf', 'LOT-A')];
    expect(restoreSplitAssignments(w, { W01: 'TT' })).toBe(true);
    expect(w.map(getSplitLabel)).toEqual(['TT', undefined]);
  });

  it('refuses an old bare-wafer-ID entry that could mean either of two wafers', () => {
    const w = twoLots();
    expect(restoreSplitAssignments(w, { W01: 'TT' })).toBe(false);
    expect(w.map(getSplitLabel)).toEqual([undefined, undefined]);
  });

  it('skips a CSV row that names a shared ID without a lot, instead of applying it to both', () => {
    const w = twoLots();
    expect(applySplitRows(w, parseSplitsCsv('W01,TT'))).toEqual({ matched: 0, unmatched: 0, ambiguous: 1 });
    expect(w.map(getSplitLabel)).toEqual([undefined, undefined]);
  });

  it('seeds from CSV rows without touching the wafers', () => {
    const w = twoLots();
    const seeded = splitRowsToAssignments(w, parseSplitsCsv('lot,waferId,split\nLOT-B,W01,FF'));
    expect(w.map(getSplitLabel)).toEqual([undefined, undefined]);
    expect(Object.values(seeded)).toEqual(['FF']);
  });
});
