use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use crate::types::*;
use crate::flat_wafers::{FlatRow, split_parts, into_parsed};
use crate::parse_csv::CsvMapping;
use crate::error::{ParseError, ParseResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonHeadersResult {
    pub headers: Vec<String>,
    pub sample: Vec<HashMap<String, String>>,
    pub row_count: usize,
}

#[cfg(feature = "native")]
pub fn json_headers_sync(path: String) -> ParseResult<JsonHeadersResult> {
    let text = crate::read_file::read_text(&path)?;
    let raw: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|e| ParseError::json_invalid(format!("Invalid JSON: {e}")))?;

    let rows = flatten_to_rows(&raw).ok_or_else(|| ParseError::json_invalid("Could not find an array of objects in this JSON file"))?;

    if rows.is_empty() {
        return Err(ParseError::json_invalid("JSON array is empty"));
    }

    let mut header_set: indexmap::IndexSet<String> = indexmap::IndexSet::new();
    for row in rows.iter().take(20) {
        for (k, _) in row.entries() {
            header_set.insert(k);
        }
    }
    let headers: Vec<String> = header_set.into_iter().collect();
    // The preview is five rows for a mapping UI, so stringify only those — the
    // rows themselves now hold borrowed `Value`s (see `Row`).
    let sample: Vec<HashMap<String, String>> = rows.iter().take(5)
        .map(|r| r.entries().into_iter().map(|(k, v)| (k, value_to_string(v))).collect())
        .collect();

    Ok(JsonHeadersResult { headers, sample, row_count: rows_len(&raw) })
}

#[cfg(feature = "native")]
pub fn parse_json_sync(path: String, mapping: CsvMapping) -> ParseResult<ParsedStdf> {
    let text = crate::read_file::read_text(&path)?;
    let raw: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|e| ParseError::json_invalid(format!("Invalid JSON: {e}")))?;
    parse_json_from_value(raw, mapping)
}

pub fn parse_json_from_bytes(bytes: &[u8], mapping: CsvMapping) -> ParseResult<ParsedStdf> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    // Parse straight from the byte slice — `from_slice` UTF-8-validates internally,
    // so the previous `String::from_utf8(bytes.to_vec())` (a full copy of the file)
    // is pure waste. Strip a leading UTF-8 BOM by byte so we still skip it.
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let raw: Value = serde_json::from_slice(bytes)
        .map_err(|e| ParseError::json_invalid(format!("Invalid JSON: {e}")))?;
    parse_json_from_value(raw, mapping)
}

