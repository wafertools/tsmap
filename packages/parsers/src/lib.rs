pub mod error;
pub mod types;
pub mod read_file;
pub mod test_identity;
pub mod flat_wafers;
pub mod parse_stdf;
pub mod parse_atdf;
pub mod parse_csv;
pub mod parse_json;
pub mod parse_parquet;

// Fixture-path resolution shared by the `bench` benches (see the module docs
// and scripts/fixture_paths.py).
#[cfg(feature = "bench")]
pub mod bench_fixtures;

#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;
    use serde::Serialize;
    use crate::parse_csv::CsvMapping;
    use crate::error::ParseError;

    // ── The TypeScript surface ─────────────────────────────────────────────────
    //
    // wasm-bindgen cannot infer any of this. Every export below returns
    // `JsValue`, which it types as `any`, so before this section a consumer got a
    // .d.ts that described the *calls* and told them nothing whatsoever about the
    // results — no field names, no optionality, no completion, and no error when
    // a field was renamed out from under them. The README was carrying the whole
    // contract on its own, and had quietly fallen behind four result fields.
    //
    // `typescript_custom_section` is appended verbatim to the generated
    // `testdata_parser.d.ts`, so these interfaces ship with the package and match
    // the version installed. They are hand-written and therefore capable of
    // drifting from the Rust in exactly the way the README did — so
    // `scripts/check-parser-docs.mjs` checks this block against the structs too,
    // field by field, and every claim about optionality here is one a Rust test
    // pins down (see `parse_csv::mapping_shape_tests` for `CsvMapping`).
    #[wasm_bindgen(typescript_custom_section)]
    const TS_TYPES: &'static str = r#"
/** One metadata field, exactly as the source file recorded it. */
export interface MetaField {
  key: string;
  value: string;
}

/** Lot-level metadata: every non-empty field of the source's lot record (MIR). */
export interface LotMeta {
  fields: MetaField[];
}

export interface SiteInfo {
  headNum: number;
  siteNum: number;
}

/** One bin's name, from an HBR (hard) or SBR (soft) record. */
export interface BinDef {
  bin: number;
  name: string;
}

export interface TestDef {
  name: string;
  /** "P" parametric (has a measured value) or "F" functional (verdict only). */
  testType: "P" | "F";
  loLimit?: number;
  hiLimit?: number;
  units?: string;
  /** The file's own display order. Absent for STDF/ATDF, where the real test
   *  number already sorts meaningfully. */
  order?: number;
}

export interface DieResult {
  /** Die grid X. Absent — together with `y` — on a die the file gave no
   *  position for; never one without the other. Do not default it to 0. */
  x?: number;
  /** Die grid Y. See `x`. */
  y?: number;
  /** Per-wafer ordinal, present only when `x`/`y` are absent, so an
   *  unpositioned die still has a stable identity. */
  dieIndex?: number;
  hbin?: number;
  sbin?: number;
  siteNum?: number;
  partId?: number;
  /** Measured values, keyed by test number as a string. Parametric tests only. */
  testValues?: Record<string, number>;
  /** Recorded pass/fail verdicts, `true` = pass, keyed like `testValues`.
   *  Functional results live here and only here. A test absent from this map has
   *  no recorded verdict, which is not a fail. */
  testPass?: Record<string, boolean>;
}

export interface WaferData {
  waferId: string;
  results: DieResult[];
  partCount?: number;
  goodCount?: number;
  failCount?: number;
  /** Per-wafer metadata (WIR/WRR). Absent for formats with no wafer records. */
  fields?: MetaField[];
}

/** Every advisory a parse can raise. Branch on this, never on the message. */
export type ParserWarningCode =
  | "unpositioned-dies"
  | "bin-invalid"
  | "coordinate-invalid"
  | "result-unusable"
  | "record-malformed"
  | "values-not-numeric"
  | "retests-assumed"
  | "wafer-split-by-column"
  | "column-varies-within-wafer"
  | "multiple-lot-records";

/** A non-fatal advisory. The parse succeeded; something about it is worth
 *  knowing. `"error"` means a number or plot built from this result can mislead,
 *  because data was dropped or a value substituted; `"warning"` means the parse
 *  made a documented interpretation you may want to change. */
export interface ParserWarning {
  code: ParserWarningCode;
  message: string;
  severity: "warning" | "error";
}

/** What every format parses to. There is no format-specific result type. */
export interface ParsedStdf {
  meta: LotMeta;
  wafers: WaferData[];
  /** Keyed by test number as a string. */
  testDefs: Record<string, TestDef>;
  sites: SiteInfo[];
  /** Hard-bin names from HBR. Absent when the file named no bins. */
  hbinDefs?: BinDef[];
  /** Soft-bin names from SBR. Absent when the file named no bins. */
  sbinDefs?: BinDef[];
  /** Hard bins the file marks as Pass. Absent when no HBR carried the flag —
   *  then leave your consumer's own default alone rather than passing `[]`,
   *  which asserts that nothing passes. */
  passHbins?: number[];
  /** Absent when there is nothing to report. */
  warnings?: ParserWarning[];
}

