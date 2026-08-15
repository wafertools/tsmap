# @wafertools/testdata-parser

<img src="https://raw.githubusercontent.com/wafertools/tsmap/main/packages/parsers/testdata-parser-readme-header-256.png" width="64" height="64" alt="testdata-parser icon">

Rust/WASM parsers for semiconductor test data formats: **STDF**, **ATDF**, **CSV**, **JSON**, and **Parquet**. Compiled to a single WASM module via `wasm-bindgen`; the same Rust source also builds natively (used by [tsmap](https://github.com/wafertools/tsmap)'s Tauri backend).

All formats parse to one shared shape (`ParsedStdf` / `ScanResult`) — there is no format-specific output type on the JS side.

## Install

```bash
npm install @wafertools/testdata-parser
```

## Usage

The module must be initialized once before calling any parse function — it loads and instantiates the WASM binary.

```js
import init, { parse_stdf } from '@wafertools/testdata-parser';

await init(); // fetches testdata_parser_bg.wasm relative to the module URL
const bytes = new Uint8Array(await file.arrayBuffer());
const parsed = parse_stdf(bytes); // ParsedStdf, or throws a string error
```

`init()` also installs a panic hook that routes any Rust panic to `console.error` with a stack trace, instead of an opaque WASM trap.

In a bundler/dev-server context, `new URL('...testdata_parser_bg.wasm', import.meta.url)` resolution can be finicky — see tsmap's `parserWorker.ts` for a worked example of loading this module off the main thread in a Vite app.

## API

Every parse function takes raw file bytes (`Uint8Array`) and returns a plain JS object (via `serde-wasm-bindgen`), or throws a `string` on error. Gzip-compressed input (`.gz`) is transparently decompressed for every format.

| Function | Signature | Returns |
| --- | --- | --- |
| `parse_stdf` | `(bytes: Uint8Array) => ParsedStdf` | Full parse of an STDF file |
| `parse_atdf` | `(bytes: Uint8Array) => ParsedStdf` | Full parse of an ATDF file |
| `parse_csv` | `(bytes: Uint8Array, mapping: CsvMapping) => ParsedStdf` | Full parse of a CSV, using an explicit column mapping |
| `parse_json` | `(bytes: Uint8Array, mapping: CsvMapping) => ParsedStdf` | Full parse of a JSON array-of-records file, using the same mapping shape as CSV |
| `parquet_headers` | `(bytes: Uint8Array) => ParquetHeadersResult` | Schema + a sample of rows, for a column-mapping UI (see below — unlike CSV/JSON, this one *is* a WASM export) |
| `parse_parquet` | `(bytes: Uint8Array, mapping: CsvMapping) => ParsedStdf` | Full parse of a Parquet file, using the same mapping shape as CSV/JSON |
| `stdf_test_names` | `(bytes: Uint8Array) => ScanResult` | Fast first-pass scan: test definitions + die count, no die accumulation |
| `atdf_test_names` | `(bytes: Uint8Array) => ScanResult` | Same first-pass scan for ATDF |
| `parse_stdf_filtered` | `(bytes: Uint8Array, selected: number[]) => ParsedStdf` | Full parse, skipping per-site accumulation for test numbers not in `selected` |
| `parse_atdf_filtered` | `(bytes: Uint8Array, selected: number[]) => ParsedStdf` | Same filtered parse for ATDF |

### Two-pass parsing (STDF/ATDF)

STDF and ATDF files can be large and contain far more tests than a caller wants to hold in memory. The intended flow:

1. **`stdf_test_names`/`atdf_test_names`** — a fast scan (PTR/FTR records only) that returns every test definition and the die count, without accumulating per-site test values.
2. Caller lets the user (or some policy) choose a subset of test numbers.
3. **`parse_stdf_filtered`/`parse_atdf_filtered`** — a full parse that still walks every record (so bin/wafer/lot data is complete) but only accumulates test values for the `selected` test numbers, bounding memory for wide files.

`test_defs` in the filtered result only includes tests seen in the second pass; a test that only appears on an early stop-on-fail die may be pruned from a truncated re-scan. Callers doing two-pass filtering should merge in the `test_defs` from the first-pass `ScanResult` to avoid losing that metadata (this is what tsmap's `testDefs` backfill does).

### CsvMapping

`parse_csv`, `parse_json`, and `parse_parquet` all require an explicit mapping — there's no header auto-detection. Column mapping fields (all are source column names, matched against the file's header row):

```ts
interface CsvMapping {
  x: string;                 // die X coordinate column
  y: string;                 // die Y coordinate column
  hbin?: string;              // hardware bin column
  sbin?: string;              // software bin column
  wafer?: string;             // wafer ID column (groups rows into WaferData[])
  lot?: string;               // lot ID column
  site?: string;              // test site number column (numeric; non-numeric -> no site)
  tests: CsvTestCol[];        // one entry per fixed test-value column
  meta: string[];             // extra columns to surface as generic per-row metadata
  splitBy: string[];          // columns to additionally facet wafers by (beyond `wafer`)
  testnameCol?: string;       // for "tall" CSVs: column holding the test name per row
  testnumberCol?: string;     // for "tall" CSVs: column holding the test's real number per row
  testvalueCol?: string;      // for "tall" CSVs: column holding the test value per row
  loLimitCol?: string;
  hiLimitCol?: string;
  unitsCol?: string;
  passBins: number[];         // hbin/sbin values treated as a pass for pass/fail summary
}

interface CsvTestCol {
  col: string;         // source column name
  testNumber: number;  // assigned test number
  name: string;        // display name
}
```

Two ways to describe test columns are supported: a **fixed set** of `tests` (one column per test, "wide" format), or a **tall** layout (`testnameCol`/`testnumberCol`/`testvalueCol` — one row per die×test, with the test identity read from a column rather than the header).

**Test identity — real number vs. synthesized one.** Neither format has a mandatory real STDF-style test number, so one gets synthesized by default (see "Design notes" below) — but a caller that *does* have real numbers in the source data shouldn't lose them:

- **Tall layout**: `testnameCol` and `testnumberCol` are independent — set either alone, or both together. Number alone is a legitimate, fully-supported case (some exports carry only a numeric test ID, no descriptive name) — the test's display name then falls back to the number itself, stringified. Name alone keeps the pre-existing hash-based behavior. Both together: the real number from `testnumberCol` is used as the key (not hashed), paired with the given name — this is the common "I have both and want them both honoured" case. Whichever columns are set, at least one of `testnameCol`/`testnumberCol` plus `testvalueCol` is required to trigger tall-layout parsing at all.
- **Wide layout** (`tests: CsvTestCol[]`): `testNumber` is assigned by the caller building the mapping (tsmap's `mappingUI.ts` does this before calling in), not by this crate — but the same principle applies there: if a column's own header is itself a bare number (a real-world convention — columns literally named `1001`, `1002`), that number should be used directly rather than hashed. `test_identity`'s reserved band (below) exists specifically so a real number like this can never collide with a hashed one.

### Return shape — `ParsedStdf`

```ts
interface ParsedStdf {
  meta: LotMeta;
  wafers: WaferData[];
  testDefs: Record<string, TestDef>; // keyed by test number as a string
  sites: SiteInfo[];
  warnings?: string[]; // non-fatal advisories, e.g. fabricated soft bins; omitted if empty
}

interface WaferData {
  waferId: string;
  results: DieResult[];
  partCount?: number;
  goodCount?: number;
  failCount?: number;
  fields?: MetaField[]; // per-wafer metadata (STDF/ATDF WIR/WRR); empty for formats without it
}

interface DieResult {
  x: number;
  y: number;
  hbin?: number;
  sbin?: number;
  siteNum?: number;
  partId?: number;
  testValues?: Record<string, number>; // keyed by test number as a string
}

interface TestDef {
  name: string;
  testType: string; // "P" (parametric) or "F" (functional)
  loLimit?: number;
  hiLimit?: number;
  units?: string;
  order?: number; // display order, independent of the key — see below
}

interface LotMeta {
  fields: MetaField[]; // every non-empty field from the source's lot record (STDF/ATDF MIR)
}

interface MetaField {
  key: string;   // source field name, e.g. "lotId", "tstTemp", "startT"
  value: string; // always a string; timestamps are ISO 8601
}

interface SiteInfo {
  headNum: number;
  siteNum: number;
}
```

`testDefs` and `testValues` are both keyed by **test number**, not test name — test numbers are the unique identity in STDF/ATDF; names are not guaranteed unique.

`meta`/`fields` are intentionally generic key/value pairs rather than a fixed struct: new metadata fields flow through from the source format with no type or crate change, and it's up to the host application to decide which fields to surface and how to label them.

### Return shape — `ScanResult`

```ts
interface ScanResult {
  testDefs: Record<string, TestDef>;
  dieCount: number;
}
```

### Column headers: CSV/JSON vs Parquet

There is no `csv_headers`/`json_headers` in the WASM API — a browser caller that needs to show the user a column-mapping UI before parsing a CSV/JSON file can just read the header row itself in plain JS (this is what tsmap's web build does; the desktop build calls the native functions below instead). The byte-based Rust functions exist (`csv_headers_from_bytes`, and `json_headers_sync`'s logic), they are simply not wired through `wasm-bindgen` for these two formats.

**Parquet is different: `parquet_headers` *is* a WASM export.** Its binary, footer-based schema has no equivalent plain-JS shortcut — a caller genuinely needs the parser to read it. `ParquetHeadersResult` extends the same headers/sample/rowCount shape with `columnTypes` (coarse `"number" | "bool" | "string"` per column, inferred from the first sampled row), since Parquet's columns are natively typed unlike CSV/JSON's all-text cells:

```ts
interface ParquetHeadersResult {
  headers: string[];
  sample: Record<string, string>[];
  rowCount: number;
  columnTypes: Record<string, 'number' | 'bool' | 'string'>;
}
```

## Native (non-WASM) usage

The crate also builds as a native Rust library (used directly by tsmap's Tauri commands, bypassing WASM entirely). Enable the `native` feature (the default); the `wasm` feature gates the `wasm-bindgen` exports above. See `Cargo.toml` for the full feature list, including `bench` (enables `parse_stdf_from_bytes_timed`, a timed parse variant used by the perf benchmarks).

**Path-based** — `native` feature only, synchronous, read from a file path rather than a byte buffer:

| Function | Module |
| --- | --- |
| `parse_stdf_sync(path: String) -> Result<ParsedStdf, String>` | `parse_stdf` |
| `parse_atdf_sync(path: String) -> Result<ParsedStdf, String>` | `parse_atdf` |
| `csv_headers_inner(path: String) -> Result<CsvHeadersResult, String>` | `parse_csv` |
| `parse_csv_inner(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_csv` |
| `json_headers_sync(path: String) -> Result<JsonHeadersResult, String>` | `parse_json` |
| `parse_json_sync(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_json` |
| `parquet_headers_inner(path: String) -> Result<ParquetHeadersResult, String>` | `parse_parquet` |
| `parse_parquet_inner(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_parquet` |
| `read_bytes(path: &str) -> Result<Vec<u8>, String>` | `read_file` |
| `read_text(path: &str) -> Result<String, String>` | `read_file` |

**Byte-based** — available on every target, and what the WASM exports wrap. Use these from Rust when you already hold the bytes:

| Function | Module |
| --- | --- |
| `parse_stdf_from_bytes(&[u8]) -> Result<ParsedStdf, String>` | `parse_stdf` |
| `parse_atdf_from_bytes(&[u8]) -> Result<ParsedStdf, String>` | `parse_atdf` |
| `parse_stdf_test_names(&[u8]) -> Result<ScanResult, String>` | `parse_stdf` |
| `parse_atdf_test_names(&[u8]) -> Result<ScanResult, String>` | `parse_atdf` |
| `parse_stdf_from_bytes_filtered(&[u8], &HashSet<u32>) -> Result<ParsedStdf, String>` | `parse_stdf` |
| `parse_atdf_from_bytes_filtered(&[u8], &HashSet<u32>) -> Result<ParsedStdf, String>` | `parse_atdf` |
| `csv_headers_from_bytes(&[u8]) -> Result<CsvHeadersResult, String>` | `parse_csv` |
| `parse_csv_from_bytes(&[u8], mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_csv` |
| `parse_json_from_bytes(&[u8], mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_json` |
| `parquet_headers_from_bytes(&[u8]) -> Result<ParquetHeadersResult, String>` | `parse_parquet` |
| `parse_parquet_from_bytes(&[u8], mapping: CsvMapping) -> Result<ParsedStdf, String>` | `parse_parquet` |
| `decompress_if_gzip(Vec<u8>) -> Result<Vec<u8>, String>` | `read_file` |

`CsvHeadersResult` and `JsonHeadersResult` are the same shape — the header row plus enough of the file to preview a mapping:

```rust
pub struct CsvHeadersResult {
    pub headers: Vec<String>,
    pub sample: Vec<HashMap<String, String>>, // first few rows, for a preview UI
    pub row_count: usize,
}
```

## Design notes

- **Byte readers are panic-free.** STDF/ATDF field readers are bounds-checked and return `Option`/`Result` rather than panicking on truncated input — a panic inside WASM aborts the whole module with no recovery, so this is a hard requirement, not a style preference.
- **Big-endian and little-endian STDF** are both supported (detected from the FAR record's `CPU_TYPE`).
- **Gzip is transparent** — every entry point decompresses `.gz` input automatically by sniffing the magic bytes; callers don't need to branch on compression.
- **CSV/JSON/Parquet test numbers are a deterministic hash, not a real STDF test number.** STDF/ATDF have a real test number in the file; the other three don't, so one is synthesized — from the source column for wide format, from the test name for long format (`test_identity::stable_test_number`, FNV-1a with a fixed seed and a reserved floor, collision-probed so two tests in one file can never collide). Deliberately not sequential/encounter-order: a hash means the number for a given test doesn't change if the file is reordered or a column is added — the number is otherwise meaningless and callers should never rely on its value, only on it being stable and unique within one parse. `order` (see `TestDef` above) carries the file's own display order instead.
- **Parquet reads through a row-oriented API, not Arrow.** `parquet::record::Row`/`Field` rather than the `arrow` feature — a closer fit for this crate's row-based `DieResult` model, and a smaller WASM bundle (no Arrow array machinery pulled in). A typed Parquet cell is coerced to `f64` for numeric roles and to a plain string otherwise; a value that fails to coerce (e.g. a numeric role mapped to a genuinely string-typed column) is skipped and surfaced as one summarised entry in `warnings`, not a panic or a silent zero.
- **Parquet's `zstd` codec is native-only.** `snappy`, `gzip`, `lz4`, and `brotli` build for `wasm32-unknown-unknown` with no extra toolchain; `zstd`'s C library needs a real C cross-compiler targeting wasm32, which a plain `wasm-pack build` doesn't assume is available. A `zstd`-compressed Parquet file parses natively but fails clearly on the WASM build.

## Versioning

This crate has its own release lifecycle, independent of any consuming application's version. See the parent repository's `CLAUDE.md` for the bump/build/publish steps.
