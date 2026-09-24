// Pure, DOM-free utility functions extracted from main.ts for testability.

import type { LotMeta, MetaField, ParsedFile, TestDef, TestOverride, WaferData, WaferSource } from './types';
import type { RustParsedFile, StdfTestNames } from './platform';
import type { TestDef as WmapTestDef } from '@wafertools/wafermap';
import type { PlotMode, DerivedTestDef } from '@wafertools/wafermap';
import type { WaferMetadata } from '@wafertools/wafermap/renderer';
import type { WaferConfig, DieConfig, BinDef } from '@wafertools/wafermap';
import { displayValue, isHiddenField } from './metadata';
import { WCR_FLAT_SIDE, WCR_POS_X, WCR_POS_Y, WCR_UNITS, wcrCode } from './wcr';

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** File extension, with a `.gz` wrapper stripped to expose the inner format
 *  (`lot.stdf.gz` → `stdf`) — used everywhere a set of picked files needs to
 *  agree on format before dispatch. */
export function effectiveFileExtension(name: string): string {
  const parts = name.split('.');
  const ext = parts.pop()?.toLowerCase() ?? '';
  return ext === 'gz' ? (parts.pop()?.toLowerCase() ?? ext) : ext;
}

/** STDF or ATDF (by effective extension) — tester files, parsed per record by
 *  the Rust parsers rather than through a column mapping. The one copy of this
 *  test: main.ts and the file filter each used to spell it out inline. */
export function isTesterExt(ext: string): boolean {
  return ext === 'stdf' || ext === 'std' || ext === 'atdf' || ext === 'atd';
}

/** ATDF (by effective extension) — picks the ATDF parser over the STDF one. */
export function isAtdfExt(ext: string): boolean {
  return ext === 'atdf' || ext === 'atd';
}

/** The group a file's format belongs to for loading together. STDF and ATDF
 *  are one group: the same records in binary and text, dispatched per file to
 *  parsers that return the same shape. Every other format is its own group —
 *  CSV/JSON/Parquet share one column mapping per load, so mixing them, or
 *  mixing them with tester files, is not the same question. */
export function formatFamily(ext: string): string {
  return isTesterExt(ext) ? 'STDF/ATDF' : ext.toUpperCase();
}

/**
 * Checks that every file in `names` belongs to one format family (see
 * `formatFamily`) — the "you can't mix STDF and CSV in one load" rule, which
 * lets STDF and ATDF load together. Returns `null` when they agree (or when
 * `relaxed` is true, e.g. a zip whose extracted contents may legitimately be
 * mixed formats — `handleFiles`'s own `needsCleanup` case); otherwise a
 * ready-to-log error message naming the offending extensions.
 *
 * Extracted from `handleFiles` (main.ts) so the file-filter table's own
 * picker enforces the identical rule rather than a second copy of it — see
 * this repo's own "two copies of a rule is the bug" convention.
 */
export function checkSameExtension(names: string[], relaxed = false): string | null {
  const exts = [...new Set(names.map(effectiveFileExtension))];
  const families = new Set(exts.map(formatFamily));
  if (families.size > 1 && !relaxed) {
    return `Mixed formats not supported: ${exts.join(', ')} — STDF and ATDF can be loaded together, but not with other formats`;
  }
  return null;
}

/** Every extension tsmap can open, as the folder scan needs them — including
 *  the double forms, since a `.stdf.gz` is a data file and a bare `.gz` from
 *  somewhere else is not necessarily. Sent to the Rust `list_dir_files`
 *  command so this list stays the one source of truth rather than being
 *  restated there. Pickers use `DATA_PICKER_EXTENSIONS` below instead. */
export const DATA_FILE_EXTENSIONS = [
  'stdf', 'std', 'atdf', 'atd', 'csv', 'json', 'parquet',
  'stdf.gz', 'std.gz', 'atdf.gz', 'atd.gz', 'csv.gz', 'json.gz', 'parquet.gz',
  'zip',
] as const;

/** What a file PICKER offers for wafer data — single-part extensions only, the
 *  form both `<input accept>` and the File System Access API's `accept` take
 *  (the API rejects `.stdf.gz`; `.gz` covers every compressed format). Every
 *  web picker reads it: `#file-input` (main.ts sets its `accept` from this at
 *  start-up), the file filter's own input, and `pickWebFilesByPurpose`. The
 *  native desktop dialog's filter list is per-format and stays in platform.ts. */
export const DATA_PICKER_EXTENSIONS = [
  'stdf', 'std', 'atdf', 'atd', 'csv', 'json', 'parquet', 'gz', 'zip', 'txt', 'dat',
] as const;

/** Formats tsmap can dispatch a URL-sourced import to — mirrors
 *  `SUPPORTED_FORMATS` in `src-tauri/src/commands/fetch_url.rs`, and the set
 *  `effectiveExt`-based dispatch in `handleFiles` (main.ts) already handles.
 *  Backs both `--url-format` (desktop CLI) and `dataFormat` (web query param)
 *  — an explicit hint is required in both cases, never sniffed.
 *
 *  `zip` lets one URL carry several files (e.g. one STDF per lot); it takes the
 *  same expand-then-load route in `handleFiles` as a zip opened from disk. */
export const URL_IMPORT_FORMATS = ['stdf', 'atdf', 'csv', 'json', 'parquet', 'zip'] as const;
export type UrlImportFormat = typeof URL_IMPORT_FORMATS[number];

