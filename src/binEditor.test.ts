import { describe, it, expect } from 'vitest';
import { TableModel } from './definitionsTable';
import {
  buildBinRows, applyEntriesToModel, rowsToEntries, rowsToState, passEdited, mixedPassBins,
  effectivePass, countYield, yieldPercent, binRowId,
} from './binEditor';

const counts = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

const modelOf = (extra: Partial<Parameters<typeof buildBinRows>[0]> = {}) => new TableModel(buildBinRows({
  hbinDefs: [{ bin: 1, name: 'Pass' }, { bin: 2, name: 'Contact', color: '#ff0000' }],
  passHbins: [1],
  hardCounts: counts({ 1: 90, 2: 8, 7: 2 }),
  softCounts: counts({ 10: 100 }),
  ...extra,
}));

describe('TableModel', () => {
  it('reports edits against the starting values and reverts them', () => {
    const m = modelOf();
    expect(m.editedIds()).toEqual([]);
    m.set('h2', 'name', 'Open');
    expect(m.editedColumns('h2')).toEqual(['name']);
    m.set('h2', 'name', 'Contact'); // typing the original back is not an edit
    expect(m.isEdited('h2')).toBe(false);
    m.set('h2', 'name', 'Open');
    m.revertRow('h2');
    expect(m.get('h2', 'name')).toBe('Contact');
  });

  it('treats a blank name and no name as the same state', () => {
    const m = modelOf();
    m.set('h7', 'name', '');
    expect(m.isEdited('h7')).toBe(false);
  });

  it('removes an added row on revert', () => {
    const m = modelOf();
    m.add({ id: 'h9', cells: { type: 'hard', bin: '9', count: '0' } });
    expect(m.isNew('h9')).toBe(true);
    m.revertAll();
    expect(m.row('h9')).toBeUndefined();
  });

  it('notifies subscribers once per real change', () => {
    const m = modelOf();
    let n = 0;
    m.subscribe(() => n++);
    m.set('h1', 'name', 'Pass');
    m.set('h1', 'name', 'Good');
    expect(n).toBe(1);
  });
});

describe('buildBinRows', () => {
  it('lists named bins, bins in the data and pass bins, hard before soft', () => {
    const ids = modelOf({ passHbins: [1, 5] }).rows().map(r => r.id);
    expect(ids).toEqual(['h1', 'h2', 'h5', 'h7', 's10']);
  });

  it('ticks bin 1 when nothing states a pass bin, as wmap does', () => {
    const m = modelOf({ passHbins: undefined });
    expect(m.get('h1', 'pass')).toBe(true);
    expect(m.get('h2', 'pass')).toBe(false);
  });

  it('gives soft bins no pass flag', () => {
    expect(modelOf().get('s10', 'pass')).toBeUndefined();
  });
});

describe('applyEntriesToModel', () => {
  it('lays a file over the table as edits and adds unknown bins', () => {
    const m = modelOf();
    const r = applyEntriesToModel(m, [
      { bin: 7, type: 'hard', name: 'Leakage', pass: false },
      { bin: 1, type: 'hard', name: 'Pass' },
      { bin: 99, type: 'hard', name: 'Other', pass: true },
    ]);
    expect(r).toEqual({ changed: 1, added: 1 });
    expect(m.get('h7', 'name')).toBe('Leakage');
    expect(m.isNew('h99')).toBe(true);
    expect(passEdited(m)).toBe(true); // a new pass bin is a pass edit
  });

  it('leaves a field the file does not state alone', () => {
    const m = modelOf();
    applyEntriesToModel(m, [{ bin: 2, type: 'hard', name: 'Open' }]);
    expect(m.get('h2', 'color')).toBe('#ff0000');
    expect(m.get('h2', 'pass')).toBe(false);
  });
});