fn parse_json_from_value(raw: Value, mapping: CsvMapping) -> ParseResult<ParsedStdf> {
    let flat_rows = flatten_to_rows(&raw).ok_or_else(|| ParseError::json_invalid("Could not find an array of objects in this JSON file"))?;

    let is_long_format = (mapping.testname_col.is_some() || mapping.testnumber_col.is_some())
        && mapping.testvalue_col.is_some();

    // `t.test_number` is assigned upstream in TS (mappingUI.ts's readMapping,
    // hashed from the column's own key) — Rust just uses it as given. `order`
    // is the one thing only Rust can supply here: the column's position in
    // this array, i.e. the file's own column order, independent of whatever
    // number the hash produced.
    let mut test_defs: HashMap<String, TestDef> = mapping
        .tests
        .iter()
        .enumerate()
        .map(|(i, t)| {
            (
                t.test_number.to_string(),
                TestDef {
                    name: t.name.clone(),
                    test_type: "P".to_string(),
                    lo_limit: None,
                    hi_limit: None,
                    units: None,
                    order: Some(i as u32),
                    lo_spec: None,
                    hi_spec: None,
                    lo_limit_inclusive: None,
                    hi_limit_inclusive: None,
                },
            )
        })
        .collect();

    if !is_long_format {
        // Wide-format fast path: each flattened row read once by mapped key.
        return Ok(parse_json_wide(&flat_rows, &mapping, test_defs));
    }

    // Long format: one row per (die, test). Mirrors parse_csv.rs's own path —
    // test numbers discovered per row here, the pivot into dies per wafer and
    // per test pass shared in `flat_wafers`.
    let mut long_fmt_test_numbers: HashMap<String, u32> = HashMap::new();
    // Seeded with the wide-format numbers already assigned above, so a wide
    // test column and a long-format test name in the same file can never
    // collide on the same number — see the matching comment in parse_csv.rs.
    let mut used_test_numbers: std::collections::HashSet<u32> =
        mapping.tests.iter().map(|t| t.test_number).collect();
    let mut next_order: u32 = 0;
    let name_col = mapping.testname_col.as_deref();
    let num_col = mapping.testnumber_col.as_deref();
    let val_col = mapping.testvalue_col.as_deref().unwrap();
    let mut rows: Vec<FlatRow> = Vec::with_capacity(flat_rows.len());

    for row in &flat_rows {
        let text = |c: &str| cell_text(row, c);
        let opt_text = |c: &Option<String>| c.as_deref().map(text).unwrap_or_default();
        let int = |c: &Option<String>| c.as_deref().and_then(|c| cell_i64(row, c));
        let mut out = FlatRow {
            lot: opt_text(&mapping.lot),
            wafer: opt_text(&mapping.wafer),
            split_parts: split_parts(&mapping.split_by, text),
            meta: mapping.meta.iter().map(|c| text(c)).collect(),
            x: int(&mapping.x),
            y: int(&mapping.y),
            hbin: int(&mapping.hbin),
            sbin: int(&mapping.sbin),
            site_num: int(&mapping.site),
            tests: Vec::new(),
        };

        let test_name = name_col.map(text).unwrap_or_default();
        // The one value cell of a long-format row, read as a number where the
        // document holds one. `has_value` keeps the old "empty cell is no test"
        // behaviour without needing the string form.
        let test_value = cell_f64(row, val_col);
        let has_value = test_value.is_some();
        // A row's own number, when the column is mapped and this row's value
        // parses — takes priority over the name as the test's real identity.
        let real_number: Option<u32> = num_col
            .and_then(|c| cell_i64(row, c))
            .and_then(|n| u32::try_from(n).ok());

        if has_value && !(test_name.is_empty() && real_number.is_none()) {
            let identity_key = match real_number {
                Some(n) => format!("#{n}"),
                None => test_name.clone(),
            };
            let tnum = *long_fmt_test_numbers.entry(identity_key).or_insert_with(|| {
                // See the matching comment in parse_csv.rs: a real number
                // (from a mapped, parseable number column) is used as-is;
                // otherwise hashing the name — rather than numbering by
                // first-encounter order — means the number survives a
                // re-export of the same data in a different row order.
                let n = match real_number {
                    Some(n) => { used_test_numbers.insert(n); n }
                    None => crate::test_identity::stable_test_number(&test_name, &mut used_test_numbers),
                };
                let order = next_order;
                next_order += 1;
                let lo_limit = mapping.lo_limit_col.as_deref().and_then(|c| cell_f64(row, c));
                let hi_limit = mapping.hi_limit_col.as_deref().and_then(|c| cell_f64(row, c));
                let lo_spec = mapping.lo_spec_col.as_deref().and_then(|c| cell_f64(row, c));
                let hi_spec = mapping.hi_spec_col.as_deref().and_then(|c| cell_f64(row, c));
                let units = mapping.units_col.as_deref()
                    .map(|c| cell_text(row, c)).filter(|s| !s.is_empty());
                // No name column (or this row's name cell was empty): the
                // number is all we have, so it doubles as the display name.
                let display_name = if test_name.is_empty() { n.to_string() } else { test_name.clone() };
                test_defs.insert(n.to_string(), TestDef {
                    name: display_name,
                    test_type: "P".to_string(),
                    lo_limit, hi_limit, units,
                    order: Some(order),
                    lo_spec,
                    hi_spec,
                    lo_limit_inclusive: None,
                    hi_limit_inclusive: None,
                });
                n
            });
            if let Some(v) = test_value { out.tests.push((tnum, v)); }
        }
        rows.push(out);
    }

    Ok(into_parsed(rows, &mapping, true, test_defs, Vec::new()))
}