/** First-pass scan: what tests the file holds, and how many dies. */
export interface ScanResult {
  testDefs: Record<string, TestDef>;
  dieCount: number;
}

/** Metadata-only scan of one file, for listing or filtering a batch. */
export interface FileMeta {
  lotMeta: LotMeta;
  waferCount: number;
  /** Earliest WIR START_T. Normally ISO 8601, but an ATDF value in another
   *  convention passes through as-is — display text unless you parse it. */
  earliestStart?: string;
  /** Latest WRR FINISH_T, same caveat. */
  latestFinish?: string;
  siteCount?: number;
}

export interface ParquetHeadersResult {
  headers: string[];
  sample: Record<string, string>[];
  rowCount: number;
  /** Coarse per-column kind, inferred from the first sampled row. */
  columnTypes: Record<string, "number" | "bool" | "string">;
}

/** One test column in a wide-format mapping. */
export interface CsvTestCol {
  col: string;
  /** Assigned by you, not by the parser. A column whose header is itself a
   *  number should use that number. */
  testNumber: number;
  name: string;
}

/** Column mapping for CSV, JSON and Parquet. There is no header
 *  auto-detection, so this is required for those three formats.
 *
 *  `tests`, `meta`, `splitBy` and `passBins` must be present — pass `[]` for
 *  the ones you are not using. Every other field may be omitted or set to
 *  `null`, which mean the same thing. */
export interface CsvMapping {
  /** Die X column. Omit — together with `y` — for data with no positions. */
  x?: string | null;
  /** Die Y column. See `x`. */
  y?: string | null;
  hbin?: string | null;
  sbin?: string | null;
  /** Groups rows into wafers. */
  wafer?: string | null;
  lot?: string | null;
  /** Test site number. Non-numeric values mean no site for that die. */
  site?: string | null;
  /** Wide format: one entry per test-value column. `[]` for tall format. */
  tests: CsvTestCol[];
  /** Extra columns to carry through as per-die metadata. */
  meta: string[];
  /** Columns to facet wafers by, beyond `wafer`. */
  splitBy: string[];
  /** Tall format: the column holding each row's test name. */
  testnameCol?: string | null;
  /** Tall format: the column holding each row's real test number. Set this
   *  where the data has one — otherwise a number is hashed from the name. */
  testnumberCol?: string | null;
  /** Tall format: the column holding each row's measured value. */
  testvalueCol?: string | null;
  loLimitCol?: string | null;
  hiLimitCol?: string | null;
  unitsCol?: string | null;
  /** Bins counted as a pass in this file's own pass/fail summary. */
  passBins: number[];
}

/** Every way a parse can fail. Branch on this, never on the message. */
export type ParseErrorCode =
  | "file-read"
  | "gzip-invalid"
  | "encoding-invalid"
  | "not-stdf"
  | "stdf-unsupported"
  | "csv-read"
  | "json-invalid"
  | "parquet-read"
  | "column-missing"
  | "mapping-invalid"
  /** A worker panicked or a task failed to join — always a bug, never bad input. */
  | "internal";

/** What every export below throws. A real `Error`, so `err.message` works and
 *  `err instanceof Error` is true, carrying a `code` to branch on. */