export function isUrlImportFormat(format: string): format is UrlImportFormat {
  return (URL_IMPORT_FORMATS as readonly string[]).includes(format.toLowerCase());
}

/**
 * Derives a display/dispatch filename for a URL-sourced import: the URL's
 * last non-empty path segment if there is one, else a generic fallback —
 * always forced to end in `.<format>` so `effectiveExt`-based dispatch in
 * `handleFiles` works regardless of what the URL itself looks like (a
 * presigned URL's path segment is often an opaque token, not a filename with
 * a real extension).
 */
export function deriveFileName(url: string, format: string): string {
  const fmt = format.toLowerCase();
  let stem = 'url-import';
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (last) stem = last.replace(/\.[^./]+$/, '') || last;
  } catch {
    // Malformed URL — fall back to the generic stem.
  }
  return `${stem}.${fmt}`;
}

/**
 * Escape a string for interpolation into an HTML template literal. Every value
 * that reaches an `innerHTML` template in this app is untrusted — column names,
 * wafer IDs and file names all come straight from user data — so anything
 * interpolated into markup must go through this.
 *
 * Lives here rather than in the two overlays that build markup that way
 * (`mappingUI`, `multiFileUI`) because it was previously defined, identically,
 * in both: two copies of an escaping rule is exactly the shape of bug where one
 * copy later gains a case the other doesn't.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Extracts a displayable message from a caught error. Tauri's `invoke()`
 * rejects with whatever the Rust command's `Err` serialises to — for
 * `Result<T, String>` that's a plain string, not an `Error` instance — so
 * `(e as Error).message` on it silently reads as `undefined` and swallows the
 * real diagnostic (this hid the root cause of a real bug once already). Use
 * this everywhere a caught value is turned into a log/toast message instead.
 *
 * The parser-backed commands now reject with `{ code, message }`
 * (`testdata_parser::error::ParseError`) rather than a bare string, and the WASM
 * path throws a real `Error` carrying the same `code`. Both land here: without
 * the object case a parse failure would reach the user as the JSON of its own
 * error object. Use `errCode` where the failure needs handling rather than
 * displaying.
 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (isCodedError(e)) return e.message;
  // JSON.stringify returns undefined — not a string — for undefined, a function
  // or a symbol, so the cast this function's signature implies was a lie for a
  // caught `undefined` (a `throw undefined`, or a promise rejected with no
  // reason). Anything that does not stringify falls through to String().
  try {
    const json = JSON.stringify(e);
    if (typeof json === 'string') return json;
  } catch { /* circular or a throwing toJSON — fall through */ }
  return String(e);
}

/** The shape both parser paths fail with: a stable code beside the prose. */
interface CodedError { code: string; message: string }

function isCodedError(e: unknown): e is CodedError {
  return typeof e === 'object' && e !== null
    && typeof (e as CodedError).code === 'string'
    && typeof (e as CodedError).message === 'string';
}

/**
 * The stable `code` of a caught parser failure, or undefined for anything else.
 *
 * Branch on this, never on the message: `'not-stdf'` (the file is not what its
 * extension claims), `'column-missing'` (the mapping names a column the file
 * lacks — recoverable by re-reading headers), `'gzip-invalid'`, `'file-read'`,
 * and so on. Messages are prose and may be reworded without notice.
 */
export function errCode(e: unknown): string | undefined {
  if (isCodedError(e)) return e.code;
  return undefined;
}

export function rustToLocal(r: RustParsedFile, fileName: string): ParsedFile {
  return {
    fileName, meta: r.meta, wafers: r.wafers, testDefs: r.testDefs,
    hbinDefs: r.hbinDefs, sbinDefs: r.sbinDefs, passHbins: r.passHbins,
    warnings: r.warnings,
  };
}

/**
 * Merges hard/soft bin-name lists across multiple parsed files (a multi-file
 * load or an append), deduping by bin number — a later list's entry for the
 * same bin overwrites an earlier one, mirroring the within-file HBR/SBR
 * "last wins" rule the Rust parser already applies (see `finish_bin_defs` in
 * `parse_stdf.rs`/`parse_atdf.rs`). Returns `undefined` when every input was
 * empty/absent, so `ParsedFile`'s "absent means nothing to show" convention
 * survives a merge rather than becoming a present-but-empty array.
 *
 * A bin's `color` follows the same "last wins" rule, except that a later entry
 * with no colour keeps an earlier one's — an HBR record never carries a colour,
 * so without that a second file would silently strip the colours a bin
 * definitions file had supplied.
 */
export function mergeBinDefs(lists: Array<BinDef[] | undefined>): BinDef[] | undefined {
  const byBin = new Map<number, BinDef>();
  for (const list of lists) {
    for (const d of list ?? []) {
      const color = d.color ?? byBin.get(d.bin)?.color;
      byBin.set(d.bin, color ? { bin: d.bin, name: d.name, color } : { bin: d.bin, name: d.name });
    }
  }
  if (byBin.size === 0) return undefined;
  return [...byBin.values()].sort((a, b) => a.bin - b.bin);
}

/**
 * One file's disagreement with another about a hard bin's pass/fail verdict.
 * A bin named differently is cosmetic; a bin classified differently moves the
 * yield of every wafer it appears on, which is why only this one is modelled.
 */
