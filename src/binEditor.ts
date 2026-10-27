// The bin editor's model: what the table starts with, how a loaded file lands on it,
// what Save writes, and what Apply turns the table back into. Pure, so every rule
// here is tested without a DOM; `binEditorUI.ts` is the dialog over it.
//
// Rows are the union of the named bins (HBR/SBR or a definitions file), the bins the
// data actually carries, and the pass bins — so a CSV with bare numbers lists every
// bin it has and each can be named, which was the point of an editor over a file.

import type { BinDef } from '@wafertools/wafermap';
import type { BinDefEntry } from './binDefs';
import { TableModel, type TableRow } from './definitionsTable';

export type BinKind = 'hard' | 'soft';

export const binRowId = (type: BinKind, bin: number): string => `${type === 'hard' ? 'h' : 's'}${bin}`;

/** wmap counts bin 1 as the pass bin when nothing says otherwise. */
export const DEFAULT_PASS_BINS: readonly number[] = [1];

/** The pass set in effect for a file or lot that may have stated none. */
export function effectivePass(pass: readonly number[] | undefined): Set<number> {
  return new Set(pass?.length ? pass : DEFAULT_PASS_BINS);
}

export interface BinEditorInput {
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  passHbins?: number[];
  hardCounts: ReadonlyMap<number, number>;
  softCounts: ReadonlyMap<number, number>;
  /** Bins the data carries that the counts above may leave out (every probe of a retested die is in the file; only one counts). */
  knownHard?: Iterable<number>;
  knownSoft?: Iterable<number>;
  /**
   * Hard bins the loaded files disagree about. Their pass cell starts *unknown* (`undefined`), not as the lot's value, so that
   * choosing Pass or Fail is always a change from where the row started — the lot's value could equal the choice.
   */
  mixed?: ReadonlySet<number>;
}

export function buildBinRows(input: BinEditorInput): TableRow[] {
  const pass = effectivePass(input.passHbins);
  const rows: TableRow[] = [];
  const make = (type: BinKind, defs: BinDef[] | undefined, counts: ReadonlyMap<number, number>, extra: Iterable<number>) => {
    const named = new Map((defs ?? []).map(d => [d.bin, d]));
    const bins = new Set<number>([...named.keys(), ...counts.keys(), ...extra]);
    for (const bin of [...bins].sort((a, b) => a - b)) {
      const d = named.get(bin);
      rows.push({
        id: binRowId(type, bin),
        cells: {
          type,
          bin: String(bin),
          count: String(counts.get(bin) ?? 0),
          name: d?.name || undefined,
          pass: type === 'hard' && !input.mixed?.has(bin) ? pass.has(bin) : undefined,
          color: d?.color,
        },
      });
    }
  };
  make('hard', input.hbinDefs, input.hardCounts, [...(input.passHbins ?? []), ...(input.knownHard ?? [])]);
  make('soft', input.sbinDefs, input.softCounts, input.knownSoft ?? []);
  return rows;
}

/**
 * Hard bins the loaded files disagree about: counted pass by some file and fail by
 * another. One entry per file, in whatever order the caller holds them.
 */
export function mixedPassBins(filePasses: readonly Set<number>[]): Set<number> {
  const mixed = new Set<number>();
  if (filePasses.length < 2) return mixed;
  const all = new Set<number>(filePasses.flatMap(s => [...s]));
  for (const bin of all) {
    const votes = filePasses.filter(s => s.has(bin)).length;
    if (votes !== 0 && votes !== filePasses.length) mixed.add(bin);
  }
  return mixed;
}

const toBin = (r: TableRow) => parseInt(String(r.cells.bin), 10);

/** Hard bins before soft, then by number: the order the table lists them in. */
export function compareBinRows(a: TableRow, b: TableRow): number {
  if (a.cells.type !== b.cells.type) return a.cells.type === 'hard' ? -1 : 1;
  return toBin(a) - toBin(b);
}

/** Lay a definitions file over the table as edits; a bin the table lacks becomes a new row. */
export function applyEntriesToModel(model: TableModel, entries: readonly BinDefEntry[]): { changed: number; added: number } {
  let changed = 0, added = 0;
  for (const e of entries) {
    const id = binRowId(e.type, e.bin);
    if (!model.row(id)) {
      model.add({
        id,
        cells: {
          type: e.type, bin: String(e.bin), count: '0',
          name: e.name || undefined,
          pass: e.type === 'hard' ? (e.pass ?? false) : undefined,
          color: e.color,
        },
      }, compareBinRows);
      added++;
      continue;
    }
    const before = model.editedColumns(id).length;
    if (e.name !== undefined) model.set(id, 'name', e.name || undefined);
    if (e.color !== undefined) model.set(id, 'color', e.color);
    if (e.type === 'hard' && e.pass !== undefined) model.set(id, 'pass', e.pass);
    if (model.editedColumns(id).length !== before) changed++;
  }
  return { changed, added };
}

/** What Save writes: every row, with the pass flag only on hard bins. */
export function rowsToEntries(rows: readonly TableRow[]): BinDefEntry[] {
  return rows.map(r => {
    const type = r.cells.type as BinKind;
    const entry: BinDefEntry = { bin: toBin(r), type };
    if (r.cells.name) entry.name = String(r.cells.name);
    // An unresolved Mixed row states no flag: the files disagree and the table has not been told which is right.
    if (type === 'hard' && r.cells.pass !== undefined) entry.pass = r.cells.pass === true;
    if (r.cells.color) entry.color = String(r.cells.color);
    return entry;
  });
}