describe('rowsToEntries / rowsToState', () => {
  it('round-trips the table through entries', () => {
    const entries = rowsToEntries(modelOf().rows());
    expect(entries).toContainEqual({ bin: 2, type: 'hard', name: 'Contact', pass: false, color: '#ff0000' });
    expect(entries.find(e => e.type === 'soft')).toEqual({ bin: 10, type: 'soft' });
  });

  it('drops a name and colour the user cleared, and leaves pass alone when no flag was edited', () => {
    const m = modelOf();
    m.set('h2', 'name', undefined);
    m.set('h2', 'color', undefined);
    const s = rowsToState(m);
    expect(s.hbinDefs).toEqual([{ bin: 1, name: 'Pass' }]);
    expect(s.passChanged).toBe(false);
    expect(s.passHbins).toBeUndefined();
  });

  it('writes the ticked hard bins as the pass bins once a flag is edited', () => {
    const m = modelOf();
    m.set('h7', 'pass', true);
    expect(rowsToState(m)).toMatchObject({ passChanged: true, passHbins: [1, 7] });
  });

  it('keeps a colour on an unnamed bin', () => {
    const m = modelOf();
    m.set('h7', 'color', '#00ff00');
    expect(rowsToState(m).hbinDefs).toContainEqual({ bin: 7, name: '', color: '#00ff00' });
  });
});

describe('mixedPassBins', () => {
  it('finds a bin one file passes and another fails', () => {
    expect([...mixedPassBins([new Set([1]), new Set([1, 2])])]).toEqual([2]);
  });
  it('is empty for one file or full agreement', () => {
    expect(mixedPassBins([new Set([1])]).size).toBe(0);
    expect(mixedPassBins([new Set([1]), new Set([1])]).size).toBe(0);
  });
});

describe('yield', () => {
  it('counts a die once by its hard bin and moves with the pass set', () => {
    const hardCounts = counts({ 1: 90, 2: 8, 7: 2 });
    const before = countYield([{ hardCounts, pass: effectivePass([1]) }]);
    const after = countYield([{ hardCounts, pass: effectivePass([1, 7]) }]);
    expect(yieldPercent(before)).toBe(90);
    expect(yieldPercent(after)).toBe(92);
  });
  it('has no yield without dies', () => {
    expect(yieldPercent(countYield([]))).toBeUndefined();
  });
  it('names rows by kind so hard 1 and soft 1 stay apart', () => {
    expect(binRowId('hard', 1)).not.toBe(binRowId('soft', 1));
  });
});

import { applyPassEntries } from './binEditor';

describe('applyPassEntries', () => {
  it('adds and removes pass bins and keeps them sorted', () => {
    expect(applyPassEntries([1], [{ bin: 7, type: 'hard', pass: true }, { bin: 1, type: 'hard', pass: false }])).toEqual([7]);
  });
  it('leaves a file that states none alone when no entry carries a flag', () => {
    expect(applyPassEntries(undefined, [{ bin: 7, type: 'hard', name: 'x' }])).toBeUndefined();
  });
  it('ignores soft bins', () => {
    expect(applyPassEntries([1], [{ bin: 1, type: 'soft', pass: false }])).toEqual([1]);
  });
});

import { countSampleBins, parsePassField, rowsWithEntries } from './binEditor';

describe('countSampleBins', () => {
  const sample: Record<string, string>[] = [{ hb: '1' }, { hb: '1' }, { hb: ' 5 ' }, { hb: '' }, { hb: 'x' }, { hb: '70000' }, { hb: '-3' }, { other: '9' }];
  it('counts whole bin numbers in the mapped column and skips the rest', () => {
    expect([...countSampleBins(sample, 'hb')]).toEqual([[1, 2], [5, 1]]);
  });
  it('is empty when no column is mapped', () => {
    expect(countSampleBins(sample, null).size).toBe(0);
  });
});

describe('parsePassField', () => {
  it('reads comma-separated numbers, dropping repeats and junk', () => {
    expect(parsePassField('1, 2,2, x, 7')).toEqual([1, 2, 7]);
    expect(parsePassField('')).toEqual([]);
  });
});