export interface PassBinCollision {
  bin: number;
  /** `[the file that counts it as pass, the file that counts it as fail]`. */
  files: [string, string];
}

/** The hard bins a file actually has an opinion about — every bin appearing on
 *  one of its dies, plus any it named in an HBR. A bin the file never saw is a
 *  bin it says nothing about. */
function knownHardBins(file: { wafers: WaferData[]; hbinDefs?: BinDef[] }): Set<number> {
  const bins = new Set<number>();
  for (const d of file.hbinDefs ?? []) bins.add(d.bin);
  for (const w of file.wafers) for (const r of w.results) if (r.hbin !== undefined) bins.add(r.hbin);
  return bins;
}

/**
 * Reconciles hard/soft bin names and pass-bin lists across a multi-file load.
 *
 * `mergePassHbins` (still used within a single file's own lists) **unions**,
 * which across files is unsafe in a way the bin-name merge is not: if bin 5 is a
 * pass bin in one file and a fail bin in another, the union makes it pass for
 * the whole lot and every yield figure, finding and report moves. A bin's
 * verdict is not a lot-wide property — it is whatever the file that produced
 * those dies said it was.
 *
 * So each file keeps its **own** `passHbins` — carried per wafer in `FileDefs`
 * and applied by `passBinsForWafer` (main.ts), which also owns the
 * states-nothing-inherits-the-union rule — and this returns the union only as
 * `passHbins`, for the lot-level surfaces that need one. Only two files that
 * both state, and disagree about a bin they have both seen, are a collision.
 *
 * STDF records only the pass flag (`if hbr.pass { pass_hbins.insert(...) }` in
 * `parse_stdf.rs`), so "this file calls bin 5 a fail" is not stored anywhere —
 * it is recovered here from the bin appearing on the file's own dies while
 * absent from its pass list, which is precisely how that file's own yield is
 * computed.
 */
export function unionBinInfo(
  files: Array<{
    fileName: string;
    wafers: WaferData[];
    hbinDefs?: BinDef[];
    sbinDefs?: BinDef[];
    passHbins?: number[];
  }>,
): {
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  passHbins?: number[];
  collisions: PassBinCollision[];
} {
  const hbinDefs = mergeBinDefs(files.map(f => f.hbinDefs));
  const sbinDefs = mergeBinDefs(files.map(f => f.sbinDefs));
  const passHbins = mergePassHbins(files.map(f => f.passHbins));

  const collisions: PassBinCollision[] = [];
  const seen = new Set<number>();
  const stating = files.filter(f => (f.passHbins?.length ?? 0) > 0);
  // Each file's known/pass sets are computed ONCE, not once per pair.
  // `knownHardBins` walks every die of every wafer, so building it inside the
  // double loop rescanned each file's whole population once per other file —
  // quadratic in files over a linear-in-dies scan, i.e. 7 files of 10k dies
  // doing ~400k redundant iterations on every load, and far worse for the large
  // batches the folder scan exists to support.
  const profile = stating.map(f => ({
    file: f, known: knownHardBins(f), pass: new Set(f.passHbins),
  }));
  for (const a of profile) {
    for (const b of profile) {
      if (a === b) continue;
      for (const bin of a.file.passHbins!) {
        if (seen.has(bin) || !b.known.has(bin) || b.pass.has(bin)) continue;
        seen.add(bin);
        collisions.push({ bin, files: [a.file.fileName, b.file.fileName] });
      }
    }
  }
  collisions.sort((x, y) => x.bin - y.bin);

  return { hbinDefs, sbinDefs, passHbins, collisions };
}

/**
 * One file's disagreement with another about what a test number means.
 * `files` names both sides in load order, so a message can say which two.
 */
export interface TestDefCollision {
  testNumber: string;
  /** `'name'`/`'units'`/`'testType'` mean different measurements; `'limits'` a different spec. */
  kind: 'name' | 'units' | 'testType' | 'limits';
  /**
   * EVERY distinct stated rendering of this test, with the first file to state
   * each, in load order.
   *
   * Deliberately not just the first disagreeing pair, which is what this
   * reported at first and which actively misled: given three lots defining test
   * 1001 as `leakage` (nA), `leakage_nA` (nA) and `vth_n_mV` (mV), naming only
   * the first two describes the mildest of the three disagreements and reads as
   * though the third file were not involved.
   */
  stated: Array<{ value: string; fileName: string }>;
}

/**
 * Unions every file's `testDefs` into one lot-wide list for the UI surfaces
 * that legitimately need one (the test-selection dialog, the test-list CSV,
 * `applyTestSelection`), and reports where the files disagree about what a
 * test number means.
 *
 * This replaced a bare `Object.assign({}, ...files.map(f => f.testDefs))`, which
 * is last-wins: loading a file whose test 1001 is `leakage_nA` (0-5 nA) after one
 * whose test 1001 is `vth_n_mV` (260-380 mV) silently discarded the second
 * definition, and every wafer in the lot was then plotted, normalised and
 * capability-scored against the survivor's limits. A test number identifies a
 * test *within a test program*, so across files it is not an identity at all.
 *
 * **First-wins here, deliberately** — the opposite of what it replaced. This
 * list only drives tsmap's own test-picking UI; wmap receives each wafer's own
 * file's defs and withholds any number the files disagree about, so no chart,
 * report or map mode reads the value chosen here. First-wins simply makes the
 * dialog stable as more files are appended.
 *
 * An absent field is "not stated", never a disagreement — a file with no limits
 * loaded alongside one with limits is an ordinary, valid combination and is not
 * reported. Only two *stated and different* values collide, matching wmap's
 * `mergeTestDefs` rule exactly so the two layers can never disagree about what
 * counts as a conflict.
 */
