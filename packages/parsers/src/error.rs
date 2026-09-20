//! The one error type this crate fails with.
//!
//! Every entry point used to return `Result<T, String>`, and the WASM layer threw
//! that string verbatim. A caller could show it to a user and nothing else: to
//! tell "this isn't an STDF file" from "the disk read failed" from "your column
//! mapping names a column the file doesn't have" — three failures a host wants to
//! handle three different ways — it had to match on the prose. Which means
//! rewording a message broke a caller with no compiler error anywhere, so in
//! practice nothing branched and every failure became the same toast.
//!
//! `ParserWarning` (see `types.rs`) took the same shape for the same reason, and
//! wmap made the same change in its 0.22.0. The rule is the same here:
//! **branch on `code`, display `message`.** Codes are API. Messages are prose.
//!
//! `Display` renders the message alone, so existing `format!("{e}")` output is
//! unchanged.

use serde::Serialize;
use std::fmt;

/// A parse failure: a stable `code` to branch on, and prose to show a user.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParseError {
    /// Stable kebab-case identifier. The full set is the constructors below, and
    /// `tests::every_error_code_is_as_documented` is the list.
    pub code: &'static str,
    /// Human-readable prose. Display this; do not parse it.
    pub message: String,
}

/// Every fallible function in this crate returns this.
pub type ParseResult<T> = Result<T, ParseError>;

impl fmt::Display for ParseError {
    /// The message alone — no code prefix. A host that wants the code reads the
    /// field; this keeps `format!("{e}")` reading exactly as it did when these
    /// were plain strings.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ParseError {}

impl ParseError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    /// The file could not be read from disk (native paths only).
    pub fn file_read(e: impl fmt::Display) -> Self {
        Self::new("file-read", e.to_string())
    }

    /// Gzip input that would not decompress.
    pub fn gzip_invalid(e: impl fmt::Display) -> Self {
        Self::new("gzip-invalid", format!("gz decompress failed: {e}"))
    }

    /// Bytes that are not valid UTF-8 — an ATDF/CSV/JSON file in another
    /// encoding, or a binary file handed to a text parser.
    pub fn encoding_invalid(e: impl fmt::Display) -> Self {
        Self::new("encoding-invalid", format!("UTF-8 decode failed: {e}"))
    }

    /// Not an STDF file at all: too short to hold a FAR, or not starting with one.
    /// Distinct from `stdf-unsupported` — this file is not the format.
    pub fn not_stdf(message: impl Into<String>) -> Self {
        Self::new("not-stdf", message)
    }

    /// Recognisably STDF, but a variant this crate cannot read (an unknown
    /// `CPU_TYPE`). Worth telling apart from `not-stdf`: the file is the format,
    /// the reader is the limitation.
    pub fn stdf_unsupported(message: impl Into<String>) -> Self {
        Self::new("stdf-unsupported", message)
    }

    /// The CSV reader failed — a malformed record, an unreadable header row.
    pub fn csv_read(e: impl fmt::Display) -> Self {
        Self::new("csv-read", e.to_string())
    }

    /// The JSON is not what this parser needs: invalid syntax, no array of
    /// objects anywhere in it, or an empty array.
    pub fn json_invalid(message: impl Into<String>) -> Self {
        Self::new("json-invalid", message)
    }

    /// The Parquet reader failed — a corrupt footer, an unreadable row group, or
    /// a codec this build does not carry (`zstd` on WASM).
    pub fn parquet_read(e: impl fmt::Display) -> Self {
        Self::new("parquet-read", e.to_string())
    }

    /// A column the caller named is not in the file's schema. The caller's
    /// mapping is wrong, not the file — the one failure here a caller can fix
    /// programmatically, by re-reading the headers.
    pub fn column_missing(column: &str) -> Self {
        Self::new("column-missing", format!("column '{column}' not found"))
    }

    /// A worker panicked, or a blocking task failed to join — the parse never
    /// completed. Always a bug (in this crate or its host), never bad input:
    /// the byte readers are bounds-checked precisely so malformed files return
    /// an error instead of reaching this. Named here rather than in the host so
    /// one error type crosses the whole boundary.
    pub fn internal(e: impl fmt::Display) -> Self {
        Self::new("internal", e.to_string())
    }

    /// The `CsvMapping` handed in could not be read: a missing required field, or
    /// a field of the wrong type. WASM only — the native API takes a typed
    /// `CsvMapping` the compiler has already checked.
    pub fn mapping_invalid(e: impl fmt::Display) -> Self {
        Self::new("mapping-invalid", format!("mapping is not a valid CsvMapping: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The full error surface. A code is API: renaming one silently breaks every
    /// caller that branched on it, with no compiler error to catch it. This test
    /// is the list — changing it is the deliberate act of changing the API.
    #[test]
    fn every_error_code_is_as_documented() {
        let all = [
            ParseError::file_read("no such file"),
            ParseError::gzip_invalid("bad header"),
            ParseError::encoding_invalid("invalid utf-8 at byte 3"),
            ParseError::not_stdf("file too short to contain a FAR record"),
            ParseError::stdf_unsupported("unsupported STDF CPU_TYPE 9"),
            ParseError::csv_read("record 3: wrong field count"),
            ParseError::json_invalid("JSON array is empty"),
            ParseError::parquet_read("invalid footer"),
            ParseError::column_missing("wafer_id"),
            ParseError::mapping_invalid("missing field `hbin`"),
            ParseError::internal("blocking task panicked"),
        ];
        let expected = [
            "file-read", "gzip-invalid", "encoding-invalid", "not-stdf", "stdf-unsupported",
            "csv-read", "json-invalid", "parquet-read", "column-missing", "mapping-invalid",
            "internal",
        ];
        assert_eq!(all.len(), expected.len(), "an error kind was added without extending this test");
        for (e, code) in all.iter().zip(expected) {
            assert_eq!(e.code, code, "error code changed — this is an API break: {e:?}");
            assert!(!e.message.is_empty(), "{code} has no message");
            assert!(e.code.chars().all(|c| c.is_ascii_lowercase() || c == '-'), "not kebab-case: {code}");
        }
        let mut codes: Vec<&str> = all.iter().map(|e| e.code).collect();
        codes.sort_unstable();
        let n = codes.len();
        codes.dedup();
        assert_eq!(codes.len(), n, "duplicate error code");
    }

    #[test]
    fn display_is_the_message_alone() {
        // Existing `format!("{e}")` call sites must read exactly as they did when
        // this was a String — no "code: " prefix creeping into user-facing text.
        let e = ParseError::not_stdf("first record is not a FAR — not a valid STDF file");
        assert_eq!(format!("{e}"), "first record is not a FAR — not a valid STDF file");
    }

    #[test]
    fn serialises_as_code_and_message() {
        let json = serde_json::to_string(&ParseError::column_missing("wafer")).unwrap();
        assert_eq!(json, r#"{"code":"column-missing","message":"column 'wafer' not found"}"#);
    }
}
