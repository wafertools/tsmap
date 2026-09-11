// Wafer splits: a user-assigned grouping axis (process corners like TT/FF/FS,
// or any ad-hoc experiment group) layered on top of the existing metadata
// faceting system. A split is stored as an ordinary per-wafer MetaField, so
// `buildFacetTable` (metadata.ts) picks it up for free and every existing
// grouped chart works with zero changes — this module only owns get/set,
// enumerating known values, and CSV round-trip.

import type { WaferData } from './types';
import { facetValueOf, labelFor, NONE_VALUE } from './metadata';

export const SPLIT_FIELD_KEY = 'splitLabel';

/** The split assigned to a wafer, if any. Per-wafer only — never `source.fields`,
 * since a split lot puts different wafers from the same file through different
 * conditions. */
export function getSplitLabel(wafer: WaferData): string | undefined {
  return wafer.fields?.find(f => f.key === SPLIT_FIELD_KEY)?.value;
}

// ── Wafer identity ────────────────────────────────────────────────────────────
//
// A wafer ID is NOT unique across what tsmap can load. Two lots both have a
// W01; one STDF can carry the same wafer twice (a retest pass writes a second
// WIR/WRR with the same ID). Everything that needs to tell loaded wafers apart
// — card labels, saved split assignments, splits CSV rows — goes through the
// helpers below, so "which wafer is this" has one answer.

type IdentityWafer = Pick<WaferData, 'waferId' | 'fields' | 'source'>;

/** A wafer's lot ID — its own field first (a flat file can carry several lots),
 *  then its file's. */
export function waferLotId(wafer: IdentityWafer): string | undefined {
  const v = wafer.fields?.find(f => f.key === 'lotId')?.value
    ?? wafer.source?.fields.find(f => f.key === 'lotId')?.value;
  return v ? v : undefined;
}

export interface WaferIdentity {
  lotId?: string;
  waferId: string;
  /** 1-based position among the loaded wafers sharing this lot + wafer ID, in
   *  load order. 1 for all but a genuine repeat (e.g. a retest in one file). */
  occurrence: number;
}

/** Identities, index-parallel with `wafers`. */
export function waferIdentities(wafers: readonly IdentityWafer[]): WaferIdentity[] {
  const seen = new Map<string, number>();
  return wafers.map(w => {
    const lotId = waferLotId(w);
    const pair = `${lotId ?? ''}${KEY_SEP}${w.waferId}`;
    const occurrence = (seen.get(pair) ?? 0) + 1;
    seen.set(pair, occurrence);
    return { lotId, waferId: w.waferId, occurrence };
  });
}

// NUL cannot occur in a lot or wafer ID from any parser — see FIELD_SEP below.
const KEY_SEP = '\u0000';

/** The persistence key for one wafer's split — lot, wafer ID and occurrence.
 *  Always contains KEY_SEP, which is how it is told apart from the bare-wafer-ID
 *  keys earlier builds wrote. */
export function waferIdentityKey(id: WaferIdentity): string {
  return [id.lotId ?? '', id.waferId, String(id.occurrence)].join(KEY_SEP);
}

const countOf = (values: string[]) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};

/** Per-wafer fields that never disambiguate a label: identity and the split
 *  (which `showSplit` appends on its own terms). */
const NOT_A_LABEL_FIELD = new Set(['lotId', 'waferId', SPLIT_FIELD_KEY]);

/**
 * For each group of wafers still sharing a label, append the per-wafer fields
 * whose values differ within that group — `W01 · Temperature 85` for the same
 * wafer tested at two temperatures in one file. Only the wafer's own fields
 * count: they are what the parser found varying per wafer, whereas file-level
 * fields that differ are better told apart by file name.
 */
function byDifferingFields(wafers: readonly IdentityWafer[], labels: string[]): string[] {
  const groups = new Map<string, number[]>();
  labels.forEach((l, i) => groups.set(l, [...(groups.get(l) ?? []), i]));
  const out = [...labels];
  for (const [label, idx] of groups) {
    if (idx.length < 2) continue;
    const keys = [...new Set(idx.flatMap(i => (wafers[i].fields ?? []).map(f => f.key)))]
      .filter(k => !NOT_A_LABEL_FIELD.has(k));
    const value = (i: number, k: string) =>
      facetValueOf(wafers[i] as WaferData, k) ?? NONE_VALUE;
    const differing = keys.filter(k => new Set(idx.map(i => value(i, k))).size > 1);
    if (!differing.length) continue;
    for (const i of idx) {
      out[i] = `${label} · ${differing.map(k => `${labelFor(k)} ${value(i, k)}`).join(', ')}`;
    }
  }
  return out;
}

