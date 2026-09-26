//! Columnar binary encoding of a [`ParsedStdf`] — the form a parse crosses a
//! process or thread boundary in.
//!
//! As row objects, a parse is shipped per die: every die a map, every map
//! serialised key by key. A 266k-die STDF was ~218 MB of JSON over the Tauri
//! bridge, and in the browser the worker's result was structured-cloned onto the
//! main thread, so two full copies were live at once — which is what crashed the
//! tab. As columns it is a flat byte buffer: a `memcpy` to produce, and an
//! `ArrayBuffer` that a worker *transfers* rather than clones.
//!
//! # Layout
//!
//! ```text
//! [column][padding to 8][column][padding to 8]…[N bytes of UTF-8 JSON header][u32 LE N]
//! ```
//!
//! The columns come first and the header last, so the encoder appends the header
//! to the buffer it already holds: with the header first, the whole output was
//! built once and then copied behind it, briefly holding it twice. Every column
//! offset in the header is from the start of the buffer, and every column starts
//! on an 8-byte boundary: a typed array cannot be created at an offset that is
//! not a multiple of its element size, so an unpadded buffer would not be
//! readable at all. A reader finds the header from the last four bytes. All
//! numbers are little-endian.
//!
//! The header is the whole `ParsedStdf` with each wafer's `results` left empty,
//! plus `columnarFormat` ([`FORMAT`]) and, per wafer, `dieCount`, a `columns` table and (only when any die has one)
//! `partIds`. Serialising the struct itself, rather than a hand-kept copy of its
//! fields, means a field added to `ParsedStdf` or `WaferData` reaches the host
//! without touching this module.
//!
//! # Columns
//!
//! One entry per die, in `results` order. "Missing" has one marker per type,
//! never a value that could be real data:
//!
//! | column | type | missing |
//! | --- | --- | --- |
//! | `x`, `y` | `i32` | `i32::MIN` |
//! | `dieIndex`, `hbin`, `sbin`, `siteNum` | `u32` | `u32::MAX` |
//! | `supersedes` | `u8` | `0` (`1` = `"partId"`, `2` = `"position"`) |
//! | a test's values | `f32` or `f64` | `NaN` — the parser never stores a non-finite reading |
//! | a test's verdicts | `i8` | `-1` (`0` = fail, `1` = pass) |
//!
//! A column that would hold only "missing" is left out, and so is a test that no
//! die on the wafer has.
//!
//! A test's values are sent as `f32` when every one of them converts to `f32` and
//! back to the same number, and as `f64` otherwise, so no value is ever changed.
//! STDF records readings as `R*4`, so an STDF column is normally `f32`: half the
//! bytes, and the bridge between the parser and the app moves bytes at a fixed
//! rate (~38 MB/s measured in Tauri's WebKitGTK webview). A CSV or Parquet
//! column whose readings need `f64` stays `f64`.

use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};

use crate::types::{DieResult, ParsedStdf};

/// Written to the header as `columnarFormat`. Bump it on any change a decoder
/// could misread; `columnar.js` refuses a format it does not know.
pub const FORMAT: u32 = 2;

const MISSING_I32: i32 = i32::MIN;
const MISSING_U32: u32 = u32::MAX;

/// The kinds of column a buffer can hold, as named in the header.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Kind { I32, U32, U8, I8, F32, F64 }

impl Kind {
    fn size(self) -> usize {
        match self { Kind::I32 | Kind::U32 | Kind::F32 => 4, Kind::U8 | Kind::I8 => 1, Kind::F64 => 8 }
    }
}

/// Where one column sits. `offset` is from the start of the body.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ColumnDesc {
    /// `x`, `y`, `dieIndex`, `hbin`, `sbin`, `siteNum`, `supersedes`,
    /// `testValues` or `testPass`.
    field: &'static str,
    /// The test key, for `testValues`/`testPass`.
    #[serde(skip_serializing_if = "Option::is_none")]
    test: Option<String>,
    kind: Kind,
    offset: usize,
}

/// Column bytes accumulated before the header's length (and so every offset) is known.
struct Body {
    bytes: Vec<u8>,
    columns: Vec<ColumnDesc>,
}