export interface ParserError extends Error {
  name: "ParserError";
  code: ParseErrorCode;
}
"#;

    // Wrapper types so each export's return value is typed in the .d.ts instead
    // of being `any`. They carry no runtime cost: the value handed back is the
    // same plain object serde produced, and `unchecked_into` is a compile-time
    // reinterpretation, not a conversion or a check.
    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(typescript_type = "ParsedStdf")]
        pub type TsParsedStdf;
        #[wasm_bindgen(typescript_type = "ScanResult")]
        pub type TsScanResult;
        #[wasm_bindgen(typescript_type = "FileMeta")]
        pub type TsFileMeta;
        #[wasm_bindgen(typescript_type = "ParquetHeadersResult")]
        pub type TsParquetHeaders;
        #[wasm_bindgen(typescript_type = "CsvMapping")]
        pub type TsCsvMapping;
        #[wasm_bindgen(typescript_type = "number[]")]
        pub type TsNumberArray;
        #[wasm_bindgen(typescript_type = "string[]")]
        pub type TsStringArray;
    }

    // Route Rust panics to console.error with a stack trace. Without this a
    // panic in the parser becomes an opaque WASM trap that aborts the module
    // with no diagnostic — a dead page. The bounds-checked byte readers mean a
    // truncated file returns Err rather than panicking, but this catches any
    // residual panic surface.
    #[wasm_bindgen(start)]
    pub fn init() {
        console_error_panic_hook::set_once();
    }

    fn to_js<T: Serialize, R: JsCast>(val: &T) -> R {
        val.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .unwrap()
            .unchecked_into()
    }

    /// Throw a real JS `Error` carrying the failure's `code`.
    ///
    /// This used to throw the message as a bare string. A caught string is not an
    /// `Error`: `err.message` reads `undefined`, `err instanceof Error` is false,
    /// and a host that wanted to handle "not an STDF file" differently from "the
    /// disk read failed" had only the prose to go on. Now `message` is the prose,
    /// `code` is stable, and the stack points at the call.
    fn to_js_error(e: ParseError) -> JsValue {
        let err = js_sys::Error::new(&e.message);
        err.set_name("ParserError");
        // Reflect::set on a fresh Error cannot fail; ignoring the result keeps
        // this infallible rather than inventing a second failure mode inside the
        // failure path.
        let _ = js_sys::Reflect::set(&err, &JsValue::from_str("code"), &JsValue::from_str(e.code));
        err.into()
    }

    /// Read a `CsvMapping` from the object a JS caller passed.
    ///
    /// Round-trips through JSON because `serde_wasm_bindgen::from_value` treats
    /// JS `null` differently from `undefined`, which makes every `Option<String>`
    /// field fail when the caller sends null — and a mapping UI clearing a field
    /// sends exactly that.
    fn mapping_from_js(mapping: &JsValue) -> Result<CsvMapping, JsValue> {
        let json = js_sys::JSON::stringify(mapping)
            .map_err(|e| to_js_error(ParseError::mapping_invalid(format!("{e:?}"))))?;
        let json_str: String = json.into();
        serde_json::from_str(&json_str)
            .map_err(|e| to_js_error(ParseError::mapping_invalid(e)))
    }

    #[wasm_bindgen]
    pub fn parse_stdf(bytes: &[u8]) -> Result<TsParsedStdf, JsValue> {
        crate::parse_stdf::parse_stdf_from_bytes(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_atdf(bytes: &[u8]) -> Result<TsParsedStdf, JsValue> {
        crate::parse_atdf::parse_atdf_from_bytes(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_csv(bytes: &[u8], mapping: &TsCsvMapping) -> Result<TsParsedStdf, JsValue> {
        let mapping = mapping_from_js(AsRef::<JsValue>::as_ref(mapping))?;
        crate::parse_csv::parse_csv_from_bytes(bytes, mapping)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_json(bytes: &[u8], mapping: &TsCsvMapping) -> Result<TsParsedStdf, JsValue> {
        let mapping = mapping_from_js(AsRef::<JsValue>::as_ref(mapping))?;
        crate::parse_json::parse_json_from_bytes(bytes, mapping)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parquet_headers(bytes: &[u8]) -> Result<TsParquetHeaders, JsValue> {
        crate::parse_parquet::parquet_headers_from_bytes(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    /// `columns` is a JS string array. See `parquet_distinct_count_from_bytes`.
    #[wasm_bindgen]
    pub fn parquet_distinct_count(bytes: &[u8], columns: &TsStringArray) -> Result<usize, JsValue> {
        let columns: Vec<String> = serde_wasm_bindgen::from_value(AsRef::<JsValue>::as_ref(columns).clone())
            .map_err(|e| to_js_error(ParseError::mapping_invalid(e)))?;
        crate::parse_parquet::parquet_distinct_count_from_bytes(bytes, &columns)
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_parquet(bytes: &[u8], mapping: &TsCsvMapping) -> Result<TsParsedStdf, JsValue> {
        let mapping = mapping_from_js(AsRef::<JsValue>::as_ref(mapping))?;
        crate::parse_parquet::parse_parquet_from_bytes(bytes, mapping)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn stdf_test_names(bytes: &[u8]) -> Result<TsScanResult, JsValue> {
        crate::parse_stdf::parse_stdf_test_names(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn stdf_file_meta(bytes: &[u8]) -> Result<TsFileMeta, JsValue> {
        crate::parse_stdf::parse_stdf_file_meta(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_stdf_filtered(bytes: &[u8], selected: &TsNumberArray) -> Result<TsParsedStdf, JsValue> {
        let set = selected_set(selected)?;
        crate::parse_stdf::parse_stdf_from_bytes_filtered(bytes, &set)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn atdf_test_names(bytes: &[u8]) -> Result<TsScanResult, JsValue> {
        crate::parse_atdf::parse_atdf_test_names(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn atdf_file_meta(bytes: &[u8]) -> Result<TsFileMeta, JsValue> {
        crate::parse_atdf::parse_atdf_file_meta(bytes)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    #[wasm_bindgen]
    pub fn parse_atdf_filtered(bytes: &[u8], selected: &TsNumberArray) -> Result<TsParsedStdf, JsValue> {
        let set = selected_set(selected)?;
        crate::parse_atdf::parse_atdf_from_bytes_filtered(bytes, &set)
            .map(|r| to_js(&r))
            .map_err(to_js_error)
    }

    /// The selected test numbers, as both filtered parsers want them. One
    /// implementation: the two had identical bodies, and a filtered parse that
    /// read its selection differently per format would be a silently different
    /// result from the same input.
    fn selected_set(selected: &TsNumberArray) -> Result<std::collections::HashSet<u32>, JsValue> {
        let selected: Vec<u32> = serde_wasm_bindgen::from_value(AsRef::<JsValue>::as_ref(selected).clone())
            .map_err(|e| to_js_error(ParseError::mapping_invalid(e)))?;
        Ok(selected.into_iter().collect())
    }
}
