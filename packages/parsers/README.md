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
const parsed = parse_stdf(bytes); // ParsedStdf, or throws a ParserError
```

**Import `init` as the default export, not by name.** There is also a named `init`
export — that one is only the panic hook, and awaiting it instantiates nothing. The
default export is what loads the WASM binary.

**Failures throw a `ParserError`**: a real `Error`, so `err.message` reads and
`err instanceof Error` is true, carrying a stable `err.code` to branch on. Handle the
code, display the message — messages are prose and may be reworded.

```js
try {
  const parsed = parse_stdf(bytes);
} catch (err) {
  if (err.code === 'not-stdf') {  // the file is not the format its name claims
    // ...offer to try another parser
  }
  showToast(err.message);
}
```

The full set: `file-read`, `gzip-invalid`, `encoding-invalid`, `not-stdf`,
`stdf-unsupported`, `csv-read`, `json-invalid`, `parquet-read`, `column-missing`,
`mapping-invalid`, `internal`. `ParseErrorCode` in the type declarations is the same
list, so a `switch` on it is exhaustively checked.

`init()` also installs a panic hook that routes any Rust panic to `console.error` with a stack trace, instead of an opaque WASM trap.

In a bundler/dev-server context, `new URL('...testdata_parser_bg.wasm', import.meta.url)` resolution can be finicky — see tsmap's `parserWorker.ts` for a worked example of loading this module off the main thread in a Vite app.

## TypeScript

The package ships real declarations for every result and input shape —
`ParsedStdf`, `WaferData`, `DieResult`, `TestDef`, `ParserWarning`, `ScanResult`,
`FileMeta`, `ParquetHeadersResult`, `CsvMapping`, and the `ParserWarningCode` /
`ParseErrorCode` unions. Each export is typed with its real return type, so field
names complete and a typo is a compile error.

They are emitted from the Rust (`typescript_custom_section` in `lib.rs`) into
`testdata_parser.d.ts`, so they ship with the package and match the version
installed. Earlier versions typed every return value as `any`, which is why the type
blocks below existed as the only contract — they are now a readable mirror of the
declarations, and `scripts/check-parser-docs.mjs` holds the Rust, the declarations
and this README to each other.

## API

Every parse function takes raw file bytes (`Uint8Array`) and returns a plain JS object (via `serde-wasm-bindgen`), or throws a `ParserError` (see above). Gzip-compressed input (`.gz`) is transparently decompressed for every format.

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
| `stdf_file_meta` | `(bytes: Uint8Array) => FileMeta` | Lot metadata, wafer count, first/last timestamps and site count from an MIR/SDR/WIR/WRR-only scan — no PTR/FTR/PIR/PRR walk, so it stays cheap across a batch of files |
| `atdf_file_meta` | `(bytes: Uint8Array) => FileMeta` | Same metadata-only scan for ATDF |
| `parquet_distinct_count` | `(bytes: Uint8Array, columns: string[]) => number` | How many distinct combinations of those columns the file holds — a wafer count from `['lot','wafer']` without a full parse, read as a column projection. A column missing from the schema is an error, not a count of zero. Parquet only: CSV/JSON have no equivalent shortcut |
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
  x?: string | null;          // die X coordinate column — omit for data with no positions
  y?: string | null;          // die Y coordinate column — see `x`
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

`tests`, `meta`, `splitBy` and `passBins` must be present — pass `[]` where you are not
using one. Every other field may be omitted entirely or set to `null`; the two mean the
same thing. (`parse_csv::mapping_shape_tests` pins that split, and the `CsvMapping`
declaration shipped in the package encodes it.)

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
  hbinDefs?: BinDef[];  // hard-bin names from HBR; omitted if empty
  sbinDefs?: BinDef[];  // soft-bin names from SBR; omitted if empty
  passHbins?: number[]; // hard bins HBR marks Pass (HBIN_PF == 'P'); omitted if empty
  warnings?: ParserWarning[]; // non-fatal advisories; omitted if empty
}

interface WaferData {
  waferId: string;
  waferIdPlaceholder?: boolean; // true when the file gave the wafer no ID (waferId is W1, W2…)
  results: DieResult[];
  partCount?: number;
  goodCount?: number;
  failCount?: number;
  fields?: MetaField[]; // per-wafer metadata (STDF/ATDF WIR/WRR); empty for formats without it
}

interface DieResult {
  x?: number;          // die grid X — absent on an unpositioned die, see below
  y?: number;          // die grid Y — absent on an unpositioned die, see below
  dieIndex?: number;   // per-wafer ordinal, present ONLY when x/y are absent
  hbin?: number;
  sbin?: number;
  siteNum?: number;
  partId?: string;     // STDF/ATDF PART_ID as text; data, not an identifier
  supersedes?: 'partId' | 'position'; // the tester marked this record as replacing an earlier one
  testValues?: Record<string, number>;  // keyed by test number as a string
  testPass?: Record<string, boolean>;   // recorded verdicts, true = pass; see below
}

interface TestDef {
  name: string;
  testType: string; // "P" (parametric) or "F" (functional)
  loLimit?: number;
  hiLimit?: number;
  loSpec?: number;     // specification limits (STDF LO_SPEC/HI_SPEC), separate from the test limits
  hiSpec?: number;
  loLimitInclusive?: boolean; // false: a result equal to the low test limit fails (STDF PARM_FLG bit 6 clear, ATDF "L")
  hiLimitInclusive?: boolean; // the same for the high test limit (PARM_FLG bit 7, ATDF "H"); absent = equal passes
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

interface BinDef {
  bin: number;
  name: string;
}

interface ParserWarning {
  code: ParserWarningCode;
  message: string;
  severity: 'warning' | 'error';
}

type ParserWarningCode =
  | 'unpositioned-dies'         // dies with no X/Y — real data, not placeable
  | 'bin-invalid'               // a bin outside STDF's 0–32767, or a missing hard bin
  | 'coordinate-invalid'        // an X/Y outside STDF's -32767..32767
  | 'result-unusable'           // results the tester flagged unusable (value left out, verdict kept)
  | 'records-not-read'          // records this parser does not read yet (MPR)
  | 'wafer-end-missing'         // a wafer had no WRR; closed at the next wafer or end of file
  | 'file-truncated'            // the file ends part-way through a record
  | 'record-malformed'          // a PRR too short to hold its required fields
  | 'values-not-numeric'        // a mapped column held values that would not coerce
  | 'retests-assumed'           // repeated positions read as retests
  | 'wafer-split-by-column'     // one wafer per value of a mapped column
  | 'column-varies-within-wafer'// a metadata column describes dies, not wafers
  | 'multiple-lot-records';     // the file holds more than one MIR
```