impl Body {
    fn push(&mut self, field: &'static str, test: Option<String>, kind: Kind, data: &[u8]) {
        pad8(&mut self.bytes);
        debug_assert_eq!(data.len() % kind.size(), 0);
        self.columns.push(ColumnDesc { field, test, kind, offset: self.bytes.len() });
        self.bytes.extend_from_slice(data);
    }
}

/// Per-test columns being filled, keyed by test number.
struct Columns<T> {
    index: HashMap<u32, usize>,
    cols: Vec<(u32, Vec<T>)>,
}

impl<T> Default for Columns<T> {
    fn default() -> Self { Self { index: HashMap::new(), cols: Vec::new() } }
}

impl<T: Copy> Columns<T> {
    fn column(&mut self, test: u32, n: usize, missing: T) -> &mut Vec<T> {
        let next = self.cols.len();
        let i = *self.index.entry(test).or_insert(next);
        if i == next { self.cols.push((test, vec![missing; n])); }
        &mut self.cols[i].1
    }

    /// In test-number order, so the same parse always encodes to the same bytes.
    fn sorted(mut self) -> Vec<(u32, Vec<T>)> {
        self.cols.sort_unstable_by_key(|(t, _)| *t);
        self.cols
    }
}

fn pad8(v: &mut Vec<u8>) {
    v.resize(v.len().next_multiple_of(8), 0);
}

/// A column of `Option<T>` as bytes, or `None` when every entry is missing.
fn optional_column<T: Copy>(
    dies: &[DieResult],
    get: impl Fn(&DieResult) -> Option<T>,
    missing: T,
    to_le: impl Fn(T) -> Vec<u8>,
) -> Option<Vec<u8>> {
    if !dies.iter().any(|d| get(d).is_some()) { return None; }
    let mut out = Vec::with_capacity(dies.len() * std::mem::size_of::<T>());
    for d in dies { out.extend_from_slice(&to_le(get(d).unwrap_or(missing))); }
    Some(out)
}