export function unionTestDefs(
  files: Array<{ fileName: string; testDefs: Record<string, TestDef> }>,
): { defs: Record<string, TestDef>; collisions: TestDefCollision[] } {
  const defs: Record<string, TestDef> = {};
  const owner: Record<string, string> = {};   // test number → the file that defined it first
  // test number → every distinct stated rendering, keyed by comparison key so a
  // later file restating the same thing does not add a duplicate entry.
  const statedByTest = new Map<string, { kind: TestDefCollision['kind']; seen: Map<string, { value: string; fileName: string }> }>();

  const stated = (v: string | undefined): string | undefined => {
    const t = v?.trim();
    return t ? t : undefined;
  };

  for (const file of files) {
    for (const [key, def] of Object.entries(file.testDefs)) {
      const first = defs[key];
      if (!first) { defs[key] = { ...def }; owner[key] = file.fileName; continue; }

      // Names compare case-insensitively and trimmed: TEST_TXT case and padding
      // drift between files for what is unambiguously the same test, and
      // treating that as a collision would withhold data over formatting.
      // Units do NOT — SI prefixes carry magnitude, so mV and MV are never the
      // same unit.
      const aName = stated(first.name), bName = stated(def.name);
      const aUnit = stated(first.units), bUnit = stated(def.units);
      let kind: TestDefCollision['kind'] | undefined;
      let values: [string, string] | undefined;
      if (aName && bName && aName.toLowerCase() !== bName.toLowerCase()) {
        kind = 'name'; values = [aName, bName];
      } else if (aUnit && bUnit && aUnit !== bUnit) {
        kind = 'units'; values = [aUnit, bUnit];
      } else if (first.testType !== def.testType) {
        // Parametric vs functional: one records a measurement, the other a
        // verdict. Not a spec difference — a different kind of test entirely.
        kind = 'testType'; values = [first.testType, def.testType];
      } else if (limitsDisagree(first, def)) {
        kind = 'limits';
        values = [limitText(first), limitText(def)];
      }
      if (kind && values) {
        // Accumulate rather than report-and-stop: a third file may disagree
        // differently again, and the reader needs all of it.
        let entry = statedByTest.get(key);
        if (!entry) {
          entry = { kind, seen: new Map() };
          entry.seen.set(compareKey(kind, values[0]), { value: values[0], fileName: owner[key] });
          statedByTest.set(key, entry);
        }
        // A name disagreement outranks a limits one for the same number: it says
        // the measurements differ, not merely their spec.
        if (entry.kind === 'limits' && kind !== 'limits') entry.kind = kind;
        const ck = compareKey(kind, values[1]);
        if (!entry.seen.has(ck)) entry.seen.set(ck, { value: values[1], fileName: file.fileName });
      }
      // Backfill only — a later file may state a limit or unit the first left
      // absent, which is a union, not an override.
      if (!first.name && bName) first.name = def.name;
      if (first.units === undefined && def.units !== undefined) first.units = def.units;
      if (first.loLimit === undefined && def.loLimit !== undefined) first.loLimit = def.loLimit;
      if (first.hiLimit === undefined && def.hiLimit !== undefined) first.hiLimit = def.hiLimit;
    }
  }
  const collisions: TestDefCollision[] = [...statedByTest.entries()].map(([testNumber, e]) => ({
    testNumber, kind: e.kind, stated: [...e.seen.values()],
  }));
  return { defs, collisions };
}

/** Names compare case-insensitively (TEST_TXT case drifts); everything else
 *  exactly. Mirrors the comparison used to detect the disagreement. */
function compareKey(kind: TestDefCollision['kind'], value: string): string {
  return kind === 'name' ? value.trim().toLowerCase() : value;
}

/** Relative tolerance, never `===` — the same nominal limit can arrive as a
 *  float32 STDF LO_LIMIT and a float64 CSV column, and the two differ in the
 *  last bits. Mirrors wmap `mergeTestDefs`'s tolerance for the same reason. */
function sameLimit(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return true;   // absent is not a disagreement
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b));
}

function limitsDisagree(a: TestDef, b: TestDef): boolean {
  return !sameLimit(a.loLimit, b.loLimit) || !sameLimit(a.hiLimit, b.hiLimit);
}

function limitText(d: TestDef): string {
  const lo = d.loLimit === undefined ? '' : String(d.loLimit);
  const hi = d.hiLimit === undefined ? '' : String(d.hiLimit);
  return `${lo}-${hi}${d.units ? ' ' + d.units : ''}`;
}

/** Unions pass-hard-bin lists across multiple parsed files, deduped and sorted. */
export function mergePassHbins(lists: Array<number[] | undefined>): number[] | undefined {
  const set = new Set<number>();
  for (const list of lists) for (const bin of list ?? []) set.add(bin);
  if (set.size === 0) return undefined;
  return [...set].sort((a, b) => a - b);
}