**`x`/`y` are optional, and a die is either fully positioned or fully unpositioned — never
half.** A die with no reported position has neither field and carries `dieIndex` instead (its
PRR/row encounter order within the wafer), giving it a stable identity that survives
filtering and sorting downstream. Such a die still holds real measured data and counts
toward every non-spatial statistic, but cannot be placed on a wafer map. Do not default a
missing coordinate to 0 — that invents a die at the origin. Each wafer holding any of them
also produces a `warnings` entry naming how many.

**`testPass` holds recorded pass/fail verdicts**, keyed exactly like `testValues`, `true`
meaning pass. Functional (FTR) results live here and *only* here — they have no measured
value, so they never appear in `testValues`. A parametric (PTR) test also gets an entry when
the tester recorded a valid indication (STDF `TEST_FLG` bit 6 clear). A test number absent
from the map has no recorded verdict, which is not the same as a fail.

**`hbinDefs`/`sbinDefs` carry bin names from HBR/SBR records**, one entry per distinct bin
number that had a non-empty name — a bin with no recorded name is omitted rather than
emitted with an empty string, so a host can fall back to its own "Bin N" label. Hard and
soft bins occupy independent number spaces (STDF V4), which is why they are two arrays and
never merged. Entries are sorted by bin number.

**`passHbins` is the file's own pass/fail truth** — the hard bins whose HBR marked
`HBIN_PF == 'P'`. It matters because a consumer that does not carry it across generally
assumes bin 1 is the pass bin, which decides both the yield number and how it is labelled
whether or not it is true of this test program. It is absent when no HBR record carried a
usable Pass flag; in that case leave the consumer's own default in place rather than passing
an empty array, which asserts that nothing passes.