/**
 * Labels for map/gallery titles and cards, index-parallel with `wafers` and
 * unique among them. A wafer ID that no other loaded wafer shares is shown
 * as-is; a shared one gains what tells the wafers apart — the lot ID first
 * (`LOT-A · W01`), then any per-wafer field that differs (`W01 · Temperature
 * 85`), then the source file, and as a last resort the load order (`#2`). Then " · <split>" when `showSplit` is on and a split is assigned.
 *
 * Display only. Never use a label as a lookup key, and never write one into
 * wafer metadata: reports and exports must carry the real wafer ID. Keys come
 * from `waferIdentities`.
 */
export function waferLabels(wafers: readonly IdentityWafer[], showSplit: boolean): string[] {
  const idCount = countOf(wafers.map(w => w.waferId));
  const byLot = wafers.map(w => {
    if (idCount.get(w.waferId) === 1) return w.waferId;
    const lot = waferLotId(w);
    // A rename-step ID like "LOT-A · W01" already names its lot.
    return lot && !w.waferId.includes(lot) ? `${lot} · ${w.waferId}` : w.waferId;
  });
  const byField = byDifferingFields(wafers, byLot);
  const fieldCount = countOf(byField);
  const byFile = byField.map((l, i) => {
    const file = wafers[i].source?.sourceFile;
    return fieldCount.get(l)! > 1 && file ? `${l} (${file})` : l;
  });
  const fileCount = countOf(byFile);
  const nth = new Map<string, number>();
  return byFile.map((l, i) => {
    let label = l;
    if (fileCount.get(l)! > 1) {
      const n = (nth.get(l) ?? 0) + 1;
      nth.set(l, n);
      label = `${l} #${n}`;
    }
    const split = showSplit ? getSplitLabel(wafers[i] as WaferData) : undefined;
    return split ? `${label} · ${split}` : label;
  });
}

/** One wafer on its own — the raw ID, plus " · <split>" when opted in. For a
 *  set of wafers use `waferLabels`, which also keeps shared IDs apart. */
export function waferDisplayLabel(wafer: WaferData, showSplit: boolean): string {
  return waferLabels([wafer], showSplit)[0];
}

/** Assigned splits for persistence, keyed by `waferIdentityKey`. */
export function splitAssignments(wafers: WaferData[]): Record<string, string> {
  const ids = waferIdentities(wafers);
  const out: Record<string, string> = {};
  wafers.forEach((w, i) => {
    const v = getSplitLabel(w);
    if (v) out[waferIdentityKey(ids[i])] = v;
  });
  return out;
}

/**
 * Apply saved assignments to wafers that have no split yet. Returns whether any
 * was applied.
 *
 * Entries written by earlier builds are keyed on the bare wafer ID. One is
 * honoured only when that ID names exactly one loaded wafer: with two lots'
 * W01 loaded, it cannot say which it meant, and applying it to both is how one
 * lot came to inherit another's split. Such an entry is left unapplied and is
 * replaced by identity-keyed ones on the next save.
 */
export function restoreSplitAssignments(wafers: WaferData[], saved: Record<string, string>): boolean {
  const ids = waferIdentities(wafers);
  const idCount = countOf(wafers.map(w => w.waferId));
  let applied = false;
  wafers.forEach((w, i) => {
    if (getSplitLabel(w) !== undefined) return;
    const byIdentity = saved[waferIdentityKey(ids[i])];
    const legacy = idCount.get(w.waferId) === 1 ? saved[w.waferId] : undefined;
    const v = byIdentity ?? legacy;
    if (v) { setSplitLabel(w, v); applied = true; }
  });
  return applied;
}

/** Assign (or clear, with `undefined`/empty) a wafer's split. Mutates in place,
 * consistent with how `wafer.fields` is already built and passed by reference. */
export function setSplitLabel(wafer: WaferData, label: string | undefined): void {
  const trimmed = label?.trim();
  const fields = wafer.fields ?? (wafer.fields = []);
  const idx = fields.findIndex(f => f.key === SPLIT_FIELD_KEY);
  if (!trimmed) {
    if (idx >= 0) fields.splice(idx, 1);
    return;
  }
  if (idx >= 0) fields[idx] = { key: SPLIT_FIELD_KEY, value: trimmed };
  else fields.push({ key: SPLIT_FIELD_KEY, value: trimmed });
}