/// Allocation-light wide-format JSON parse over already-flattened rows. Reads each
/// row once by mapped key, parses straight to the target type, and groups dies by
/// wafer/split key in a single pass — avoiding the `groups` map of references and
/// the per-die re-lookup/re-parse of the original path. Result shape matches the
/// long-format path exactly.
fn parse_json_wide(
    flat_rows: &[Row],
    mapping: &CsvMapping,
    test_defs: HashMap<String, TestDef>,
) -> ParsedStdf {
    // (test number, source column) — resolved once, reused per row.
    let test_cols: Vec<(u32, &str)> = mapping.tests.iter()
        .map(|t| (t.test_number, t.col.as_str())).collect();

    let rows: Vec<FlatRow> = flat_rows.iter().map(|row| {
        let text = |c: &str| cell_text(row, c);
        let opt_text = |c: &Option<String>| c.as_deref().map(text).unwrap_or_default();
        let int = |c: &Option<String>| c.as_deref().and_then(|c| cell_i64(row, c));
        FlatRow {
            lot: opt_text(&mapping.lot),
            wafer: opt_text(&mapping.wafer),
            split_parts: split_parts(&mapping.split_by, text),
            meta: mapping.meta.iter().map(|c| text(c)).collect(),
            x: int(&mapping.x),
            y: int(&mapping.y),
            hbin: int(&mapping.hbin),
            sbin: int(&mapping.sbin),
            site_num: int(&mapping.site),
            tests: test_cols.iter()
                .filter_map(|(t, c)| cell_f64(row, c).map(|v| (*t, v)))
                .collect(),
        }
    }).collect();

    into_parsed(rows, mapping, false, test_defs, Vec::new())
}

/// One row's cells, **borrowed** from the parsed document.
///
/// This used to be `HashMap<String, String>`: every cell was rendered to a
/// `String` here and then parsed straight back to a number by the consumer.
/// On a 50k-die x 50-test file that round trip was 626 ms of a 1166 ms parse —
/// 2.8M allocations to turn numbers serde_json had already decoded into text,
/// and 2.8M `str::parse` calls to undo it. Holding `&Value` skips both; the
/// document outlives the rows, which only exist inside `parse_json_from_value`.
///
/// A flat object needs no row map at all — it *is* the row, so it is borrowed
/// whole. Only shapes that have to synthesise keys (nested objects flattened to
/// `"outer.inner"`, or wafer-level scalars merged into each die) allocate one.
/// On a flat 50k-row file that is 50k maps and 2.8M key clones not made.
enum Row<'a> {
    /// The document's own object, used as-is.
    Obj(&'a serde_json::Map<String, Value>),
    /// Keys that exist nowhere in the document to borrow from.
    Flat(HashMap<String, &'a Value>),
}

impl<'a> Row<'a> {
    fn get(&self, col: &str) -> Option<&'a Value> {
        match self {
            Row::Obj(m) => m.get(col),
            Row::Flat(m) => m.get(col).copied(),
        }
    }

    /// Only for the header/preview paths (20 and 5 rows), never per die. Returns
    /// owned keys because a `Flat` row's keys belong to the row while an `Obj`
    /// row's belong to the document — no single borrowed lifetime covers both,
    /// and it is not worth bending the hot path to unify them.
    /// Native-only: the wasm build exposes no JSON header/preview entry point
    /// (the mapping UI sniffs those in TS), so without this gate it is dead code
    /// there and warns.
    #[cfg(feature = "native")]
    fn entries(&self) -> Vec<(String, &'a Value)> {
        match self {
            Row::Obj(m) => m.iter().map(|(k, v)| (k.clone(), v)).collect(),
            Row::Flat(m) => m.iter().map(|(k, v)| (k.clone(), *v)).collect(),
        }
    }
}

/// Does this object have to be flattened, or can it be read where it lies?
/// A nested object becomes `"outer.inner"` keys, which do not exist in the
/// document; anything else (including arrays, which stringify the same either
/// way) is readable in place.
fn needs_flattening(obj: &serde_json::Map<String, Value>) -> bool {
    obj.values().any(|v| v.is_object())
}