export interface BinApplyResult {
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  /** Replaces the lot-wide pass bins. Untouched (the caller's own) unless `passChanged`. */
  passHbins?: number[];
  passChanged: boolean;
}

/** Hard bins still showing Mixed: the files disagreed and no choice has been made. A pass change cannot be applied until none is left. */
export function unresolvedMixed(model: TableModel): number[] {
  return model.rows().filter(r => r.cells.type === 'hard' && r.cells.pass === undefined).map(toBin).sort((a, b) => a - b);
}

/** True when any row's pass flag differs from where it started. */
export function passEdited(model: TableModel): boolean {
  return model.editedIds().some(id => model.editedColumns(id).includes('pass'));
}

/**
 * The table as lot state. Names and colours come from the rows as they stand (a row
 * with neither is simply unnamed); the pass bins are the ticked hard rows, but only
 * when a pass flag was edited — otherwise whatever the files stated, including a
 * file's own differing set, is left exactly as it was.
 */
export function rowsToState(model: TableModel): BinApplyResult {
  const defs = (type: BinKind): BinDef[] | undefined => {
    const out = model.rows()
      .filter(r => r.cells.type === type && (r.cells.name || r.cells.color))
      .map(r => {
        const bin = toBin(r);
        const name = r.cells.name ? String(r.cells.name) : '';
        return r.cells.color ? { bin, name, color: String(r.cells.color) } : { bin, name };
      })
      .sort((a, b) => a.bin - b.bin);
    return out.length ? out : undefined;
  };
  const changed = passEdited(model);
  const pass = model.rows()
    .filter(r => r.cells.type === 'hard' && r.cells.pass === true)
    .map(toBin)
    .sort((a, b) => a - b);
  return {
    hbinDefs: defs('hard'),
    sbinDefs: defs('soft'),
    passHbins: changed ? (pass.length ? pass : undefined) : undefined,
    passChanged: changed,
  };
}

/** Pass and total dies, counting a die once by its hard bin. */
export interface YieldCount { pass: number; total: number }

export function countYield(items: ReadonlyArray<{ hardCounts: ReadonlyMap<number, number>; pass: ReadonlySet<number> }>): YieldCount {
  let pass = 0, total = 0;
  for (const it of items) {
    for (const [bin, n] of it.hardCounts) {
      total += n;
      if (it.pass.has(bin)) pass += n;
    }
  }
  return { pass, total };
}

export const yieldPercent = (y: YieldCount): number | undefined => (y.total > 0 ? (100 * y.pass) / y.total : undefined);

/**
 * A definitions file's pass flags laid over one file's pass bins (or the lot's). A file that stated
 * none stays that way unless the entries name a pass bin, so it keeps inheriting the lot-wide set.
 */
export function applyPassEntries(current: readonly number[] | undefined, entries: readonly BinDefEntry[]): number[] | undefined {
  const flagged = entries.filter(e => e.type === 'hard' && e.pass !== undefined);
  if (flagged.length === 0) return current ? [...current] : undefined;
  const set = new Set<number>(current ?? []);
  for (const e of flagged) { if (e.pass) set.add(e.bin); else set.delete(e.bin); }
  return set.size ? [...set].sort((a, b) => a - b) : undefined;
}

/**
 * Bin counts from the sample rows the column mapping holds, for one mapped bin column. The sample is the
 * first rows and some spread through the file, not all of it, so a rare bin can be missing here — the
 * editor can add one by number, and **Setup ▾ → Bin definitions…** lists every bin once the file is loaded.
 */
export function countSampleBins(sample: ReadonlyArray<Record<string, string>>, column: string | null): Map<number, number> {
  const counts = new Map<number, number>();
  if (!column) return counts;
  for (const row of sample) {
    const raw = (row[column] ?? '').trim();
    if (!/^-?\d+$/.test(raw)) continue;
    const n = Number(raw);
    if (n < 0 || n > 65534) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

/** The numbers in a comma-separated pass-bin field, in order and without repeats. */
export function parsePassField(value: string): number[] {
  const out: number[] = [];
  for (const part of value.split(',')) {
    const n = parseInt(part.trim(), 10);
    if (!isNaN(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Definitions already chosen (a loaded file, or an earlier visit to the editor) as the table's starting
 * state: they set the cells of rows that exist and add rows for the bins they name, so Revert goes back to
 * them rather than to nothing.
 */
export function rowsWithEntries(rows: readonly TableRow[], entries: readonly BinDefEntry[]): TableRow[] {
  const out = rows.map(r => ({ id: r.id, cells: { ...r.cells } }));
  const byId = new Map(out.map(r => [r.id, r]));
  for (const e of entries) {
    const id = binRowId(e.type, e.bin);
    let row = byId.get(id);
    if (!row) {
      row = { id, cells: { type: e.type, bin: String(e.bin), count: '0', name: undefined, pass: e.type === 'hard' ? false : undefined, color: undefined } };
      out.push(row);
      byId.set(id, row);
    }
    if (e.name !== undefined) row.cells.name = e.name || undefined;
    if (e.color !== undefined) row.cells.color = e.color;
    if (e.type === 'hard' && e.pass !== undefined) row.cells.pass = e.pass;
  }
  return out.sort(compareBinRows);
}
