use csv::ReaderBuilder;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use crate::types::*;
use crate::flat_wafers::{FlatRow, split_parts, into_parsed};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvHeadersResult {
    pub headers: Vec<String>,
    pub sample: Vec<HashMap<String, String>>,
    pub row_count: usize,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CsvTestCol {
    pub col: String,
    pub test_number: u32,
    pub name: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CsvMapping {
    /// Column mapped to the die's X grid position. `None` (together with `y`)
    /// means no position column was assigned at all — every row/die is then
    /// coordinate-less. Independent of a *row's own* value failing to parse,
    /// which also produces a coordinate-less die rather than dropping the row.
    #[serde(default)]
    pub x: Option<String>,
    /// Column mapped to the die's Y grid position. See `x`.
    #[serde(default)]
    pub y: Option<String>,
    pub hbin: Option<String>,
    pub sbin: Option<String>,
    pub wafer: Option<String>,
    pub lot: Option<String>,
    /// Optional column mapped to the per-die test site (STDF `site_num`). Parsed
    /// numerically; non-numeric values become no site for that die. `#[serde(default)]`
    /// so older mapping payloads without the field still deserialize.
    #[serde(default)]
    pub site: Option<String>,
    pub tests: Vec<CsvTestCol>,
    pub meta: Vec<String>,
    pub split_by: Vec<String>,
    pub testname_col: Option<String>,
    /// Long-format only: a column holding each row's real test number. Optional
    /// alongside `testname_col` — either may be set alone, or both together.
    /// When present and a row's value parses, the real number is used as that
    /// test's identity instead of a hashed one (see `test_identity`); when
    /// `testname_col` is absent, the display name falls back to the number
    /// itself. Long format triggers on `testname_col` OR this being set, plus
    /// `testvalue_col` — a file with only a number column and no name column
    /// is a legitimate case, not just a name-only one. `#[serde(default)]` so
    /// older saved mapping payloads without the field still deserialize.
    #[serde(default)]
    pub testnumber_col: Option<String>,
    pub testvalue_col: Option<String>,
    pub lo_limit_col: Option<String>,
    pub hi_limit_col: Option<String>,
    pub units_col: Option<String>,
    pub pass_bins: Vec<u32>,
}

pub fn csv_headers_from_bytes(bytes: &[u8]) -> Result<CsvHeadersResult, String> {
    let bytes = crate::read_file::decompress_if_gzip(bytes.to_vec())?;
    let mut rdr = build_reader_from_bytes(&bytes);
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.trim().to_string())
        .collect();

    let mut sample: Vec<HashMap<String, String>> = Vec::new();
    for result in rdr.records() {
        let rec = result.map_err(|e| e.to_string())?;
        let row: HashMap<String, String> = headers
            .iter()
            .enumerate()
            .map(|(i, h)| (h.clone(), rec.get(i).unwrap_or("").trim().to_string()))
            .collect();
        sample.push(row);
        if sample.len() >= 5 { break; }
    }

    let row_count = bytes.iter().filter(|&&b| b == b'\n').count().saturating_sub(1);
    Ok(CsvHeadersResult { headers, sample, row_count })
}

pub fn parse_csv_from_bytes(bytes: &[u8], mapping: CsvMapping) -> Result<ParsedStdf, String> {
    let bytes = crate::read_file::decompress_if_gzip(bytes.to_vec())?;
    parse_csv_from_reader(build_reader_from_bytes(&bytes), mapping)
}

#[cfg(feature = "native")]
pub fn csv_headers_inner(path: String) -> Result<CsvHeadersResult, String> {
    let mut rdr = build_reader(&path)?;
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.trim().to_string())
        .collect();

    let mut sample: Vec<HashMap<String, String>> = Vec::new();
    for result in rdr.records() {
        let rec = result.map_err(|e| e.to_string())?;
        let row: HashMap<String, String> = headers
            .iter()
            .enumerate()
            .map(|(i, h)| (h.clone(), rec.get(i).unwrap_or("").trim().to_string()))
            .collect();
        sample.push(row);
        if sample.len() >= 5 { break; }
    }

    let row_count = std::fs::metadata(&path).ok().map(|m| {
        let file_bytes = m.len() as usize;
        if sample.is_empty() { return 0; }
        let sample_bytes: usize = sample.iter()
            .map(|row| row.values().map(|v| v.len() + 2).sum::<usize>())
            .sum();
        let avg = sample_bytes / sample.len();
        if avg == 0 { 0 } else { file_bytes / avg }
    }).unwrap_or(0);

    Ok(CsvHeadersResult { headers, sample, row_count })
}