/// A cell as an integer, matching what the old stringify-then-parse did exactly:
/// a JSON integer, or a string holding one. A non-integral number (`5.5`, or
/// `5.0`, which serde_json holds as f64) yields `None`, just as `"5.5".parse::<i32>()`
/// did — so a fractional coordinate is still no coordinate rather than a silent
/// truncation to a die that was never tested.
fn cell_i64(row: &Row, col: &str) -> Option<i64> {
    match row.get(col)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

/// A cell as a measured value: a JSON number read directly, or a numeric string.
/// Deliberately not booleans or `null` — `"true".parse::<f64>()` failed before and
/// a verdict is not a measurement.
fn cell_f64(row: &Row, col: &str) -> Option<f64> {
    match row.get(col)? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// A cell as display/metadata text. Still allocates, but only for the handful of
/// genuinely textual columns (lot, wafer, metadata, units) rather than all of them.
fn cell_text(row: &Row, col: &str) -> String {
    row.get(col).map(|v| value_to_string(v)).unwrap_or_default()
}

fn flatten_to_rows(val: &Value) -> Option<Vec<Row<'_>>> {
    match val {
        Value::Array(arr) => {
            if arr.is_empty() { return None; }
            let die_keys = ["results","die_results","dies","data","measurements","records"];
            if let Some(obj) = arr[0].as_object() {
                let inner_key = die_keys.iter()
                    .find(|&&k| obj.get(k).map_or(false, |v| v.is_array()));
                if let Some(&inner_key) = inner_key {
                    let mut out: Vec<Row> = Vec::new();
                    for wafer in arr.iter() {
                        let wafer_obj = match wafer.as_object() { Some(o) => o, None => continue };
                        let mut wafer_scalars: HashMap<String, &Value> = HashMap::new();
                        for (k, v) in wafer_obj.iter() {
                            if k.as_str() != inner_key && !v.is_array() && !v.is_object() {
                                wafer_scalars.insert(k.clone(), v);
                            }
                        }
                        if let Some(dies) = wafer.get(inner_key).and_then(|v| v.as_array()) {
                            out.reserve(dies.len());
                            for die in dies {
                                let mut row = wafer_scalars.clone();
                                flatten_value_into(die, "", &mut row);
                                out.push(Row::Flat(row));
                            }
                        }
                    }
                    return Some(out);
                }
            }
            Some(arr.iter().map(|v| match v.as_object() {
                Some(obj) if !needs_flattening(obj) => Row::Obj(obj),
                _ => {
                    let mut row = HashMap::new();
                    flatten_value_into(v, "", &mut row);
                    Row::Flat(row)
                }
            }).collect())
        }
        Value::Object(obj) => {
            let preferred = ["wafers","results","dies","die_results","data","measurements","records"];
            let key = preferred.iter()
                .find(|&&k| obj.get(k).map_or(false, |v| v.is_array()))
                .map(|&k| k.to_string())
                .or_else(|| obj.iter().find(|(_, v)| v.is_array()).map(|(k, _)| k.clone()));
            if let Some(k) = key {
                flatten_to_rows(obj.get(&k)?)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn flatten_value_into<'a>(val: &'a Value, prefix: &str, out: &mut HashMap<String, &'a Value>) {
    if let Some(obj) = val.as_object() {
        for (k, v) in obj {
            let key = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
            if let Some(inner) = v.as_object() {
                for (k2, v2) in inner {
                    out.insert(format!("{}.{}", key, k2), v2);
                }
            } else {
                out.insert(key, v);
            }
        }
    }
}

#[cfg(feature = "native")]
fn rows_len(val: &Value) -> usize {
    match val {
        Value::Array(arr) => {
            let die_keys = ["results","die_results","dies","data","measurements","records"];
            if let Some(obj) = arr.first().and_then(|v| v.as_object()) {
                if let Some(&k) = die_keys.iter().find(|&&k| obj.get(k).map_or(false, |v| v.is_array())) {
                    return arr.iter()
                        .filter_map(|w| w.get(k)?.as_array())
                        .map(|d| d.len())
                        .sum();
                }
            }
            arr.len()
        }
        Value::Object(obj) => {
            let preferred = ["wafers","results","dies","die_results","data","measurements","records"];
            let key = preferred.iter()
                .find(|&&k| obj.get(k).map_or(false, |v| v.is_array()))
                .map(|&k| k.to_string())
                .or_else(|| obj.iter().find(|(_, v)| v.is_array()).map(|(k, _)| k.clone()));
            key.and_then(|k| obj.get(&k)).map(rows_len).unwrap_or(0)
        }
        _ => 0,
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b)   => b.to_string(),
        Value::Null      => String::new(),
        other            => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_csv::CsvTestCol;
    use std::io::Write;

    fn tmp(content: &str) -> std::path::PathBuf {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f.into_temp_path().keep().unwrap()
    }

    fn basic_mapping(x: &str, y: &str) -> CsvMapping {
        CsvMapping {
            x: Some(x.to_string()), y: Some(y.to_string()),
            hbin: None, sbin: None, wafer: None, lot: None, site: None,
            tests: vec![], meta: vec![], split_by: vec![],
            testname_col: None, testnumber_col: None, testvalue_col: None,
            lo_limit_col: None, hi_limit_col: None, lo_spec_col: None, hi_spec_col: None, units_col: None,
            pass_bins: vec![],
        }
    }

    #[test]
    fn headers_from_flat_array() {
        let json = r#"[{"x":1,"y":2,"hbin":1},{"x":3,"y":4,"hbin":2}]"#;
        let path = tmp(json);
        let result = json_headers_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.headers.contains(&"x".to_string()));
        assert!(result.headers.contains(&"y".to_string()));
        assert!(result.headers.contains(&"hbin".to_string()));
        assert!(result.sample.len() <= 5);
        assert_eq!(result.row_count, 2);
    }

    #[test]
    fn headers_from_envelope_object() {
        let json = r#"{"wafers":[{"x":0,"y":0}]}"#;
        let path = tmp(json);
        let result = json_headers_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.headers.contains(&"x".to_string()));
    }

    #[test]
    fn headers_from_nested_results_array() {
        let json = r#"[{"waferId":"W1","results":[{"x":0,"y":0},{"x":1,"y":1}]}]"#;
        let path = tmp(json);
        let result = json_headers_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.headers.contains(&"x".to_string()));
        assert_eq!(result.row_count, 2);
    }

    #[test]
    fn bom_stripped_before_parse() {
        let json = "\u{feff}[{\"x\":1,\"y\":2}]";
        let path = tmp(json);
        let result = json_headers_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.headers.contains(&"x".to_string()));
    }

    #[test]
    fn flat_array_basic_dies() {
        let json = r#"[{"x":3,"y":7},{"x":-1,"y":-2}]"#;
        let path = tmp(json);
        let result = parse_json_sync(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        assert_eq!(result.wafers.len(), 1);
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 2);
        assert!(dies.iter().any(|d| d.x == Some(3) && d.y == Some(7)));
    }

    #[test]
    fn hbin_sbin_from_fields() {
        let json = r#"[{"x":0,"y":0,"hb":2,"sb":5}]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        m.sbin = Some("sb".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        let die = &result.wafers[0].results[0];
        assert_eq!(die.hbin, Some(2));
        assert_eq!(die.sbin, Some(5));
    }

    #[test]
    fn rows_with_invalid_coords_are_kept_as_coordinate_less() {
        let json = r#"[{"x":"bad","y":1},{"x":2,"y":3}]"#;
        let path = tmp(json);
        let result = parse_json_sync(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 2, "an unparseable x/y no longer drops the row");
        assert_eq!(dies.iter().filter(|d| d.x.is_some()).count(), 1);
        assert_eq!(dies.iter().filter(|d| d.x.is_none()).count(), 1);
    }

    #[test]
    fn envelope_object_unwrapped() {
        let json = r#"{"wafers":[{"x":0,"y":0},{"x":1,"y":1}]}"#;
        let path = tmp(json);
        let result = parse_json_sync(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
    }

    #[test]
    fn nested_results_array_flattened_with_wafer_scalars() {
        let json = r#"[{"waferId":"W01","results":[{"x":0,"y":0},{"x":1,"y":1}]},
                        {"waferId":"W02","results":[{"x":2,"y":2}]}]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.wafer = Some("waferId".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers.len(), 2);
        let w1 = result.wafers.iter().find(|w| w.wafer_id == "W01").unwrap();
        assert_eq!(w1.results.len(), 2);
    }

    #[test]
    fn rows_without_wafer_col_go_to_w1() {
        let json = r#"[{"x":0,"y":0}]"#;
        let path = tmp(json);
        let result = parse_json_sync(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        assert_eq!(result.wafers[0].wafer_id, "W1");
    }

    #[test]
    fn part_count_and_good_count_computed() {
        let json = r#"[{"x":0,"y":0},{"x":1,"y":0},{"x":2,"y":0}]"#;
        let path = tmp(json);
        let result = parse_json_sync(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        let w = &result.wafers[0];
        assert_eq!(w.part_count, Some(3));
        assert_eq!(w.good_count, None, "no pass bins: which dies are good is unknown");
    }

    #[test]
    fn pass_bins_filter_good_count() {
        let json = r#"[{"x":0,"y":0,"hb":1},{"x":1,"y":0,"hb":2},{"x":2,"y":0,"hb":1}]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        m.pass_bins = vec![1];
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        let w = &result.wafers[0];
        assert_eq!(w.good_count, Some(2));
        assert_eq!(w.fail_count, Some(1));
    }

    #[test]
    fn test_values_from_mapped_columns() {
        let json = r#"[{"x":0,"y":0,"t1":1.5,"t2":3.0}]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.tests = vec![
            CsvTestCol { col: "t1".to_string(), test_number: 1, name: "T1".to_string() },
            CsvTestCol { col: "t2".to_string(), test_number: 2, name: "T2".to_string() },
        ];
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        let die = &result.wafers[0].results[0];
        assert!((die.test_values["1"] - 1.5).abs() < 1e-9);
        assert!((die.test_values["2"] - 3.0).abs() < 1e-9);
    }

    #[test]
    fn long_format_pivot() {
        let json = r#"[
            {"x":0,"y":0,"test":"Vt","val":1.1},
            {"x":0,"y":0,"test":"Idsat","val":2.2},
            {"x":1,"y":0,"test":"Vt","val":1.3}
        ]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
    }

    #[test]
    fn long_format_number_only_uses_real_number_and_copies_name_from_it() {
        let json = r#"[
            {"x":0,"y":0,"tnum":1001,"val":1.1},
            {"x":0,"y":0,"tnum":1002,"val":2.2},
            {"x":1,"y":0,"tnum":1001,"val":1.3}
        ]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.testnumber_col = Some("tnum".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
        assert_eq!(result.test_defs.get("1001").map(|d| d.name.as_str()), Some("1001"));
        assert_eq!(result.test_defs.get("1002").map(|d| d.name.as_str()), Some("1002"));
    }

    #[test]
    fn long_format_name_and_number_uses_real_number_with_given_name() {
        let json = r#"[
            {"x":0,"y":0,"test":"Vt","tnum":2001,"val":1.1},
            {"x":1,"y":0,"test":"Vt","tnum":2001,"val":1.3}
        ]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test".to_string());
        m.testnumber_col = Some("tnum".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.test_defs.len(), 1);
        assert_eq!(result.test_defs.get("2001").map(|d| d.name.as_str()), Some("Vt"));
    }

    #[test]
    fn long_format_row_with_neither_name_nor_number_is_skipped() {
        let json = r#"[
            {"x":0,"y":0,"val":1.1},
            {"x":1,"y":0,"test":"Vt","tnum":2001,"val":1.3}
        ]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test".to_string());
        m.testnumber_col = Some("tnum".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.test_defs.len(), 1);
        let d0 = result.wafers[0].results.iter().find(|d| d.x == Some(0) && d.y == Some(0)).unwrap();
        assert!(d0.test_values.is_empty());
    }

    #[test]
    fn long_format_test_numbers_survive_row_reorder() {
        // Same guard as parse_csv.rs's equivalent test — JSON has its own
        // copy of the long-format pivot rather than sharing CSV's, so the
        // fix (and the regression risk) is duplicated too.
        let forward = r#"[
            {"x":0,"y":0,"test":"Vt","val":1.1},
            {"x":0,"y":0,"test":"Idsat","val":2.2}
        ]"#;
        let reversed = r#"[
            {"x":0,"y":0,"test":"Idsat","val":2.2},
            {"x":0,"y":0,"test":"Vt","val":1.1}
        ]"#;

        let run = |json: &str| {
            let path = tmp(json);
            let mut m = basic_mapping("x", "y");
            m.testname_col = Some("test".to_string());
            m.testvalue_col = Some("val".to_string());
            let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
            let vt_num = result.test_defs.iter().find(|(_, d)| d.name == "Vt").unwrap().0.clone();
            let idsat_num = result.test_defs.iter().find(|(_, d)| d.name == "Idsat").unwrap().0.clone();
            (vt_num, idsat_num)
        };

        assert_eq!(run(forward), run(reversed));
    }

    #[test]
    fn lot_id_from_first_row() {
        let json = r#"[{"x":0,"y":0,"lot":"LOT-99"}]"#;
        let path = tmp(json);
        let mut m = basic_mapping("x", "y");
        m.lot = Some("lot".to_string());
        let result = parse_json_sync(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.meta.get("lotId"), Some("LOT-99"));
    }

    #[test]
    fn sample_file_coordinateless_lot() {
        // sample_data/TESTNUM-COORDLESS-01.json — same lot as the CSV
        // fixture of the same name: W01 fully positioned, W02 mixed (2 of 4
        // rows have null x/y), W03 fully coordinate-less.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/TESTNUM-COORDLESS-01.json");
        let mut m = basic_mapping("x", "y");
        m.wafer = Some("wafer".to_string());
        m.hbin = Some("hbin".to_string());
        m.sbin = Some("sbin".to_string());
        m.tests = vec![
            CsvTestCol { col: "3001".to_string(), test_number: 3001, name: "3001".to_string() },
            CsvTestCol { col: "3002".to_string(), test_number: 3002, name: "3002".to_string() },
            CsvTestCol { col: "3003".to_string(), test_number: 3003, name: "3003".to_string() },
        ];
        let result = parse_json_sync(path.to_string(), m).unwrap();
        assert_eq!(result.wafers.len(), 3);

        let w01 = result.wafers.iter().find(|w| w.wafer_id == "W01").unwrap();
        assert_eq!(w01.results.len(), 4);
        assert!(w01.results.iter().all(|d| d.x.is_some()));

        let w02 = result.wafers.iter().find(|w| w.wafer_id == "W02").unwrap();
        assert_eq!(w02.results.len(), 4, "no row should be dropped");
        assert_eq!(w02.results.iter().filter(|d| d.x.is_some()).count(), 2);
        assert_eq!(w02.results.iter().filter(|d| d.x.is_none()).count(), 2);

        let w03 = result.wafers.iter().find(|w| w.wafer_id == "W03").unwrap();
        assert_eq!(w03.results.len(), 3);
        assert!(w03.results.iter().all(|d| d.x.is_none() && d.y.is_none()));
        assert!(w03.results.iter().all(|d| d.hbin.is_some() && !d.test_values.is_empty()));
    }

    /// Wide-format mapping matching scripts/generate_csv_json_bench.py.
    #[cfg(feature = "bench")]
    fn bench_mapping(n_tests: usize) -> CsvMapping {
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".to_string());
        m.sbin = Some("sbin".to_string());
        m.site = Some("site".to_string());
        m.wafer = Some("wafer".to_string());
        m.lot = Some("lot".to_string());
        m.pass_bins = vec![1];
        m.tests = (0..n_tests)
            .map(|i| {
                let num = 1000 + i as u32;
                CsvTestCol { col: format!("t{num}"), name: format!("t{num}"), test_number: num }
            })
            .collect();
        m
    }

    // Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench --release -- --nocapture bench_parse_json
    #[cfg(feature = "bench")]
    #[test]
    fn bench_parse_json() {
        let path = crate::bench_fixtures::fixture("bench.json");
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => { eprintln!("SKIP: {} not found — run scripts/generate_csv_json_bench.py", path.display()); return; }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;
        let mapping = bench_mapping(50);

        let _ = parse_json_from_bytes(&bytes, mapping.clone()).unwrap(); // warm
        let t = std::time::Instant::now();
        let result = parse_json_from_bytes(&bytes, mapping).unwrap();
        let ms = t.elapsed().as_millis();
        let dies: usize = result.wafers.iter().map(|w| w.results.len()).sum();
        println!(
            "\n=== bench_parse_json ({file_mb:.1} MB) ===\n\
             wafers: {}\ndies:   {dies}\ntests:  {}\ntotal:  {ms} ms\nthroughput: {:.0} MB/s",
            result.wafers.len(), result.test_defs.len(),
            file_mb / (ms as f64 / 1000.0).max(0.001),
        );
    }
}