/** Clear every wafer's split assignment (the "Clear all" action in the splits
 * modal — distinct from clearing just the currently-selected rows). */
export function clearAllSplits(wafers: WaferData[]): void {
  for (const w of wafers) setSplitLabel(w, undefined);
}

/** Identity key for a wafer set, used to auto-restore split assignments when
 * re-opening the same lot later (see `loadSavedSplits`/`saveSplits` in
 * main.ts). Keyed on lot ID + part type + wafer ID — the physical wafer's
 * identity — rather than the source file, since a single lot is often split
 * across several files (e.g. one per test temperature) that should all
 * restore the same assignments despite different file names/sizes. Falls
 * back to wafer ID alone when no lot metadata is present (CSV/JSON with
 * nothing mapped) — the same weaker guarantee as before, but only for
 * sources with no lot identity to key on in the first place. */
// Field and wafer separators for the fingerprint. NUL and newline cannot occur
// in a lot ID, part type or wafer ID coming out of any of the parsers, so the
// encoding is unambiguous. The previous version concatenated the three fields
// with nothing between them and joined wafers with a space, which collided in
// two ways: `lot=AB part=C` and `lot=A part=BC` both produced "ABC01", and a lot
// ID containing a space (`LOT 1`, which is ordinary) blurred the boundary
// between one wafer's token and the next.
const FIELD_SEP = '\u0000';
const WAFER_SEP = '\n';

/**
 * A stable key for "this set of physical wafers", so splits assigned once are
 * restored when the same lot is reopened — even from a differently named file,
 * or split across several files (one per test temperature, say).
 *
 * **Returns `null` when the wafers carry no lot identity**, and callers must
 * then neither save nor restore. Without a lot ID the key degenerates to the
 * wafer IDs alone, and two unrelated files that both contain W01–W03 — the
 * ordinary case for a CSV export with no lot column — become indistinguishable.
 * The second lot would silently inherit the first lot's splits, re-labelling
 * every chart grouping, map title and report on data it knows nothing about.
 * A convenience is not worth that, so the identity is refused rather than
 * guessed: the splits are still assignable and still savable to CSV, they are
 * simply not remembered between sessions.
 *
 * Requires a lot ID on EVERY wafer, not merely one of them. A multi-file load
 * can mix a labelled STDF with an unlabelled CSV, and a key covering only the
 * identifiable half would still match the wrong thing.
 */
export function splitsFingerprint(wafers: WaferData[]): string | null {
  if (wafers.length === 0) return null;
  const tokens: string[] = [];
  for (const w of wafers) {
    const lotId = facetValueOf(w, 'lotId');
    if (!lotId) return null;
    tokens.push([lotId, facetValueOf(w, 'partType') ?? '', w.waferId].join(FIELD_SEP));
  }
  return tokens.sort().join(WAFER_SEP);
}

/**
 * The key shape written by builds before 0.1.34, so an entry saved by one can
 * be found and moved to the current key rather than silently becoming
 * unreachable. Ambiguous by construction — that is why it was replaced — but
 * recomputing it from the same wafers is exact, so the migration itself is
 * sound. Only used when a *valid* current fingerprint exists to move it to.
 */
export function legacySplitsFingerprint(wafers: WaferData[]): string {
  return wafers
    .map(w => `${facetValueOf(w, 'lotId') ?? ''}${facetValueOf(w, 'partType') ?? ''}${w.waferId}`)
    .sort()
    .join(' ');
}

/** Distinct split values currently in use, first-seen order — for populating
 * the assignment combobox with existing names before the user types a new one. */