describe('rowsWithEntries', () => {
  const base = () => buildBinRows({ passHbins: [1], hardCounts: counts({ 1: 5, 2: 3 }), softCounts: counts({}) });
  it('makes earlier choices the starting state, so revert returns to them', () => {
    const m = new TableModel(rowsWithEntries(base(), [{ bin: 2, type: 'hard', name: 'Open', pass: true, color: '#ff0000' }]));
    expect(m.get('h2', 'name')).toBe('Open');
    expect(m.get('h2', 'pass')).toBe(true);
    expect(m.isEdited('h2')).toBe(false);
  });
  it('adds a row for a bin the sample lacked, in order', () => {
    const rows = rowsWithEntries(base(), [{ bin: 4, type: 'hard', name: 'Rare' }, { bin: 9, type: 'soft', name: 'S' }]);
    expect(rows.map(r => r.id)).toEqual(['h1', 'h2', 'h4', 's9']);
  });
  it('does not change the rows it was given', () => {
    const rows = base();
    rowsWithEntries(rows, [{ bin: 1, type: 'hard', name: 'X' }]);
    expect(rows[0].cells.name).toBeUndefined();
  });
});

describe('added bins keep the table in order', () => {
  it('lands a loaded bin among its own kind, hard before soft', () => {
    const m = modelOf();
    applyEntriesToModel(m, [{ bin: 5, type: 'hard', name: 'Five' }, { bin: 1, type: 'soft', name: 'S1' }]);
    expect(m.rows().map(r => r.id)).toEqual(['h1', 'h2', 'h5', 'h7', 's1', 's10']);
  });
});

import { unresolvedMixed } from './binEditor';

describe('Mixed bins start unknown, so any choice is a change', () => {
  const mixedModel = () => new TableModel(buildBinRows({
    passHbins: [1, 2], hardCounts: counts({ 1: 5, 2: 3 }), softCounts: counts({}), mixed: new Set([2]),
  }));

  it('leaves a Mixed bin’s pass cell unknown and the others as the lot has them', () => {
    const m = mixedModel();
    expect(m.get('h2', 'pass')).toBeUndefined();
    expect(m.get('h1', 'pass')).toBe(true);
  });

  it('counts choosing Pass as an edit even though the lot-wide set already holds the bin', () => {
    // The lot value is true; with the old start state this set was a no-op and the row stayed Mixed for ever.
    const m = mixedModel();
    m.set('h2', 'pass', true);
    expect(m.isEdited('h2')).toBe(true);
    expect(passEdited(m)).toBe(true);
    expect(rowsToState(m)).toMatchObject({ passChanged: true, passHbins: [1, 2] });
  });

  it('lets either choice be made and reverted to Mixed', () => {
    const m = mixedModel();
    m.set('h2', 'pass', false);
    expect(rowsToState(m).passHbins).toEqual([1]);
    m.revertRow('h2');
    expect(m.get('h2', 'pass')).toBeUndefined();
  });

  it('names the Mixed bins still unresolved, so a pass change can be refused', () => {
    const m = mixedModel();
    expect(unresolvedMixed(m)).toEqual([2]);
    m.set('h2', 'pass', true);
    expect(unresolvedMixed(m)).toEqual([]);
  });

  it('writes no flag for an unresolved Mixed bin', () => {
    expect(rowsToEntries(mixedModel().rows()).find(e => e.bin === 2)).toEqual({ bin: 2, type: 'hard' });
  });
});

describe('known bins', () => {
  it('lists a bin the counts leave out, as a superseded probe or an excluded die can', () => {
    const ids = new TableModel(buildBinRows({ hardCounts: counts({ 1: 5 }), softCounts: counts({}), knownHard: [1, 4], knownSoft: [9] })).rows().map(r => r.id);
    expect(ids).toEqual(['h1', 'h4', 's9']);
  });
});