**`warnings` carries a stable `code`, prose, and a severity** — branch on the code, display
the message, and never match on the prose. `severity: 'error'` means a number or a plot
built from this result can mislead, because data was dropped or a value was substituted
(`unpositioned-dies`, `bin-invalid`, `coordinate-invalid`, `record-malformed`, `records-not-read`, `values-not-numeric`); `'warning'` means the
parse applied a documented rule or interpretation — one you may want to change, or, like
`result-unusable`, the spec's own rule for leaving out values the tester flagged — and the
result means what the file says. Nothing here is fatal — the parse succeeded. Surface them: a silently discarded
warning is how a partly-wrong load looks fine.

`testDefs` and `testValues` are both keyed by **test number**, not test name — test numbers are the unique identity in STDF/ATDF; names are not guaranteed unique.

`meta`/`fields` are intentionally generic key/value pairs rather than a fixed struct: new metadata fields flow through from the source format with no type or crate change, and it's up to the host application to decide which fields to surface and how to label them.

### Return shape — `ScanResult`

```ts
interface ScanResult {
  testDefs: Record<string, TestDef>;
  dieCount: number;
}
```

### Return shape — `FileMeta`

Returned by `stdf_file_meta`/`atdf_file_meta`: enough to list or filter a batch of files
without parsing any of them fully. One `FileMeta` describes one *file*, so the timestamps
and wafer count are aggregated across every WIR/WRR pair in it.

```ts
interface FileMeta {
  lotMeta: LotMeta;
  waferCount: number;
  earliestStart?: string; // earliest WIR START_T; absent if the file has no WIR records
  latestFinish?: string;  // latest WRR FINISH_T; absent if no wafer completed
  siteCount?: number;     // distinct site numbers across every SDR seen
}
```

Timestamps are normally fixed-width ISO 8601, which is what makes "earliest" a plain string
compare — but an ATDF value written in some other convention passes through unrecognised
rather than being dropped, so treat these as display text unless you have parsed them.

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
| `parse_stdf_sync(path: String) -> ParseResult<ParsedStdf>` | `parse_stdf` |
| `parse_atdf_sync(path: String) -> ParseResult<ParsedStdf>` | `parse_atdf` |
| `csv_headers_inner(path: String) -> ParseResult<CsvHeadersResult>` | `parse_csv` |
| `parse_csv_inner(path: String, mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_csv` |
| `json_headers_sync(path: String) -> ParseResult<JsonHeadersResult>` | `parse_json` |
| `parse_json_sync(path: String, mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_json` |
| `parquet_headers_inner(path: String) -> ParseResult<ParquetHeadersResult>` | `parse_parquet` |
| `parse_parquet_inner(path: String, mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_parquet` |
| `parquet_distinct_count_inner(path: String, columns: Vec<String>) -> ParseResult<usize>` | `parse_parquet` |
| `read_bytes(path: &str) -> ParseResult<Vec<u8>>` | `read_file` |
| `read_text(path: &str) -> ParseResult<String>` | `read_file` |

Every fallible function returns `ParseResult<T>` — that is `Result<T, ParseError>`, where
`ParseError` is `{ code: &'static str, message: String }` and `Display` renders the message
alone. Same codes as the WASM layer above; it is the same error, serialised there.

**Byte-based** — available on every target, and what the WASM exports wrap. Use these from Rust when you already hold the bytes:

| Function | Module |
| --- | --- |
| `parse_stdf_from_bytes(&[u8]) -> ParseResult<ParsedStdf>` | `parse_stdf` |
| `parse_atdf_from_bytes(&[u8]) -> ParseResult<ParsedStdf>` | `parse_atdf` |
| `parse_stdf_test_names(&[u8]) -> ParseResult<ScanResult>` | `parse_stdf` |
| `parse_atdf_test_names(&[u8]) -> ParseResult<ScanResult>` | `parse_atdf` |
| `parse_stdf_from_bytes_filtered(&[u8], &HashSet<u32>) -> ParseResult<ParsedStdf>` | `parse_stdf` |
| `parse_atdf_from_bytes_filtered(&[u8], &HashSet<u32>) -> ParseResult<ParsedStdf>` | `parse_atdf` |
| `parse_stdf_file_meta(&[u8]) -> Result<FileMeta, String>` | `parse_stdf` |
| `parse_atdf_file_meta(&[u8]) -> Result<FileMeta, String>` | `parse_atdf` |
| `csv_headers_from_bytes(&[u8]) -> ParseResult<CsvHeadersResult>` | `parse_csv` |
| `parse_csv_from_bytes(&[u8], mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_csv` |
| `parse_json_from_bytes(&[u8], mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_json` |
| `parquet_headers_from_bytes(&[u8]) -> ParseResult<ParquetHeadersResult>` | `parse_parquet` |
| `parse_parquet_from_bytes(&[u8], mapping: CsvMapping) -> ParseResult<ParsedStdf>` | `parse_parquet` |
| `parquet_distinct_count_from_bytes(&[u8], &[String]) -> ParseResult<usize>` | `parse_parquet` |
| `decompress_if_gzip(Vec<u8>) -> ParseResult<Vec<u8>>` | `read_file` |

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
- **CSV/JSON/Parquet test numbers fall back to a deterministic hash only when the file itself carries no real one.** Neither format has a *mandatory* STDF-style test number the way STDF/ATDF do, but a real one is used whenever the source data has it — see "Test identity — real number vs. synthesized one" above for the wide/tall rules. Hashing is the fallback, not the default: it fires per test only when no real number was mapped or the mapped column's value didn't parse (`test_identity::stable_test_number`, FNV-1a with a fixed seed and a reserved floor, collision-probed so two tests in one file can never collide, and never colliding with a genuine numeric-header/`testnumberCol` value either). Deliberately not sequential/encounter-order: a hash means the number for a given test doesn't change if the file is reordered or a column is added — a *hashed* number is otherwise meaningless and callers should never rely on its value, only on it being stable and unique within one parse. `order` (see `TestDef` above) carries the file's own display order instead.
- **Parquet reads through a row-oriented API, not Arrow.** `parquet::record::Row`/`Field` rather than the `arrow` feature — a closer fit for this crate's row-based `DieResult` model, and a smaller WASM bundle (no Arrow array machinery pulled in). A typed Parquet cell is coerced to `f64` for numeric roles and to a plain string otherwise; a value that fails to coerce (e.g. a numeric role mapped to a genuinely string-typed column) is skipped and surfaced as one summarised entry in `warnings`, not a panic or a silent zero.
- **Parquet's `zstd` codec is native-only.** `snappy`, `gzip`, `lz4`, and `brotli` build for `wasm32-unknown-unknown` with no extra toolchain; `zstd`'s C library needs a real C cross-compiler targeting wasm32, which a plain `wasm-pack build` doesn't assume is available. A `zstd`-compressed Parquet file parses natively but fails clearly on the WASM build.

## Using this package with an AI coding agent

`llms.txt` ships with the package (`node_modules/@wafertools/testdata-parser/llms.txt`) and
is written to be handed to a coding agent: a map of the entry points, the traps that produce
a silently wrong parse, and how the result hands off to
[`@wafertools/wafermap`](https://wafertools.github.io/wafermap/). It is worth pointing an
agent at, because `testdata_parser.d.ts` is wasm-bindgen output and types every return value
as `any` — the result shapes above are the only contract, and an agent that has not read them
will invent field names.

## Versioning

This crate has its own release lifecycle, independent of any consuming application's version. See the parent repository's `CLAUDE.md` for the bump/build/publish steps.