export function listSplitValues(wafers: WaferData[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of wafers) {
    const v = getSplitLabel(w);
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/** One row of a splits CSV. `lotId`/`occurrence` are absent when the file does
 *  not give them (every file written before they existed). `split` is `''` for
 *  an explicitly unassigned row, so "cleared" differs from "not mentioned". */
export interface SplitRow {
  lotId?: string;
  waferId: string;
  occurrence?: number;
  split: string;
}

const HEADER_COLUMN: Record<string, keyof SplitRow> = {
  lot: 'lotId', lotid: 'lotId',
  wafer: 'waferId', waferid: 'waferId',
  occurrence: 'occurrence',
  split: 'split',
};

/**
 * Parse a splits CSV. Two shapes are read:
 * - `lot,waferId,occurrence,split` (any order, by header) — what this build
 *   writes; lot and occurrence may be blank.
 * - `waferId,split`, with or without that header — every earlier file.
 * Comment lines (`#`) and blank lines are skipped, as are rows with no wafer ID.
 */
export function parseSplitsCsv(text: string): SplitRow[] {
  const rows: SplitRow[] = [];
  let columns: Array<keyof SplitRow | undefined> = ['waferId', 'split'];
  let headerSeen = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(',').map(c => c.trim());
    if (!headerSeen) {
      headerSeen = true;
      const mapped = cells.map(c => HEADER_COLUMN[c.toLowerCase()]);
      if (mapped.includes('waferId')) { columns = mapped; continue; }
    }
    if (cells.length < 2) continue;
    const get = (k: keyof SplitRow) => {
      const i = columns.indexOf(k);
      return i >= 0 ? cells[i] ?? '' : '';
    };
    const waferId = get('waferId');
    if (!waferId) continue;
    const lotId = get('lotId') || undefined;
    const occ = parseInt(get('occurrence'), 10);
    rows.push({
      waferId,
      split: get('split'),
      ...(lotId ? { lotId } : {}),
      ...(Number.isFinite(occ) && occ > 0 ? { occurrence: occ } : {}),
    });
  }
  return rows;
}

/** Serialize every loaded wafer's split to CSV. Lot is written whenever a
 *  wafer has one; occurrence only for a genuine repeat of lot + wafer ID. */
export function formatSplitsCsv(wafers: WaferData[]): string {
  const ids = waferIdentities(wafers);
  const repeated = countOf(ids.map(id => `${id.lotId ?? ''}${KEY_SEP}${id.waferId}`));
  const lines = [
    '# tsmap wafer splits',
    `# Saved: ${new Date().toISOString()}`,
    'lot,waferId,occurrence,split',
    ...wafers.map((w, i) => {
      const id = ids[i];
      const occ = repeated.get(`${id.lotId ?? ''}${KEY_SEP}${id.waferId}`)! > 1 ? String(id.occurrence) : '';
      return [id.lotId ?? '', w.waferId, occ, getSplitLabel(w) ?? ''].join(',');
    }),
  ];
  return lines.join('\n');
}

export interface SplitMatch {
  /** Index into `wafers` → split to apply (`''` = clear). */
  assignments: Array<{ index: number; split: string }>;
  unmatched: number;
  /** Rows naming a wafer ID several loaded wafers share, without the lot (or
   *  occurrence) to say which — skipped, never applied to all of them. */
  ambiguous: number;
}

/** Resolve CSV rows to loaded wafers by lot, wafer ID and occurrence, as far
 *  as each row states them. */
export function matchSplitRows(wafers: readonly IdentityWafer[], rows: SplitRow[]): SplitMatch {
  const ids = waferIdentities(wafers);
  const out: SplitMatch = { assignments: [], unmatched: 0, ambiguous: 0 };
  for (const row of rows) {
    const hits: number[] = [];
    ids.forEach((id, i) => {
      if (id.waferId !== row.waferId) return;
      if (row.lotId !== undefined && id.lotId !== row.lotId) return;
      if (row.occurrence !== undefined && id.occurrence !== row.occurrence) return;
      hits.push(i);
    });
    if (hits.length === 0) out.unmatched++;
    else if (hits.length > 1) out.ambiguous++;
    else out.assignments.push({ index: hits[0], split: row.split });
  }
  return out;
}

/** Apply CSV rows to the loaded wafers. See `matchSplitRows`. */
export function applySplitRows(wafers: WaferData[], rows: SplitRow[]): { matched: number; unmatched: number; ambiguous: number } {
  const m = matchSplitRows(wafers, rows);
  for (const { index, split } of m.assignments) setSplitLabel(wafers[index], split || undefined);
  return { matched: m.assignments.length, unmatched: m.unmatched, ambiguous: m.ambiguous };
}

/** CSV rows as persistence entries (`waferIdentityKey` → split), without
 *  touching the wafers — for seeding a saved record from a bundled CSV. */
export function splitRowsToAssignments(wafers: readonly IdentityWafer[], rows: SplitRow[]): Record<string, string> {
  const ids = waferIdentities(wafers);
  const out: Record<string, string> = {};
  for (const { index, split } of matchSplitRows(wafers, rows).assignments) {
    if (split) out[waferIdentityKey(ids[index])] = split;
  }
  return out;
}