/// Encode a parse as a columnar buffer. See the module docs for the layout.
pub fn encode_columnar(mut parsed: ParsedStdf) -> Vec<u8> {
    let mut body = Body { bytes: Vec::new(), columns: Vec::new() };
    let mut wafer_extras: Vec<Value> = Vec::with_capacity(parsed.wafers.len());

    for wafer in &mut parsed.wafers {
        let dies = std::mem::take(&mut wafer.results);
        let first = body.columns.len();

        let i32s = |v: i32| v.to_le_bytes().to_vec();
        let u32s = |v: u32| v.to_le_bytes().to_vec();
        if let Some(b) = optional_column(&dies, |d| d.x, MISSING_I32, i32s) { body.push("x", None, Kind::I32, &b); }
        if let Some(b) = optional_column(&dies, |d| d.y, MISSING_I32, i32s) { body.push("y", None, Kind::I32, &b); }
        if let Some(b) = optional_column(&dies, |d| d.die_index, MISSING_U32, u32s) { body.push("dieIndex", None, Kind::U32, &b); }
        if let Some(b) = optional_column(&dies, |d| d.hbin, MISSING_U32, u32s) { body.push("hbin", None, Kind::U32, &b); }
        if let Some(b) = optional_column(&dies, |d| d.sbin, MISSING_U32, u32s) { body.push("sbin", None, Kind::U32, &b); }
        if let Some(b) = optional_column(&dies, |d| d.site_num, MISSING_U32, u32s) { body.push("siteNum", None, Kind::U32, &b); }
        if dies.iter().any(|d| d.supersedes.is_some()) {
            let b: Vec<u8> = dies.iter().map(|d| match d.supersedes {
                None => 0,
                Some("partId") => 1,
                Some("position") => 2,
                Some(other) => unreachable!("supersedes {other:?} has no column code"),
            }).collect();
            body.push("supersedes", None, Kind::U8, &b);
        }

        // One pass over the dies, scattering each reading into its test's
        // column; then the columns in sorted key order, so the same parse always
        // encodes to the same bytes.
        let n = dies.len();
        let mut values: Columns<f64> = Columns::default();
        let mut verdicts: Columns<i8> = Columns::default();
        for (i, d) in dies.iter().enumerate() {
            for (t, v) in d.test_values.iter() { values.column(t, n, f64::NAN)[i] = v; }
            for (t, p) in d.test_pass.iter() { verdicts.column(t, n, -1)[i] = p as i8; }
        }
        for (key, col) in values.sorted() {
            // NaN (missing) survives the round trip as NaN, so it is skipped here.
            let exact_f32 = col.iter().all(|&v| v.is_nan() || (v as f32) as f64 == v);
            if exact_f32 {
                let b: Vec<u8> = col.iter().flat_map(|&v| (v as f32).to_le_bytes()).collect();
                body.push("testValues", Some(key.to_string()), Kind::F32, &b);
            } else {
                let b: Vec<u8> = col.iter().flat_map(|v| v.to_le_bytes()).collect();
                body.push("testValues", Some(key.to_string()), Kind::F64, &b);
            }
        }
        for (key, col) in verdicts.sorted() {
            let b: Vec<u8> = col.iter().map(|&v| v as u8).collect();
            body.push("testPass", Some(key.to_string()), Kind::I8, &b);
        }

        let columns: Vec<ColumnDesc> = body.columns.drain(first..).collect();
        let mut extra = json!({ "dieCount": dies.len(), "columns": columns });
        if dies.iter().any(|d| d.part_id.is_some()) {
            extra["partIds"] = dies.iter().map(|d| d.part_id.clone()).collect::<Vec<_>>().into();
        }
        wafer_extras.push(extra);
    }

    let mut header = serde_json::to_value(&parsed).expect("ParsedStdf serialises");
    header["columnarFormat"] = FORMAT.into();
    if let Some(wafers) = header.get_mut("wafers").and_then(Value::as_array_mut) {
        for (w, extra) in wafers.iter_mut().zip(wafer_extras) {
            let obj = w.as_object_mut().expect("a wafer serialises as an object");
            obj.remove("results");
            if let Value::Object(e) = extra { obj.extend(e); }
        }
    }

    let json = serde_json::to_vec(&header).expect("header serialises");
    let mut out = body.bytes;
    out.reserve_exact(json.len() + 4);
    out.extend_from_slice(&json);
    out.extend_from_slice(&(json.len() as u32).to_le_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{LotMeta, TestMap, WaferData};
    use serde_json::Map;
    use std::collections::HashMap;
    use std::sync::Arc;

    /// A reference decoder: rebuilds exactly what `serde_json::to_value` makes of
    /// the parse. The host's decoder (`tsmap/src/columnar.ts`) follows the same
    /// rules and is tested against the same expectation.
    fn decode(buf: &[u8]) -> Value {
        let n = u32::from_le_bytes(buf[buf.len() - 4..].try_into().unwrap()) as usize;
        let header_at = buf.len() - 4 - n;
        let mut header: Value = serde_json::from_slice(&buf[header_at..buf.len() - 4]).unwrap();
        let body_start = 0;
        let body = &buf[..header_at];
        assert_eq!(header.as_object_mut().unwrap().remove("columnarFormat"), Some(FORMAT.into()));
        for w in header["wafers"].as_array_mut().unwrap() {
            let obj = w.as_object_mut().unwrap();
            let count = obj.remove("dieCount").unwrap().as_u64().unwrap() as usize;
            let part_ids = obj.remove("partIds");
            let columns = obj.remove("columns").unwrap();
            let mut dies: Vec<Map<String, Value>> = vec![Map::new(); count];
            for c in columns.as_array().unwrap() {
                let field = c["field"].as_str().unwrap();
                let off = c["offset"].as_u64().unwrap() as usize;
                let kind = c["kind"].as_str().unwrap();
                let size = match kind { "i32" | "u32" | "f32" => 4, "u8" | "i8" => 1, "f64" => 8, k => panic!("kind {k}") };
                assert_eq!((body_start + off) % 8, 0, "{field} starts on an 8-byte boundary");
                for (i, die) in dies.iter_mut().enumerate() {
                    let b = &body[off + i * size..off + (i + 1) * size];
                    let v: Option<Value> = match kind {
                        "i32" => { let v = i32::from_le_bytes(b.try_into().unwrap()); (v != MISSING_I32).then(|| v.into()) }
                        "u32" => { let v = u32::from_le_bytes(b.try_into().unwrap()); (v != MISSING_U32).then(|| v.into()) }
                        "u8" => match b[0] { 0 => None, 1 => Some("partId".into()), 2 => Some("position".into()), x => panic!("{x}") },
                        "i8" => match b[0] as i8 { -1 => None, 0 => Some(false.into()), 1 => Some(true.into()), x => panic!("{x}") },
                        "f32" => { let v = f32::from_le_bytes(b.try_into().unwrap()) as f64; (!v.is_nan()).then(|| v.into()) }
                        _ => { let v = f64::from_le_bytes(b.try_into().unwrap()); (!v.is_nan()).then(|| v.into()) }
                    };
                    let Some(v) = v else { continue };
                    match c.get("test").and_then(Value::as_str) {
                        Some(t) => { die.entry(field).or_insert_with(|| json!({})).as_object_mut().unwrap().insert(t.into(), v); }
                        None => { die.insert(field.into(), v); }
                    }
                }
            }
            if let Some(Value::Array(ids)) = part_ids {
                for (die, id) in dies.iter_mut().zip(ids) {
                    if !id.is_null() { die.insert("partId".into(), id); }
                }
            }
            obj.insert("results".into(), dies.into_iter().map(Value::Object).collect::<Vec<_>>().into());
        }
        header
    }

    fn round_trip(make: impl Fn() -> ParsedStdf) {
        let expected = serde_json::to_value(make()).unwrap();
        let buf = encode_columnar(make());
        assert_eq!(decode(&buf), expected);
    }

    fn die(x: Option<i32>) -> DieResult {
        DieResult {
            x, y: x.map(|v| -v), die_index: None, hbin: None, sbin: None, site_num: None,
            part_id: None, supersedes: None, test_values: TestMap::new(), test_pass: TestMap::new(),
        }
    }

    fn lot(wafers: Vec<Vec<DieResult>>) -> ParsedStdf {
        ParsedStdf {
            meta: LotMeta::default(),
            wafers: wafers.into_iter().enumerate().map(|(i, results)| WaferData {
                wafer_id: format!("W{i}"), wafer_id_placeholder: false, results,
                part_count: Some(3), good_count: None, fail_count: None, fields: Vec::new(),
            }).collect(),
            test_defs: HashMap::new(), sites: Vec::new(), hbin_defs: Vec::new(), sbin_defs: Vec::new(),
            pass_hbins: vec![1], warnings: Vec::new(),
        }
    }

    #[test]
    fn every_field_and_every_missing_state_round_trips() {
        round_trip(every_field_lot);
    }

    fn every_field_lot() -> ParsedStdf {
        {
            let k = |s: &str| -> Arc<str> { Arc::from(s) };
            let mut a = die(Some(3));
            a.hbin = Some(0); a.sbin = Some(32767); a.site_num = Some(255);
            a.part_id = Some("P1".into()); a.supersedes = Some("partId");
            a.test_values.insert(k("1001"), -0.0);
            a.test_values.insert(k("1002"), 1.0e-300);
            a.test_pass.insert(k("2001"), false);
            let mut b = die(None);
            b.die_index = Some(0); b.supersedes = Some("position");
            b.test_values.insert(k("1002"), f64::MAX);
            b.test_pass.insert(k("2001"), true);
            b.test_pass.insert(k("1002"), true);
            let c = die(Some(-32767));
            lot(vec![vec![a, b, c], vec![], vec![die(Some(0))]])
        }
    }

    #[test]
    fn a_test_column_is_f32_only_when_every_value_survives_f32() {
        let buf = encode_columnar({
            let mut a = die(Some(1));
            let mut b = die(Some(2));
            // 1001: STDF-like readings, exact in f32. 1002: 0.1 is not.
            a.test_values.insert(Arc::from("1001"), f64::from(0.1f32));
            b.test_values.insert(Arc::from("1001"), 0.5);
            a.test_values.insert(Arc::from("1002"), 0.5);
            b.test_values.insert(Arc::from("1002"), 0.1);
            lot(vec![vec![a, b]])
        });
        let n = u32::from_le_bytes(buf[buf.len() - 4..].try_into().unwrap()) as usize;
        let header: Value = serde_json::from_slice(&buf[buf.len() - 4 - n..buf.len() - 4]).unwrap();
        let kind = |test: &str| header["wafers"][0]["columns"].as_array().unwrap().iter()
            .find(|c| c["test"] == test).unwrap()["kind"].as_str().unwrap().to_owned();
        assert_eq!(kind("1001"), "f32");
        assert_eq!(kind("1002"), "f64", "one value needing f64 keeps the whole column f64");
        // And both decode to exactly what went in.
        let decoded = decode(&buf);
        assert_eq!(decoded["wafers"][0]["results"][1]["testValues"]["1002"], json!(0.1));
        assert_eq!(decoded["wafers"][0]["results"][0]["testValues"]["1001"], json!(f64::from(0.1f32)));
    }

    #[test]
    fn header_padding_covers_every_remainder() {
        // Wafer IDs of 0..16 characters move the header length through every
        // remainder mod 8, so the body start is exercised at each padding size.
        for len in 0..16 {
            round_trip(|| {
                let mut p = lot(vec![vec![die(Some(1))]]);
                p.wafers[0].wafer_id = "x".repeat(len);
                p.wafers[0].results[0].test_values.insert(Arc::from("7"), 0.5);
                p
            });
        }
    }

    #[test]
    fn a_die_result_field_the_encoder_does_not_know_fails_here() {
        // Every DieResult field set: serde names them all. If a field is added to
        // DieResult, this list — and the encoder — must learn it, or the field
        // would silently vanish from every columnar parse.
        let mut d = die(Some(1));
        d.die_index = Some(1); d.hbin = Some(1); d.sbin = Some(1); d.site_num = Some(1);
        d.part_id = Some("p".into()); d.supersedes = Some("partId");
        d.test_values.insert(Arc::from("1"), 1.0);
        d.test_pass.insert(Arc::from("1"), true);
        let v = serde_json::to_value(&d).unwrap();
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["dieIndex", "hbin", "partId", "sbin", "siteNum", "supersedes", "testPass", "testValues", "x", "y"]);
    }

    #[test]
    fn every_sample_stdf_and_atdf_round_trips() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data");
        let mut seen = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let bytes = std::fs::read(&path).unwrap();
            let parse: fn(&[u8]) -> crate::error::ParseResult<ParsedStdf> = match ext {
                "stdf" => crate::parse_stdf::parse_stdf_from_bytes,
                "atdf" => crate::parse_atdf::parse_atdf_from_bytes,
                _ => continue,
            };
            round_trip(|| parse(&bytes).unwrap());
            seen += 1;
        }
        assert!(seen > 20, "sample_data should hold the STDF/ATDF fixtures ({seen} found)");
    }

    /// Golden pairs for the JS decoder's test (`tsmap/src/columnar.test.ts`): the
    /// buffer (as hex), and the JSON serde makes of the same parse. The JS decoder must turn
    /// the one into the other exactly. Fails when they are stale; regenerate with
    /// `UPDATE_GOLDEN=1 cargo test --lib columnar`.
    #[test]
    fn golden_files_for_the_js_decoder_are_current() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/columnar-golden");
        let stdf = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/COORDLESS-LOT-01.stdf")).unwrap();
        let cases: [(&str, Box<dyn Fn() -> ParsedStdf>); 2] = [
            ("every-field", Box::new(every_field_lot)),
            ("coordless-lot", Box::new(move || crate::parse_stdf::parse_stdf_from_bytes(&stdf).unwrap())),
        ];
        let update = std::env::var_os("UPDATE_GOLDEN").is_some();
        for (name, make) in cases {
            // Hex, so the JS test can load it as text (`?raw`) like every other fixture.
            let bin: Vec<u8> = encode_columnar(make()).iter().map(|b| format!("{b:02x}")).collect::<String>().into_bytes();
            let json = serde_json::to_vec(&serde_json::to_value(make()).unwrap()).unwrap();
            let (bin_path, json_path) = (format!("{dir}/{name}.hex"), format!("{dir}/{name}.json"));
            if update {
                std::fs::create_dir_all(dir).unwrap();
                std::fs::write(&bin_path, &bin).unwrap();
                std::fs::write(&json_path, &json).unwrap();
            } else {
                let stale = std::fs::read(&bin_path).ok() != Some(bin) || std::fs::read(&json_path).ok() != Some(json);
                assert!(!stale, "{name}: golden files are stale — UPDATE_GOLDEN=1 cargo test --lib columnar");
            }
        }
    }
}
