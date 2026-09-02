import type { DieResult, BinDef } from '@wafertools/wafermap';

export interface TestDef {
  name: string;
  testType: 'P' | 'F';
  loLimit?: number;
  hiLimit?: number;
  units?: string;
  /**
   * Position to display this test in, independent of its number — CSV/JSON
   * test numbers are now a deterministic hash of the test's identity (the
   * source column for wide format, the test name for long format), chosen so
   * a saved test list / override survives a column reorder or a re-export in
   * a different row order. That makes the number itself meaningless as a
   * sort key, unlike STDF/ATDF's real test numbers, where it still is —
   * `order` is only ever set by the CSV/JSON parser paths (see
   * `testdata-parser`'s `parse_csv.rs`/`parse_json.rs`); absent for
   * STDF/ATDF, where sorting by `num` remains correct and is the fallback.
   */
  order?: number;
}

/**
 * A per-test override loaded from (or destined for) a "test definitions" file —
 * only fields actually present are ever applied; absent/undefined fields
 * leave whatever was already parsed/overridden alone. See
 * `applyTestOverrides`/`diffTestOverride` in `lib.ts`.
 */
export interface TestOverride {
  name?: string;
  loLimit?: number;
  hiLimit?: number;
  units?: string;
  testType?: 'P' | 'F';
}

/**
 * One metadata field as a raw key/value pair, as emitted by the parser
 * (`@wafertools/testdata-parser`). `key` is the source field name (camelCase
 * STDF key like `lotId`, `testTemp`, `startT`, or a CSV/JSON column name).
 * Friendly labels + which fields to surface as facets live in `metadata.ts` —
 * adding/relabelling a field never touches the parser.
 */
export interface MetaField {
  key: string;
  value: string;
}

export interface WaferData {
  waferId: string;
  results: DieResult[];
  partCount?: number;
  goodCount?: number;
  failCount?: number;
  /** Per-wafer metadata from the parser (STDF/ATDF WIR/WRR fields). */
  fields?: MetaField[];
  /**
   * Provenance of this wafer — which file/lot it came from. Stamped at merge
   * time (see `makeWaferSource`/stamping in main.ts). Wafers produced by the
   * same `ParsedFile` share ONE `WaferSource` instance by reference, so grouping
   * can key on referential identity and an edit to a lot's metadata is a single
   * write seen by all its wafers. Optional because pre-merge / test wafers may
   * not be stamped yet.
   */
  source?: WaferSource;
}

/** Lot-level metadata from the parser: an ordered list of raw key/value fields. */
export interface LotMeta {
  fields: MetaField[];
}

/**
 * Wafer provenance used as a faceting dimension (group / compare / split by lot,
 * program, temperature, …). Built once per loaded file and shared by reference
 * across that file's wafers. Generic: `fields` holds the file's lot-level
 * metadata verbatim (raw keys); tsmap's curation table maps keys → labels and
 * decides which to surface.
 */
export interface WaferSource {
  sourceFile: string;
  fields: MetaField[];
}

export interface ParsedFile {
  fileName: string;
  meta: LotMeta;
  wafers: WaferData[];
  testDefs: Record<string, TestDef>;
  /** Hard/soft bin names from STDF/ATDF HBR/SBR — wmap's `hbinDefs`/`sbinDefs`
   *  input, one entry per distinct bin number that had a non-empty name.
   *  Absent (not just empty) for formats with no HBR/SBR equivalent (CSV/
   *  JSON/Parquet). */
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  /** Hard bin numbers HBR marks Pass — feeds wmap's `waferConfig.passBins`,
   *  which otherwise defaults to `[1]` regardless of whether bin 1 is
   *  actually this file's pass bin. Absent/empty means "no usable Pass flag
   *  found," in which case wmap's own default is left in place. */
  passHbins?: number[];
  /** Non-fatal parser advisories to surface in the log panel. */
  warnings?: string[];
}
