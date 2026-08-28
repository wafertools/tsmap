// Pure, DOM-free utility functions extracted from main.ts for testability.

import type { LotMeta, MetaField, ParsedFile, TestDef, TestOverride, WaferData, WaferSource } from './types';
import type { RustParsedFile, StdfTestNames } from './platform';
import type { TestDef as WmapTestDef } from '@wafertools/wafermap';
import type { PlotMode } from '@wafertools/wafermap';
import type { WaferMetadata } from '@wafertools/wafermap/renderer';
import type { WaferConfig, DieConfig, BinDef } from '@wafertools/wafermap';

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

/**
 * Checks that every file in `names` shares the same effective extension
 * (see `effectiveFileExtension`) — the "you can't mix STDF and CSV in one
 * load" rule. Returns `null` when they agree (or when `relaxed` is true,
 * e.g. a zip whose extracted contents may legitimately be mixed formats —
 * `handleFiles`'s own `needsCleanup` case); otherwise a ready-to-log error
 * message naming the offending extensions.
 *
 * Extracted from `handleFiles` (main.ts) so the file-filter table's own
 * picker enforces the identical rule rather than a second copy of it — see
 * this repo's own "two copies of a rule is the bug" convention.
 */
export function checkSameExtension(names: string[], relaxed = false): string | null {
  const exts = [...new Set(names.map(effectiveFileExtension))];
  if (exts.length > 1 && !relaxed) {
    return `Mixed formats not supported: ${exts.join(', ')} — please select files of the same type`;
  }
  return null;
}

/** Formats tsmap can dispatch a URL-sourced import to — mirrors
 *  `SUPPORTED_FORMATS` in `src-tauri/src/commands/fetch_url.rs`, and the set
 *  `effectiveExt`-based dispatch in `handleFiles` (main.ts) already handles.
 *  Backs both `--url-format` (desktop CLI) and `dataFormat` (web query param)
 *  — an explicit hint is required in both cases, never sniffed. */
export const URL_IMPORT_FORMATS = ['stdf', 'atdf', 'csv', 'json', 'parquet'] as const;
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
 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
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
 */
export function mergeBinDefs(lists: Array<BinDef[] | undefined>): BinDef[] | undefined {
  const byBin = new Map<number, string>();
  for (const list of lists) for (const d of list ?? []) byBin.set(d.bin, d.name);
  if (byBin.size === 0) return undefined;
  return [...byBin.entries()].map(([bin, name]) => ({ bin, name })).sort((a, b) => a.bin - b.bin);
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
  const applyField = ({ key, value }: MetaField) => {
    if (key === 'testTemp') {
      const t = Number(value);
      if (Number.isFinite(t)) meta.temperature = t; else meta.testTemp = value;
    } else {
      const mapped = WMAP_META_KEY[key];
      meta[mapped ?? key] = value;
    }
  };
  for (const f of source?.fields ?? []) applyField(f);
  for (const f of waferFields ?? []) applyField(f);
  return meta;
}

export interface WcrGeometry {
  waferConfig: Partial<Pick<WaferConfig, 'diameter' | 'center' | 'notch'>>;
  dieConfig: Partial<Pick<DieConfig, 'width' | 'height' | 'xAxisDirection' | 'yAxisDirection'>>;
}

// STDF/ATDF WF_UNITS enum → mm-per-unit. `0` ("Unknown") is deliberately
// absent — acting on an unlabelled measurement is worse than not using it at
// all (mirrors the diameter dialog's own "never silently misapply an
// unconfirmed value" rule).
const WCR_UNIT_TO_MM: Record<string, number> = { '1': 25.4, '2': 10, '3': 1, '4': 0.0254 };

const WCR_FLAT_TO_NOTCH: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
  U: 'top', D: 'bottom', L: 'left', R: 'right',
};

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

  const mmPerUnit = WCR_UNIT_TO_MM[get('wfUnits') ?? ''];
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

  const flat = get('wfFlat');
  if (flat !== undefined && flat in WCR_FLAT_TO_NOTCH) {
    waferConfig.notch = { type: WCR_FLAT_TO_NOTCH[flat] };
  }

  const posX = get('posX');
  if (posX === 'L' || posX === 'R') dieConfig.xAxisDirection = posX === 'L' ? 'left' : 'right';
  const posY = get('posY');
  if (posY === 'U' || posY === 'D') dieConfig.yAxisDirection = posY === 'U' ? 'up' : 'down';

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
 * `current` but not reflected in `original` (e.g. re-opening "Filter tests…"
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