#[cfg(feature = "native")]
pub fn parse_csv_inner(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String> {
    let rdr = build_reader(&path)?;
    parse_csv_from_reader(rdr, mapping)
}

fn parse_csv_from_reader(mut rdr: csv::Reader<Box<dyn Read>>, mapping: CsvMapping) -> Result<ParsedStdf, String> {
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.trim().to_string())
        .collect();

    let col_idx: HashMap<&str, usize> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| (h.as_str(), i))
        .collect();

    let get = |rec: &csv::StringRecord, col: &str| -> String {
        col_idx
            .get(col)
            .and_then(|&i| rec.get(i))
            .unwrap_or("")
            .trim()
            .to_string()
    };

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
                },
            )
        })
        .collect();

    let all_rows: Vec<csv::StringRecord> = rdr
        .records()
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    // ── Wide-format fast path ──────────────────────────────────────────────────
    // The common case (one column per test): values are read by resolved column
    // index and parsed straight to their target type.
    if !is_long_format {
        return Ok(parse_csv_wide(&all_rows, &col_idx, &mapping, test_defs));
    }

    // ── Long-format path: one row per (die, test) ─────────────────────────────
    // Each row becomes a FlatRow carrying its one test; `flat_wafers` pivots the
    // rows into dies per wafer AND per test pass, so the same die tested at two
    // temperatures no longer has one pass overwrite the other. Test numbers are
    // discovered here, per row.
    let mut long_fmt_test_numbers: HashMap<String, u32> = HashMap::new();
    // Seeded with the wide-format numbers already assigned above (from
    // `mapping.tests`, hashed upstream in TS) so a wide test column and a
    // long-format test name in the SAME file can never collide on the same
    // number — `stable_test_number` treats every number in this set as taken.
    // A single mapping can carry both: the mapping UI lets one column be
    // "Test value" (wide) while others are "Test name"/"Test result" (long).
    let mut used_test_numbers: HashSet<u32> =
        mapping.tests.iter().map(|t| t.test_number).collect();
    let mut next_order: u32 = 0;
    let name_col = mapping.testname_col.as_deref();
    let num_col = mapping.testnumber_col.as_deref();
    let val_col = mapping.testvalue_col.as_deref().unwrap();
    let mut rows: Vec<FlatRow> = Vec::with_capacity(all_rows.len());

    for rec in &all_rows {
        let opt = |c: &Option<String>| c.as_deref().map(|c| get(rec, c)).unwrap_or_default();
        let mut row = FlatRow {
            lot: opt(&mapping.lot),
            wafer: opt(&mapping.wafer),
            split_parts: split_parts(&mapping.split_by, |c| get(rec, c)),
            meta: mapping.meta.iter().map(|c| get(rec, c)).collect(),
            x: opt(&mapping.x).parse().ok(),
            y: opt(&mapping.y).parse().ok(),
            hbin: opt(&mapping.hbin).parse().ok(),
            sbin: opt(&mapping.sbin).parse().ok(),
            site_num: opt(&mapping.site).parse().ok(),
            tests: Vec::new(),
        };

        let test_name = name_col.map(|c| get(rec, c)).unwrap_or_default();
        let test_val  = get(rec, val_col);
        // A row's own number, when the column is mapped and this row's value
        // parses — takes priority over the name as the test's real identity.
        let real_number: Option<u32> = num_col
            .map(|c| get(rec, c))
            .filter(|s| !s.is_empty())
            .and_then(|s| s.trim().parse::<u32>().ok());

        if !test_val.is_empty() && !(test_name.is_empty() && real_number.is_none()) {
            // Keyed by the number when we have one (stable regardless of what
            // the name column says, or whether there even is one), else by name.
            let identity_key = match real_number {
                Some(n) => format!("#{n}"),
                None => test_name.clone(),
            };

            let tnum = *long_fmt_test_numbers.entry(identity_key).or_insert_with(|| {
                // The test's identity is its own number when a number column is
                // mapped and this row's value parsed — a real number, not hashed,
                // so it matches whatever the source system already calls this
                // test. Otherwise (no number column, or an unparseable cell)
                // fall back to hashing the name, as before: hashing rather than
                // numbering by first-encounter order means the number doesn't
                // depend on which row order the file happens to be in. `order`
                // still records encounter order, purely for display — it's
                // independent of the number either way.
                let n = match real_number {
                    Some(n) => { used_test_numbers.insert(n); n }
                    None => crate::test_identity::stable_test_number(&test_name, &mut used_test_numbers),
                };
                let order = next_order;
                next_order += 1;
                let lo_limit = mapping.lo_limit_col.as_deref()
                    .map(|c| get(rec, c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let hi_limit = mapping.hi_limit_col.as_deref()
                    .map(|c| get(rec, c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let units = mapping.units_col.as_deref()
                    .map(|c| get(rec, c)).filter(|s| !s.is_empty());
                // No name column (or this row's name cell was empty): the
                // number is all we have, so it doubles as the display name.
                let display_name = if test_name.is_empty() { n.to_string() } else { test_name.clone() };
                test_defs.insert(n.to_string(), TestDef {
                    name: display_name,
                    test_type: "P".to_string(),
                    lo_limit, hi_limit, units,
                    order: Some(order),
                });
                n
            });
            if let Ok(v) = test_val.parse::<f64>() { row.tests.push((tnum, v)); }
        }
        rows.push(row);
    }

    Ok(into_parsed(rows, &mapping, true, test_defs, Vec::new()))
}

/// Allocation-light wide-format parse: resolve every mapped column to an index
/// once, then read each `StringRecord` by index and parse straight to the target
/// type. Avoids the per-cell `HashMap<String,String>` materialisation, the string
/// round-trips for x/y/bins, and the per-test `format!` of the original path.
/// Result shape (wafers grouped by wafer/split key, part/good/fail counts, lot
/// metadata from the first kept row) matches the long-format path exactly.
fn parse_csv_wide(
    all_rows: &[csv::StringRecord],
    col_idx: &HashMap<&str, usize>,
    mapping: &CsvMapping,
    test_defs: HashMap<String, TestDef>,
) -> ParsedStdf {
    // Resolve a mapped column name to its record index once.
    let idx = |name: &str| col_idx.get(name).copied();
    let opt_idx = |c: &Option<String>| c.as_deref().and_then(idx);

    let x_i = opt_idx(&mapping.x);
    let y_i = opt_idx(&mapping.y);
    let hbin_i = opt_idx(&mapping.hbin);
    let sbin_i = opt_idx(&mapping.sbin);
    let site_i = opt_idx(&mapping.site);
    let wafer_i = opt_idx(&mapping.wafer);
    let lot_i = opt_idx(&mapping.lot);
    let meta_i: Vec<Option<usize>> = mapping.meta.iter().map(|c| idx(c)).collect();
    // (test number, column index) — resolved once, reused per row.
    let test_i: Vec<(u32, usize)> = mapping.tests.iter()
        .filter_map(|t| idx(&t.col).map(|i| (t.test_number, i))).collect();

    fn cell(rec: &csv::StringRecord, i: usize) -> &str { rec.get(i).unwrap_or("").trim() }
    fn cell_opt(rec: &csv::StringRecord, i: Option<usize>) -> &str {
        i.map(|i| cell(rec, i)).unwrap_or("")
    }

    let rows: Vec<FlatRow> = all_rows.iter().map(|rec| FlatRow {
        lot: cell_opt(rec, lot_i).to_string(),
        wafer: cell_opt(rec, wafer_i).to_string(),
        split_parts: split_parts(&mapping.split_by, |c| cell_opt(rec, idx(c)).to_string()),
        meta: meta_i.iter().map(|i| cell_opt(rec, *i).to_string()).collect(),
        x: x_i.and_then(|i| cell(rec, i).parse().ok()),
        y: y_i.and_then(|i| cell(rec, i).parse().ok()),
        hbin: hbin_i.and_then(|i| cell(rec, i).parse::<u32>().ok()),
        sbin: sbin_i.and_then(|i| cell(rec, i).parse::<u32>().ok()),
        site_num: site_i.and_then(|i| cell(rec, i).parse::<u32>().ok()),
        tests: test_i.iter()
            .filter_map(|(t, i)| {
                let s = cell(rec, *i);
                if s.is_empty() { None } else { s.parse::<f64>().ok().map(|v| (*t, v)) }
            })
            .collect(),
    }).collect();

    into_parsed(rows, mapping, false, test_defs, Vec::new())
}

fn detect_delimiter(bytes: &[u8]) -> u8 {
    // Scan the first line to detect whether the file is comma, tab, or semicolon delimited.
    let first_line_end = bytes.iter().position(|&b| b == b'\n').unwrap_or(bytes.len());
    let first_line = &bytes[..first_line_end];
    let commas = first_line.iter().filter(|&&b| b == b',').count();
    let tabs   = first_line.iter().filter(|&&b| b == b'\t').count();
    let semis  = first_line.iter().filter(|&&b| b == b';').count();
    if tabs >= commas && tabs >= semis { b'\t' } else if semis > commas { b';' } else { b',' }
}

fn build_reader_from_bytes(bytes: &[u8]) -> csv::Reader<Box<dyn Read>> {
    let delim = detect_delimiter(bytes);
    let reader: Box<dyn Read> = Box::new(std::io::Cursor::new(bytes.to_vec()));
    ReaderBuilder::new()
        .delimiter(delim)
        .trim(csv::Trim::All)
        .comment(Some(b'#'))
        .flexible(true)
        .from_reader(reader)
}

#[cfg(feature = "native")]
fn build_reader(path: &str) -> Result<csv::Reader<Box<dyn Read>>, String> {
    let is_gz = std::path::Path::new(path)
        .extension().and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gz")).unwrap_or(false);

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let reader: Box<dyn Read> = if is_gz {
        Box::new(flate2::read::GzDecoder::new(file))
    } else {
        Box::new(std::io::BufReader::new(file))
    };

    Ok(ReaderBuilder::new()
        .trim(csv::Trim::All)
        .comment(Some(b'#'))
        .flexible(true)
        .from_reader(reader))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(content: &str) -> std::path::PathBuf {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f.into_temp_path().keep().unwrap()
    }

    fn basic_mapping(x: &str, y: &str) -> CsvMapping {
        CsvMapping {
            x: Some(x.to_string()),
            y: Some(y.to_string()),
            hbin: None,
            sbin: None,
            wafer: None,
            lot: None,
            site: None,
            tests: vec![],
            meta: vec![],
            split_by: vec![],
            testname_col: None,
            testnumber_col: None,
            testvalue_col: None,
            lo_limit_col: None,
            hi_limit_col: None,
            units_col: None,
            pass_bins: vec![],
        }
    }

    #[test]
    fn headers_returns_column_names() {
        let csv = "x,y,hbin\n1,2,1\n3,4,2\n";
        let path = tmp(csv);
        let result = csv_headers_inner(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.headers, vec!["x", "y", "hbin"]);
    }

    #[test]
    fn headers_trims_whitespace() {
        let csv = " x , y , val \n1,2,3\n";
        let path = tmp(csv);
        let result = csv_headers_inner(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.headers, vec!["x", "y", "val"]);
    }

    #[test]
    fn sample_contains_up_to_5_rows() {
        let mut csv = "x,y\n".to_string();
        for i in 0..10 { csv += &format!("{i},{i}\n"); }
        let path = tmp(&csv);
        let result = csv_headers_inner(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.sample.len() <= 5);
    }

    #[test]
    fn comments_skipped_in_headers() {
        let csv = "# comment\nx,y\n1,2\n";
        let path = tmp(csv);
        let result = csv_headers_inner(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.headers, vec!["x", "y"]);
    }

    #[test]
    fn basic_die_coordinates() {
        let csv = "x,y\n3,7\n-1,-2\n";
        let path = tmp(csv);
        let mapping = basic_mapping("x", "y");
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), mapping).unwrap();
        assert_eq!(result.wafers.len(), 1);
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 2);
        assert!(dies.iter().any(|d| d.x == Some(3) && d.y == Some(7)));
        assert!(dies.iter().any(|d| d.x == Some(-1) && d.y == Some(-2)));
    }

    #[test]
    fn hbin_sbin_parsed() {
        let csv = "x,y,hb,sb\n0,0,2,5\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        m.sbin = Some("sb".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let die = &result.wafers[0].results[0];
        assert_eq!(die.hbin, Some(2));
        assert_eq!(die.sbin, Some(5));
    }

    #[test]
    fn hbin_is_none_when_not_mapped() {
        let csv = "x,y\n0,0\n";
        let path = tmp(csv);
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        assert_eq!(result.wafers[0].results[0].hbin, None);
        assert_eq!(result.wafers[0].results[0].sbin, None);
    }

    #[test]
    fn sbin_is_none_when_not_mapped() {
        let csv = "x,y,hb\n0,0,3\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let die = &result.wafers[0].results[0];
        assert_eq!(die.hbin, Some(3));
        assert_eq!(die.sbin, None);
    }

    #[test]
    fn rows_with_invalid_coords_are_kept_as_coordinate_less() {
        let csv = "x,y\n1,2\nbad,3\n4,bad\n5,6\n";
        let path = tmp(csv);
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 4, "an unparseable x/y no longer drops the row");
        assert_eq!(dies.iter().filter(|d| d.x.is_some()).count(), 2);
        let unpositioned = dies.iter().filter(|d| d.x.is_none());
        assert_eq!(unpositioned.clone().count(), 2);
        // Each unpositioned row still gets a distinct, stable die_index.
        let indices: std::collections::HashSet<_> = unpositioned.map(|d| d.die_index).collect();
        assert_eq!(indices.len(), 2);
        assert!(!indices.contains(&None));
    }

    #[test]
    fn rows_without_wafer_col_go_to_w1() {
        let csv = "x,y\n0,0\n1,1\n";
        let path = tmp(csv);
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), basic_mapping("x", "y")).unwrap();
        assert_eq!(result.wafers[0].wafer_id, "W1");
    }

    #[test]
    fn rows_grouped_by_wafer_column() {
        let csv = "wafer,x,y\nW01,0,0\nW01,1,0\nW02,0,0\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.wafer = Some("wafer".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers.len(), 2);
        let w1 = result.wafers.iter().find(|w| w.wafer_id == "W01").unwrap();
        assert_eq!(w1.results.len(), 2);
    }

    #[test]
    fn part_and_good_count_computed() {
        let csv = "x,y,hb\n0,0,1\n1,0,1\n2,0,2\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let w = &result.wafers[0];
        assert_eq!(w.part_count, Some(3));
        assert_eq!(w.good_count, Some(3));
    }

    #[test]
    fn pass_bins_filter_good_count() {
        let csv = "x,y,hb\n0,0,1\n1,0,2\n2,0,1\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hb".to_string());
        m.pass_bins = vec![1];
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let w = &result.wafers[0];
        assert_eq!(w.part_count, Some(3));
        assert_eq!(w.good_count, Some(2));
        assert_eq!(w.fail_count, Some(1));
    }

    #[test]
    fn test_values_parsed_from_mapped_columns() {
        let csv = "x,y,t1,t2\n0,0,1.5,3.0\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.tests = vec![
            CsvTestCol { col: "t1".to_string(), test_number: 1, name: "Test1".to_string() },
            CsvTestCol { col: "t2".to_string(), test_number: 2, name: "Test2".to_string() },
        ];
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let die = &result.wafers[0].results[0];
        assert!((die.test_values["1"] - 1.5).abs() < 1e-9);
        assert!((die.test_values["2"] - 3.0).abs() < 1e-9);
        assert_eq!(result.test_defs["1"].name, "Test1");
    }

    #[test]
    fn non_numeric_test_values_skipped() {
        let csv = "x,y,t1\n0,0,n/a\n1,0,2.5\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.tests = vec![CsvTestCol { col: "t1".to_string(), test_number: 1, name: "T1".to_string() }];
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert!(!result.wafers[0].results[0].test_values.contains_key("1"));
        assert!((result.wafers[0].results[1].test_values["1"] - 2.5).abs() < 1e-9);
    }

    #[test]
    fn long_format_pivot() {
        let csv = "x,y,test_name,test_val\n\
                   0,0,Vt,1.1\n\
                   0,0,Idsat,2.2\n\
                   1,0,Vt,1.3\n\
                   1,0,Idsat,2.4\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test_name".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
        let names: Vec<_> = result.test_defs.values().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"Vt"));
        assert!(names.contains(&"Idsat"));
    }

    #[test]
    fn long_format_number_only_uses_real_number_and_copies_name_from_it() {
        // No test-name column at all — only a number. The real number (not a
        // hash) becomes the key, and since there's nothing to name it, the
        // number doubles as the display name.
        let csv = "x,y,test_num,test_val\n\
                   0,0,1001,1.1\n\
                   0,0,1002,2.2\n\
                   1,0,1001,1.3\n\
                   1,0,1002,2.4\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testnumber_col = Some("test_num".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
        assert_eq!(result.test_defs.get("1001").map(|d| d.name.as_str()), Some("1001"));
        assert_eq!(result.test_defs.get("1002").map(|d| d.name.as_str()), Some("1002"));
        let d0 = result.wafers[0].results.iter().find(|d| d.x == Some(0) && d.y == Some(0)).unwrap();
        assert!((d0.test_values["1001"] - 1.1).abs() < 1e-9);
        assert!((d0.test_values["1002"] - 2.2).abs() < 1e-9);
    }

    #[test]
    fn long_format_name_and_number_uses_real_number_with_given_name() {
        let csv = "x,y,test_name,test_num,test_val\n\
                   0,0,Vt,2001,1.1\n\
                   1,0,Vt,2001,1.3\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test_name".to_string());
        m.testnumber_col = Some("test_num".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.test_defs.len(), 1);
        assert_eq!(result.test_defs.get("2001").map(|d| d.name.as_str()), Some("Vt"));
    }

    #[test]
    fn long_format_row_with_neither_name_nor_number_is_skipped() {
        let csv = "x,y,test_name,test_num,test_val\n\
                   0,0,,,1.1\n\
                   1,0,Vt,2001,1.3\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test_name".to_string());
        m.testnumber_col = Some("test_num".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        // Only the identifiable row contributes a test value; the die at
        // (0,0) still exists (x/y always survive) but with no test data.
        assert_eq!(result.test_defs.len(), 1);
        let d0 = result.wafers[0].results.iter().find(|d| d.x == Some(0) && d.y == Some(0)).unwrap();
        assert!(d0.test_values.is_empty());
    }

    #[test]
    fn long_format_test_numbers_survive_row_reorder() {
        // The whole point of hashing the test name instead of numbering by
        // first-encounter order: the same logical test set, re-exported in a
        // different row order, must land on the same numbers — otherwise a
        // saved test-list file (or an override keyed by number) goes stale
        // just from a harmless re-export.
        let forward = "x,y,test_name,test_val\n0,0,Vt,1.1\n0,0,Idsat,2.2\n1,0,Vt,1.3\n1,0,Idsat,2.4\n";
        let reversed = "x,y,test_name,test_val\n0,0,Idsat,2.2\n0,0,Vt,1.1\n1,0,Idsat,2.4\n1,0,Vt,1.3\n";

        let run = |csv: &str| {
            let path = tmp(csv);
            let mut m = basic_mapping("x", "y");
            m.testname_col = Some("test_name".to_string());
            m.testvalue_col = Some("test_val".to_string());
            let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
            let vt_num = result.test_defs.iter().find(|(_, d)| d.name == "Vt").unwrap().0.clone();
            let idsat_num = result.test_defs.iter().find(|(_, d)| d.name == "Idsat").unwrap().0.clone();
            (vt_num, idsat_num)
        };

        assert_eq!(run(forward), run(reversed));
    }

    #[test]
    fn long_format_order_field_reflects_first_encounter() {
        let csv = "x,y,test_name,test_val\n0,0,Idsat,2.2\n0,0,Vt,1.1\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test_name".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let idsat = result.test_defs.values().find(|d| d.name == "Idsat").unwrap();
        let vt = result.test_defs.values().find(|d| d.name == "Vt").unwrap();
        // Idsat appears first in the file, so it must sort before Vt by
        // order even though its (hashed) number bears no relation to that.
        assert!(idsat.order < vt.order, "expected Idsat's order before Vt's");
        assert_eq!(idsat.order, Some(0));
        assert_eq!(vt.order, Some(1));
    }

    #[test]
    fn wide_and_long_format_numbers_never_collide_in_one_file() {
        // A single mapping can legitimately have both: some columns fixed as
        // "Test value" (wide) and others as the long-format name/value pair.
        // The wide numbers are assigned upstream (simulated here) and must
        // reserve their slots before the long-format hash runs.
        let csv = "x,y,fixed_test,test_name,test_val\n0,0,9.9,Vt,1.1\n0,0,9.9,Idsat,2.2\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.tests = vec![CsvTestCol { col: "fixed_test".to_string(), test_number: 1_500_000, name: "Fixed".to_string() }];
        m.testname_col = Some("test_name".to_string());
        m.testvalue_col = Some("test_val".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.test_defs.len(), 3); // Fixed + Vt + Idsat
        let numbers: std::collections::HashSet<_> = result.test_defs.keys().collect();
        assert_eq!(numbers.len(), 3, "expected 3 distinct test numbers, got a collision");
        assert!(result.test_defs.contains_key("1500000"));
    }

    #[test]
    fn long_format_pivot_with_limits_and_units() {
        let csv = "x,y,test_name,test_val,lo_limit,hi_limit,units\n\
                   0,0,Vt,1.1,0.5,2.0,V\n\
                   0,0,Idsat,2.2,1.0,5.0,mA\n\
                   1,0,Vt,1.3,0.5,2.0,V\n\
                   1,0,Idsat,2.4,1.0,5.0,mA\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test_name".to_string());
        m.testvalue_col = Some("test_val".to_string());
        m.lo_limit_col = Some("lo_limit".to_string());
        m.hi_limit_col = Some("hi_limit".to_string());
        m.units_col = Some("units".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let vt = result.test_defs.values().find(|d| d.name == "Vt").unwrap();
        assert_eq!(vt.lo_limit, Some(0.5));
        assert_eq!(vt.hi_limit, Some(2.0));
        assert_eq!(vt.units.as_deref(), Some("V"));
        let idsat = result.test_defs.values().find(|d| d.name == "Idsat").unwrap();
        assert_eq!(idsat.lo_limit, Some(1.0));
        assert_eq!(idsat.hi_limit, Some(5.0));
        assert_eq!(idsat.units.as_deref(), Some("mA"));
    }

    #[test]
    fn lot_id_extracted_from_first_row() {
        let csv = "x,y,lot\n0,0,LOT-99\n1,0,LOT-99\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.lot = Some("lot".to_string());
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.meta.get("lotId"), Some("LOT-99"));
    }

    #[test]
    fn split_by_creates_multiple_wafers() {
        let csv = "x,y,site\n0,0,1\n1,0,1\n0,1,2\n1,1,2\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.split_by = vec!["site".to_string()];
        let result = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(result.wafers.len(), 2);
    }

    #[test]
    fn site_column_populates_per_die_site_num() {
        let csv = "x,y,site\n0,0,1\n1,0,2\n2,0,3\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.site = Some("site".to_string());
        let r = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let sites: Vec<_> = r.wafers[0].results.iter().map(|d| d.site_num).collect();
        assert_eq!(sites, vec![Some(1), Some(2), Some(3)]);
    }

    #[test]
    fn non_numeric_site_yields_none() {
        let csv = "x,y,site\n0,0,A1\n1,0,2\n";
        let path = tmp(csv);
        let mut m = basic_mapping("x", "y");
        m.site = Some("site".to_string());
        let r = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        let sites: Vec<_> = r.wafers[0].results.iter().map(|d| d.site_num).collect();
        assert_eq!(sites, vec![None, Some(2)]);
    }

    #[test]
    fn no_site_mapping_leaves_site_num_none() {
        let csv = "x,y,site\n0,0,1\n";
        let path = tmp(csv);
        let m = basic_mapping("x", "y"); // site not mapped
        let r = parse_csv_inner(path.to_str().unwrap().to_string(), m).unwrap();
        assert_eq!(r.wafers[0].results[0].site_num, None);
    }

    fn gz_csv(content: &str) -> std::path::PathBuf {
        use std::io::Write;
        let mut f = tempfile::Builder::new().suffix(".csv.gz").tempfile().unwrap();
        let mut enc = flate2::write::GzEncoder::new(&mut f, flate2::Compression::default());
        enc.write_all(content.as_bytes()).unwrap();
        enc.finish().unwrap();
        f.into_temp_path().keep().unwrap()
    }

    #[test]
    fn gz_csv_headers_readable() {
        let path = gz_csv("x,y,hbin\n0,0,1\n1,1,2\n");
        let result = csv_headers_inner(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.headers, vec!["x", "y", "hbin"]);
        assert_eq!(result.sample.len(), 2);
    }

    #[test]
    fn json_mapping_deserialises_tests() {
        // Exact JSON string produced by js_sys::JSON::stringify in the WASM path.
        let json = r#"{"x":"X_LOC","y":"Y_LOC","hbin":null,"sbin":"SBIN","wafer":"WAFER_ID","lot":"LOT_ID","tests":[{"col":"GAIN_DB","testNumber":1001,"name":"GAIN_DB"},{"col":"NF_DB","testNumber":1002,"name":"NF_DB"},{"col":"IP3_DBM","testNumber":1003,"name":"IP3_DBM"},{"col":"IDQ_MA","testNumber":1004,"name":"IDQ_MA"}],"meta":["TEMP","TESTDATE"],"splitBy":[],"testnameCol":null,"testvalueCol":null,"loLimitCol":null,"hiLimitCol":null,"unitsCol":null,"passBins":[1]}"#;
        let mapping: CsvMapping = serde_json::from_str(json).expect("mapping deserialisation failed");
        assert_eq!(mapping.tests.len(), 4, "expected 4 test cols, got {}", mapping.tests.len());
        assert_eq!(mapping.tests[0].col, "GAIN_DB");
        assert_eq!(mapping.tests[0].test_number, 1001);
    }

    #[test]
    fn parse_csv_from_bytes_with_test_cols() {
        let csv = "X_LOC,Y_LOC,SBIN,WAFER_ID,LOT_ID,TEMP,TESTDATE,GAIN_DB,NF_DB,IP3_DBM,IDQ_MA\n\
                   1,1,1,W1,LOT1,25,2024-01-01,10.5,2.1,15.3,100.0\n\
                   1,2,1,W1,LOT1,25,2024-01-01,11.0,2.3,14.9,98.0\n";
        let json = r#"{"x":"X_LOC","y":"Y_LOC","hbin":null,"sbin":"SBIN","wafer":"WAFER_ID","lot":"LOT_ID","tests":[{"col":"GAIN_DB","testNumber":1001,"name":"GAIN_DB"},{"col":"NF_DB","testNumber":1002,"name":"NF_DB"},{"col":"IP3_DBM","testNumber":1003,"name":"IP3_DBM"},{"col":"IDQ_MA","testNumber":1004,"name":"IDQ_MA"}],"meta":["TEMP","TESTDATE"],"splitBy":[],"testnameCol":null,"testvalueCol":null,"loLimitCol":null,"hiLimitCol":null,"unitsCol":null,"passBins":[1]}"#;
        let mapping: CsvMapping = serde_json::from_str(json).unwrap();
        let result = parse_csv_from_bytes(csv.as_bytes(), mapping).unwrap();
        assert_eq!(result.test_defs.len(), 4, "expected 4 test_defs, got {}: {:?}", result.test_defs.len(), result.test_defs.keys().collect::<Vec<_>>());
        assert!(result.wafers[0].results[0].test_values.contains_key("1001"), "expected testValues key 1001");
    }

    #[test]
    fn tab_delimited_csv_parses_test_cols() {
        let csv = "X_LOC\tY_LOC\tSBIN\tWAFER_ID\tGAIN_DB\n\
                   1\t1\t1\tW1\t10.5\n\
                   1\t2\t1\tW1\t11.0\n";
        let json = r#"{"x":"X_LOC","y":"Y_LOC","hbin":null,"sbin":"SBIN","wafer":"WAFER_ID","lot":null,"tests":[{"col":"GAIN_DB","testNumber":1001,"name":"GAIN_DB"}],"meta":[],"splitBy":[],"testnameCol":null,"testvalueCol":null,"loLimitCol":null,"hiLimitCol":null,"unitsCol":null,"passBins":[]}"#;
        let mapping: CsvMapping = serde_json::from_str(json).unwrap();
        let result = parse_csv_from_bytes(csv.as_bytes(), mapping).unwrap();
        assert_eq!(result.test_defs.len(), 1, "test_defs should have 1 entry for tab-delimited CSV");
        assert!(result.wafers[0].results[0].test_values.contains_key("1001"));
    }

    #[test]
    fn gz_csv_parsed_same_as_plain() {
        let csv = "x,y,hb\n0,0,1\n1,2,2\n3,4,1\n";
        let plain_path = tmp(csv);
        let gz_path    = gz_csv(csv);
        let mut m1 = basic_mapping("x", "y");
        m1.hbin = Some("hb".to_string());
        let mut m2 = basic_mapping("x", "y");
        m2.hbin = Some("hb".to_string());
        let plain = parse_csv_inner(plain_path.to_str().unwrap().to_string(), m1).unwrap();
        let gz    = parse_csv_inner(gz_path.to_str().unwrap().to_string(), m2).unwrap();
        assert_eq!(gz.wafers[0].results.len(), plain.wafers[0].results.len());
        assert_eq!(gz.wafers[0].part_count, plain.wafers[0].part_count);
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

    #[test]
    fn sample_file_coordinateless_lot() {
        // sample_data/TESTNUM-COORDLESS-01.csv — W01 fully positioned, W02
        // mixed (2 of 4 rows have blank x/y), W03 fully coordinate-less (no
        // row has x/y). See WMAP_ISSUES.md #39.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/TESTNUM-COORDLESS-01.csv");
        let mut m = basic_mapping("x", "y");
        m.wafer = Some("wafer".to_string());
        m.hbin = Some("hbin".to_string());
        m.sbin = Some("sbin".to_string());
        m.tests = vec![
            CsvTestCol { col: "3001".to_string(), test_number: 3001, name: "3001".to_string() },
            CsvTestCol { col: "3002".to_string(), test_number: 3002, name: "3002".to_string() },
            CsvTestCol { col: "3003".to_string(), test_number: 3003, name: "3003".to_string() },
        ];
        let result = parse_csv_inner(path.to_string(), m).unwrap();
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

    // Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench --release -- --nocapture bench_parse_csv
    #[cfg(feature = "bench")]
    #[test]
    fn bench_parse_csv() {
        let path = "/tmp/bench.csv";
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => { eprintln!("SKIP: {path} not found — run scripts/generate_csv_json_bench.py"); return; }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;
        let mapping = bench_mapping(50);

        let _ = parse_csv_from_bytes(&bytes, mapping.clone()).unwrap(); // warm
        let t = std::time::Instant::now();
        let result = parse_csv_from_bytes(&bytes, mapping).unwrap();
        let ms = t.elapsed().as_millis();
        let dies: usize = result.wafers.iter().map(|w| w.results.len()).sum();
        println!(
            "\n=== bench_parse_csv ({file_mb:.1} MB) ===\n\
             wafers: {}\ndies:   {dies}\ntests:  {}\ntotal:  {ms} ms\nthroughput: {:.0} MB/s",
            result.wafers.len(), result.test_defs.len(),
            file_mb / (ms as f64 / 1000.0).max(0.001),
        );
    }
}