// ── Stable, collision-safe test numbers for CSV/JSON wide-format mapping ──────
// Mirrors testdata-parser's `test_identity.rs` (Rust, used for CSV/JSON
// long-format numbering) — same algorithm, independent implementation. The two
// don't need to agree numerically: wide-format numbers are assigned here, in
// TS, before the mapping ever reaches Rust; long-format numbers are computed
// entirely on the Rust side from data Rust alone sees. See that file's doc
// comment for the full rationale (numbering used to be assigned by column/
// encounter order, which silently renumbered every test on a reorder).

/** Kept out of this range on purpose — see test_identity.rs's matching
 *  constant: real STDF test numbers and the app's old sequential CSV/JSON
 *  scheme (1001, 1002, …) both live well under this. */
const RESERVED_BELOW = 1_000_000;

function fnv1a32(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Deterministic number for `identity`, guaranteed not to collide with any
 * value already in `used` (which is updated with the result) — so hashing
 * every test in one mapping through the same `used` set guarantees none of
 * them collide with each other, regardless of how unlikely a raw hash
 * collision would have been anyway.
 */
export function stableTestNumber(identity: string, used: Set<number>): number {
  let n = fnv1a32(identity);
  if (n < RESERVED_BELOW) n += RESERVED_BELOW;
  while (used.has(n)) {
    n = (n + 1) >>> 0;
    if (n < RESERVED_BELOW) n = RESERVED_BELOW;
  }
  used.add(n);
  return n;
}

/**
 * Wide-format test number for a column: if the column's own header is
 * itself a bare number (a common raw-export convention — e.g. columns
 * literally named "1001", "1002" with no descriptive name), that real
 * number is used as-is rather than hashing it away. A hashed number always
 * lands >= RESERVED_BELOW, so a genuine small number here can never collide
 * with one — the only possible collision is two columns both literally
 * named the same number, which falls back to hashing (rare; a real
 * ambiguity in the source file, not something to paper over silently).
 */
export function testNumberForColumn(col: string, used: Set<number>): number {
  const trimmed = col.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    // Must fit the Rust side's u32 (test_number) — a column literally named
    // a too-large number falls back to hashing rather than failing to parse.
    if (n <= 0xFFFFFFFF && !used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return stableTestNumber(col, used);
}

/**
 * Build a `WaferSource` provenance tag from a parsed file's lot metadata and
 * filename. One instance is created per loaded file and shared by reference
 * across all wafers it produced (see stamping in main.ts) — do not call this
 * per-wafer. The lot `fields` are carried verbatim (generic key/value); the
 * curation table in metadata.ts owns labels and which fields are surfaced.
 */
export function makeWaferSource(meta: LotMeta, sourceFile: string): WaferSource {
  return { sourceFile, fields: meta.fields ?? [] };
}

/**
 * Reconstruct a `WaferData` from a wafer-shaped object, carrying EVERY
 * `WaferData` field across. The rename/merge flow rebuilds wafers at several
 * points; routing them all through this one helper means adding a field to
 * `WaferData` is a single edit here, not N field-by-field copy sites that
 * silently drop the new field (per-wafer `fields` was lost exactly that way).
 * Preserves the shared `source` reference — do not deep-clone.
 */
export function toWaferData(w: Pick<WaferData, 'waferId' | 'results'> & Partial<WaferData>): WaferData {
  return {
    waferId: w.waferId,
    results: w.results,
    partCount: w.partCount,
    goodCount: w.goodCount,
    failCount: w.failCount,
    fields: w.fields,
    source: w.source,
  };
}

// Map raw metadata keys → wmap WaferMetadata named slots, so wmap renders them
// with its own nice labels. Unknown keys pass through verbatim via the open
// index signature, so nothing is lost. `temperature` is coerced to a number.
const WMAP_META_KEY: Record<string, keyof WaferMetadata> = {
  lotId: 'lot',
  partType: 'product',
  jobName: 'testProgram',
  startT: 'testDate',
  operName: 'operator',
  splitLabel: 'split',
  // WCR fields. wmap labels an open-index key by splitting its camelCase, so
  // the raw STDF abbreviations read as "Wafr Siz"/"Wf Flat" — these keys are
  // chosen to read correctly that way. Values are decoded by `displayValue`.
  wafrSiz: 'waferDiameter',
  dieWid: 'dieWidth',
  dieHt: 'dieHeight',
  wfFlat: 'waferFlat',
  centerX: 'centreDieX',
  centerY: 'centreDieY',
  posX: 'xIncreases',
  posY: 'yIncreases',
};

/**
 * Map a tsmap `WaferSource` (lot-level) plus optional per-wafer fields to
 * wmap's `WaferMetadata` (passed as `buildWaferMap({ waferConfig: { metadata } })`).
 * Known keys map to wmap's named slots; everything else flows through wmap's
 * open index signature. `waferFields` (e.g. a wafer's split assignment, see
 * `splits.ts`) is applied after `source.fields` so a per-wafer value wins
 * over a same-named lot-level one — previously omitted entirely, which meant
 * splits were invisible to wmap (its own summary panel/report had no way to
 * know a wafer's split; only tsmap's own separate charts code did, by
 * reading `getSplitLabel` directly instead of going through wmap's metadata).
 */
export function toWmapWaferMeta(source: WaferSource | undefined, waferId: string, waferFields?: MetaField[]): WaferMetadata | undefined {
  if (!source && !waferFields?.length) return undefined;
  const meta: WaferMetadata = { waferId };
  const all = [...(source?.fields ?? []), ...(waferFields ?? [])];
  // Same precedence as the loop below: the last occurrence (per-wafer) wins.
  const get = (k: string): string | undefined => {
    for (let i = all.length - 1; i >= 0; i--) if (all[i].key === k) return all[i].value;
    return undefined;
  };
  const applyField = ({ key, value }: MetaField) => {
    // Raw codes never reach wmap's panels: "Wf Units: 3" is the bug this
    // replaced. Hidden fields are carried inside others' display values.
    if (isHiddenField(key)) return;
    value = displayValue(key, value, get);
    if (key === 'testTemp') {
      const t = Number(value);
      if (Number.isFinite(t)) meta.temperature = t; else meta.testTemp = value;
    } else {
      const mapped = WMAP_META_KEY[key];
      meta[mapped ?? key] = value;
    }
  };
  for (const f of all) applyField(f);
  return meta;
}

export interface WcrGeometry {
  waferConfig: Partial<Pick<WaferConfig, 'diameter' | 'center' | 'notch'>>;
  dieConfig: Partial<Pick<DieConfig, 'width' | 'height' | 'xAxisDirection' | 'yAxisDirection'>>;
}

/**
 * Interprets a WCR (Wafer Configuration Record) already parsed into
 * `source.fields` by the Rust crate (`wcr_fields`/`WCR_KEYS` — raw values,
 * generic keys, same pattern as every other MIR/WIR/WRR field) into wmap's
 * `waferConfig`/`dieConfig` shape. This is the one place unit conversion and
 * wmap-shape mapping happen, so the crate itself never needs republishing
 * when either changes.
 *
 * Returns `null` when the file has no WCR record, or when everything it did
 * have was unusable (unknown units, or every field blank/sentinel) — callers
 * treat `null` exactly like "no WCR data," falling through to wmap's own
 * geometric inference unchanged.
 */
export function wcrGeometryFrom(source: WaferSource | undefined): WcrGeometry | null {
  const fields = source?.fields;
  if (!fields?.length) return null;
  const get = (key: string): string | undefined => fields.find(f => f.key === key)?.value;

  // STDF V4 defines WF_UNITS as 0 (unknown) through 4. Anything else means
  // the record was not read as the spec lays it out, and then no field in it
  // can be trusted — not even the unit-free centre, notch or axis directions.
  // The bundled sample, written with WCR's fields 2 bytes out of place, read
  // back as units 135 with a centre 17,000 dies away, and the map it drew
  // never finished rendering. 0 is legitimate: centre, notch and directions
  // need no units, only sizes do (and `toMm` drops those without them).
  const units = get('wfUnits');
  if (units !== undefined && wcrCode(WCR_UNITS, units) === undefined) return null;

  const mmPerUnit = wcrCode(WCR_UNITS, units)?.mmPerUnit;
  const toMm = (raw: string | undefined): number | undefined => {
    if (raw === undefined || mmPerUnit === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n * mmPerUnit : undefined;
  };

  const waferConfig: WcrGeometry['waferConfig'] = {};
  const dieConfig: WcrGeometry['dieConfig'] = {};

  const diameter = toMm(get('wafrSiz'));
  if (diameter !== undefined) waferConfig.diameter = diameter;

  const width = toMm(get('dieWid'));
  if (width !== undefined) dieConfig.width = width;
  const height = toMm(get('dieHt'));
  if (height !== undefined) dieConfig.height = height;

  const cx = get('centerX');
  const cy = get('centerY');
  if (cx !== undefined && cy !== undefined) {
    const x = Number(cx), y = Number(cy);
    if (Number.isFinite(x) && Number.isFinite(y)) waferConfig.center = { x, y };
  }

  const side = wcrCode(WCR_FLAT_SIDE, get('wfFlat'));
  if (side) waferConfig.notch = { type: side };

  const xDir = wcrCode(WCR_POS_X, get('posX'));
  if (xDir) dieConfig.xAxisDirection = xDir;
  const yDir = wcrCode(WCR_POS_Y, get('posY'));
  if (yDir) dieConfig.yAxisDirection = yDir;

  if (Object.keys(waferConfig).length === 0 && Object.keys(dieConfig).length === 0) return null;
  return { waferConfig, dieConfig };
}

/** Convert tsmap's `Record<string, TestDef>` to wmap's `TestDef[]`. */
export function toWmapTestDefs(testDefs: Record<string, TestDef>): WmapTestDef[] {
  return Object.entries(testDefs).map(([key, def]) => ({
    testNumber: Number(key),
    name: def.name || `Test ${key}`,
    unit: def.units,
    limitLow: def.loLimit,
    limitHigh: def.hiLimit,
    testType: def.testType,
  }));
}

/**
 * Derived-test rows of a test-definitions file (those with an `expression`) as
 * wmap's `derivedTests`. Undefined when there are none, so a lot without derived
 * tests builds exactly as before. The expression is passed through untouched:
 * wmap parses and validates it, and reports a rejected one by name.
 */
export function toWmapDerivedTests(
  entries: ReadonlyArray<{ num: number; expression?: string } & TestOverride>,
): DerivedTestDef[] | undefined {
  const out = entries
    .filter((e): e is typeof e & { expression: string } => e.expression !== undefined)
    .map(e => ({
      testNumber: e.num,
      name: e.name || `Derived ${e.num}`,
      unit: e.units,
      limitLow: e.loLimit,
      limitHigh: e.hiLimit,
      testType: e.testType,
      expression: e.expression,
    }));
  return out.length ? out : undefined;
}

export function autoPlotMode(wafers: WaferData[]): PlotMode {
  const sample = wafers[0]?.results ?? [];
  const hasHbin = sample.some(d => d.hbin !== undefined);
  const hasSbin = sample.some(d => d.sbin !== undefined);
  const hasValues = sample.some(d =>
    (d.testValues && Object.keys(d.testValues).length > 0) ||
    (d.testPass && Object.keys(d.testPass).length > 0));
  return hasHbin ? 'hardBin' : hasSbin ? 'softBin' : hasValues ? 'value' : 'hardBin';
}

/**
 * Merges per-test overrides (name/loLimit/hiLimit/units/testType) onto
 * `testDefs` in place. A field is only overwritten when the override
 * actually specifies it (`!== undefined`) — this is what lets a rename-only
 * override leave limits untouched, a limit-only override leave the name
 * untouched, etc. Overrides for test numbers not present in `testDefs` are
 * silently ignored.
 */
export function applyTestOverrides(
  testDefs: Record<string, TestDef>,
  overrides: Map<number, TestOverride>,
): void {
  for (const [num, ov] of overrides) {
    const key = String(num);
    if (!(key in testDefs)) continue;
    // Functional tests (FTR — pass/fail only) never have a numeric measured
    // value to check a spec limit against, so a loLimit/hiLimit override is
    // meaningless dead data there — silently drop it rather than carry it
    // into TestDef. Effective type is the override's own testType if this
    // row supplies one (an explicit reclassification), else the test's
    // existing parsed type.
    const effectiveType = ov.testType ?? testDefs[key].testType;
    const allowLimits = effectiveType !== 'F';
    testDefs[key] = {
      ...testDefs[key],
      ...(ov.name !== undefined ? { name: ov.name } : {}),
      ...(allowLimits && ov.loLimit !== undefined ? { loLimit: ov.loLimit } : {}),
      ...(allowLimits && ov.hiLimit !== undefined ? { hiLimit: ov.hiLimit } : {}),
      ...(ov.units !== undefined ? { units: ov.units } : {}),
      ...(ov.testType !== undefined ? { testType: ov.testType } : {}),
    };
  }
}

/**
 * Diffs two TestDefs for the fields TestOverride can carry, returning only
 * the fields that actually differ (or `undefined` if none do). Used to seed
 * a fresh selector re-open with whatever overrides are already baked into
 * `current` but not reflected in `original` (e.g. re-opening "Tests…"
 * after an earlier rename/limit-load pass).
 */
export function diffTestOverride(current: TestDef, original: TestDef): TestOverride | undefined {
  const ov: TestOverride = {};
  if (current.name !== original.name) ov.name = current.name;
  if (current.loLimit !== original.loLimit) ov.loLimit = current.loLimit;
  if (current.hiLimit !== original.hiLimit) ov.hiLimit = current.hiLimit;
  if (current.units !== original.units) ov.units = current.units;
  if (current.testType !== original.testType) ov.testType = current.testType;
  return Object.keys(ov).length ? ov : undefined;
}

/**
 * Prune, backfill, and apply test overrides to a parsed file's testDefs and
 * die testValues after a filtered parse.
 *
 * - Prunes testDefs and per-die testValues to only the selected test numbers.
 * - Backfills any selected tests missing from testDefs (stop-on-fail gap) from
 *   firstPassDefs when provided.
 * - Applies testOverrides on top of whatever was in testDefs (see applyTestOverrides).
 *
 * Mutates `parsed` in place and returns it.
 */
export function applyTestSelection(
  parsed: ParsedFile,
  selection: number[],
  firstPassDefs: StdfTestNames | null,
  testOverrides: Map<number, TestOverride>,
): ParsedFile {
  const selectionSet = new Set(selection.map(String));

  // Prune testDefs to selection.
  for (const key of Object.keys(parsed.testDefs)) {
    if (!selectionSet.has(key)) delete parsed.testDefs[key];
  }

  // Prune per-die testValues and testPass to selection.
  for (const wafer of parsed.wafers) {
    for (const die of wafer.results) {
      if (die.testValues) {
        for (const key of Object.keys(die.testValues)) {
          if (!selectionSet.has(key)) delete die.testValues[Number(key)];
        }
      }
      if (die.testPass) {
        for (const key of Object.keys(die.testPass)) {
          if (!selectionSet.has(key)) delete die.testPass[Number(key)];
        }
      }
    }
  }

  // Backfill selected tests missing due to stop-on-fail.
  if (firstPassDefs) {
    for (const key of selection.map(String)) {
      if (!(key in parsed.testDefs) && key in firstPassDefs) {
        parsed.testDefs[key] = firstPassDefs[key];
      }
    }
  }

  applyTestOverrides(parsed.testDefs, testOverrides);

  return parsed;
}

/**
 * Dies the browser build can be relied on to open.
 *
 * Measured in Chrome on 2026-09-19: the web build
 * parses in a Worker and the result is structured-cloned to the main thread, so
 * two copies are live and the ceiling is total heap. A lot is roughly 5 KB of JS
 * heap per die — about 12 KB where the data carries per-test pass/fail verdicts —
 * and the tab dies somewhere above 2 GB per copy.
 *
 * Measured outcomes, which this one number classifies correctly:
 *
 * | lot | result |
 * | --- | --- |
 * | 200,000 dies × 50 tests | loads, 6.3 s |
 * | 200,000 × 100 tests | loads, 13.6 s |
 * | 266,325 × 51 (341 MB STDF) | **tab crashes** |
 * | 400,000 × 50 | **tab crashes** |
 *
 * Thresholded on die count alone, not `dies × tests`: the per-die cost is
 * dominated by the test-value CONTAINER rather than by the values in it, so
 * 200k × 100 tests loads while 400k × 50 — the same cell count — does not. A
 * `dies × tests` budget would get that pair exactly backwards.
 *
 * The "~2.8 KB fixed + ~0.044 KB per test" split this used to quote is not a
 * property of a die; it was one point on a range. `testValues` is a plain
 * object keyed by test number, V8 stores integer-like keys as array indices,
 * and the same 50 readings occupy 6,108 B, 1,560 B or 336 B depending on the
 * representation the object lands in — two files with identical test numbers
 * measured 3.9x apart (2026-09-20, heap snapshot). The threshold above is
 * unaffected, and better
 * explained: die count is the right axis precisely because the container
 * dominates and one more test costs little.
 *
 * **The number 200,000 has NOT been re-derived** against data with realistic
 * test numbers — every fixture behind the table above is synthetic with test
 * numbers near 1,000–2,000. Do not move it without doing that first.
 *
 * Deliberately not a hard block. The edge moves with whatever else the machine is
 * doing: a 143 MB lot that crashed on one run of this machine loaded on another.
 * Refusing a lot that would have worked is worse than warning about one that
 * might not, so the user is told the number and left to decide.
 */
export const WEB_DIE_BUDGET = 200_000;

/**
 * Total dies in a lot above which the gallery is mounted **progressively** —
 * `renderWaferGallery` is handed item factories rather than pre-built items, so
 * it builds one card per task instead of all of them in one blocking call.
 *
 * Thresholded on total dies across the lot, one number, because that is what
 * the mount's cost actually tracks: per-card work scales with that card's dies
 * and the lot panel's single render scales with the pooled total. Wafer count
 * alone gets it wrong in both directions — 4 wafers of 4,000 dies blocks longer
 * (460 ms) than 25 wafers of 500 (340 ms).
 *
 * Measured in Chrome on the T14s, tsmap's own gallery options, synchronous
 * mount vs progressive:
 *
 * | lot | total dies | sync BLOCKS | progressive: 1st card / all cards |
 * | --- | --- | --- | --- |
 * | 3w x 500d | 1,500 | 115 ms | 69 ms / 115 ms |
 * | 8w x 500d | 4,000 | 124 ms | 39 ms / 163 ms |
 * | 25w x 500d | 12,500 | 340 ms | 47 ms / 527 ms |
 * | 4w x 4,000d | 16,000 | 460 ms | 113 ms / 427 ms |
 * | 13w x 4,000d | 52,000 | 1,393 ms | 172 ms / 845 ms |
 * | 50w x 8,000d | 400,000 | 22,600 ms | ~150 ms / 7,740 ms |
 *
 * **The progressive path is never the slower choice in any way that matters** —
 * above ~16k dies it wins on total time as well, because the synchronous path
 * redraws every card once more than it needs to. So this threshold is not
 * protecting against a cost; it is avoiding a needless *behaviour* change.
 * Below it the synchronous mount is under ~200 ms, which reads as instant, and
 * the gallery appears in one paint. Progressive mounting there would trade that
 * single clean paint for a flash of "…" placeholders, and would settle the lot
 * summary panel a beat after the cards, to fix a freeze nobody perceived.
 *
 * Above it the block grows without bound (22.6 s at 400k dies, which is where
 * the browser offers to kill the page), and staged cards with a progress bar
 * beat a frozen tab.
 *
 * Nothing about this number is specific to tsmap; it describes wmap's per-card
 * build cost. The gallery should arguably apply it itself rather than every host
 * repeating the judgement.
 */
export const GALLERY_PROGRESSIVE_DIE_THRESHOLD = 10_000;

/**
 * Should this lot be mounted progressively? See
 * {@link GALLERY_PROGRESSIVE_DIE_THRESHOLD}.
 *
 * A single card is never progressive: there is nothing to stage, so it would
 * only defer the same work by a task and show a placeholder on the way.
 */
export function shouldMountProgressively(dieCounts: readonly number[]): boolean {
  if (dieCounts.length < 2) return false;
  let total = 0;
  for (const n of dieCounts) total += n;
  return total >= GALLERY_PROGRESSIVE_DIE_THRESHOLD;
}

/**
 * Warning to show before loading `dieCount` dies in the browser build, or null
 * when the lot is within budget (or the count is unknown, which is no basis to
 * judge).
 *
 * Desktop callers should not call this: the native path has no worker, no clone
 * and no ceiling — it opens the 266k-die lot in 1.4 s.
 */
export function webDieBudgetWarning(dieCount: number): string | null {
  if (!Number.isFinite(dieCount) || dieCount <= WEB_DIE_BUDGET) return null;
  return `This lot has ${dieCount.toLocaleString()} dies. The browser version reliably opens `
    + `about ${WEB_DIE_BUDGET.toLocaleString()}; above that the tab can run out of memory and `
    + `reload, losing the load. The desktop app has no such limit — it opens a lot this size in `
    + `a couple of seconds. Loading fewer wafers, or fewer files at once, also keeps you under it.`;
}
