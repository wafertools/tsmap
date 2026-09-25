//! Wafers from flat, row-based sources — CSV, JSON and Parquet, in both wide
//! (one row per die) and long (one row per die × test) layouts.
//!
//! Each of those six paths used to group rows into wafers by the wafer column
//! alone and take lot and metadata from the file's FIRST row. A file holding
//! several lots therefore merged every lot's W01 into one wafer map and
//! labelled all of it with the first lot; a wafer tested at two temperatures
//! became one map with two dies per position (wide), or had the second pass's
//! values silently overwrite the first's (long). This module is now the only
//! place rows become wafers, so the rule cannot drift between formats:
//!
//! 1. A wafer is identified by lot + wafer ID (+ any "Subdivide file by" columns).
//! 2. When positions repeat within a wafer and exactly one mapped metadata column
//!    separates the repeats into whole passes (a temperature, a test program…),
//!    the wafer becomes one wafer per pass. Otherwise the repeats are retests,
//!    left for the host's retest handling, and reported.
//! 3. Metadata is per wafer. A field every wafer agrees on is lot/file-level;
//!    one that differs between wafers stays on each wafer; a column that varies
//!    WITHIN a wafer is not a wafer property, and is reported rather than guessed.

use std::collections::{HashMap, HashSet};
use indexmap::IndexMap;
use crate::parse_csv::CsvMapping;
use crate::types::*;

/// One source row, already read by the format-specific parser.
pub struct FlatRow {
    /// Lot column value, `""` when unmapped or blank.
    pub lot: String,
    /// Wafer column value, `""` when unmapped or blank (→ `W1`).
    pub wafer: String,
    /// `"col: value"` for each non-blank "Subdivide file by" column.
    pub split_parts: Vec<String>,
    /// One value per `mapping.meta` column, in that order; `""` when blank.
    pub meta: Vec<String>,
    /// Whole numbers as read, before STDF's ranges are applied — `into_parsed`
    /// applies them (`SpecCheck`), so the rule is the same for every flat format
    /// and for STDF/ATDF. `None` is no usable value in the cell.
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub hbin: Option<i64>,
    pub sbin: Option<i64>,
    pub site_num: Option<i64>,
    /// Wide: every mapped test column that parsed. Long: this row's one test.
    pub tests: Vec<(u32, f64)>,
}

/// `"col: value"` parts for the mapping's "Subdivide file by" columns.
pub fn split_parts(cols: &[String], mut value_of: impl FnMut(&str) -> String) -> Vec<String> {
    cols.iter()
        .filter_map(|c| {
            let v = value_of(c);
            if v.is_empty() { None } else { Some(format!("{}: {}", c, v)) }
        })
        .collect()
}

/// Assemble rows into a `ParsedStdf`. `extra_warnings` (e.g. Parquet's column
/// type mismatches) are listed first, then values outside STDF's ranges, then
/// position and grouping notes.
pub fn into_parsed(
    mut rows: Vec<FlatRow>,
    mapping: &CsvMapping,
    long_format: bool,
    test_defs: HashMap<String, TestDef>,
    extra_warnings: Vec<ParserWarning>,
) -> ParsedStdf {
    let mut check = SpecCheck::default();
    for r in rows.iter_mut() { apply_stdf_ranges(r, &mut check); }
    let a = assemble(rows, mapping, long_format);
    let mut warnings = extra_warnings;
    warnings.extend(check.warnings());
    warnings.extend(position_warnings(&a.wafers));
    warnings.extend(a.warnings);
    ParsedStdf {
        meta: a.meta, wafers: a.wafers, test_defs,
        sites: vec![], hbin_defs: vec![], sbin_defs: vec![], pass_hbins: vec![],
        warnings,
    }
}

struct Assembled {
    wafers: Vec<WaferData>,
    meta: LotMeta,
    warnings: Vec<ParserWarning>,
}

/// STDF V4's ranges, as for STDF and ATDF: a bin, coordinate or site it cannot
/// store is missing, a non-finite value is left out, and each is counted.
/// A row with an illegal hard bin keeps its soft bin; one illegal coordinate
/// leaves the die with no position, never half of one. An absent hard bin is
/// normal in a flat file (the column may not be mapped), so it is not counted.
fn apply_stdf_ranges(r: &mut FlatRow, check: &mut SpecCheck) {
    r.hbin = r.hbin.and_then(|b| check.hard_bin(RawField::Value(b))).map(i64::from);
    r.sbin = r.sbin.and_then(|b| check.soft_bin(RawField::Value(b))).map(i64::from);
    let pos = check.position(RawField::from_opt(r.x), RawField::from_opt(r.y));
    r.x = pos.map(|p| i64::from(p.0));
    r.y = pos.map(|p| i64::from(p.1));
    r.site_num = check.site(r.site_num).map(i64::from);
    r.tests.retain(|&(_, v)| check.result(ResultFlags::default(), v).is_some());
}

/// Values here have passed `apply_stdf_ranges`, so they fit their STDF types.
fn position(r: &FlatRow) -> Option<(i32, i32)> {
    match (r.x, r.y) {
        (Some(x), Some(y)) => Some((x as i32, y as i32)),
        _ => None,
    }
}

fn describe(wafer_id: &str, lot: &str) -> String {
    if lot.is_empty() { format!("Wafer {wafer_id}") } else { format!("Wafer {wafer_id} (lot {lot})") }
}

enum Passes {
    Single,
    Retests { dies: usize },
    By { col: usize },
}

/// Rule 2 of the module doc. A "unit" is what should occur once per pass: a die
/// position (wide), or a die position × test (long). A column separates passes
/// when (a) no unit repeats within any one of its values, and (b) it takes
/// exactly as many values as the most-repeated unit has occurrences, so each
/// value is a whole pass. (b) is what rejects a per-die timestamp — it tells
/// repeats apart too, but splitting on it would shatter the wafer into one
/// fragment per die.
fn detect_passes(rows: &[FlatRow], meta_cols: usize, long_format: bool) -> Passes {
    let unit = |r: &FlatRow| -> Option<(i32, i32, u32)> {
        let (x, y) = position(r)?;
        if long_format { r.tests.first().map(|t| (x, y, t.0)) } else { Some((x, y, u32::MAX)) }
    };
    let mut counts: HashMap<(i32, i32, u32), usize> = HashMap::new();
    for r in rows {
        if let Some(u) = unit(r) { *counts.entry(u).or_insert(0) += 1; }
    }
    let max_rep = counts.values().copied().max().unwrap_or(0);
    if max_rep <= 1 { return Passes::Single; }

    'col: for ci in 0..meta_cols {
        let mut values: HashSet<&str> = HashSet::new();
        let mut seen: HashSet<(&str, (i32, i32, u32))> = HashSet::new();
        for r in rows {
            let Some(u) = unit(r) else { continue };
            let v = r.meta[ci].as_str();
            values.insert(v);
            if !seen.insert((v, u)) { continue 'col; }
        }
        if values.len() == max_rep { return Passes::By { col: ci }; }
    }
    let dies: HashSet<(i32, i32)> = counts.iter().filter(|(_, &n)| n > 1).map(|(u, _)| (u.0, u.1)).collect();
    Passes::Retests { dies: dies.len() }
}

fn assemble(rows: Vec<FlatRow>, mapping: &CsvMapping, long_format: bool) -> Assembled {
    let meta_cols = &mapping.meta;
    let pass_bins: HashSet<u32> = mapping.pass_bins.iter().copied().collect();
    let mut warnings: Vec<ParserWarning> = Vec::new();

    // 1. Identity — lot + wafer (+ subdivide parts), in first-seen order.
    let mut groups: IndexMap<(String, String), Vec<FlatRow>> = IndexMap::new();
    for r in rows {
        let wid = if r.wafer.is_empty() { "W1".to_string() } else { r.wafer.clone() };
        let wafer_id = if r.split_parts.is_empty() { wid } else { format!("{} · {}", wid, r.split_parts.join(" · ")) };
        groups.entry((r.lot.clone(), wafer_id)).or_default().push(r);
    }

    // 2. Test passes within each wafer.
    // One interner for every wafer in the file, so a test number has exactly one
    // key allocation per parse rather than one per wafer.
    let mut test_keys = TestKeys::default();
    let mut units: Vec<(String, String, Vec<FlatRow>)> = Vec::new();
    for ((lot, wafer_id), rows) in groups {
        let named = describe(&wafer_id, &lot);
        match detect_passes(&rows, meta_cols.len(), long_format) {
            Passes::Single => units.push((lot, wafer_id, rows)),
            Passes::Retests { dies } => {
                warnings.push(retests_assumed_warning(&named, dies));
                units.push((lot, wafer_id, rows));
            }
            Passes::By { col } => {
                let mut parts: IndexMap<String, Vec<FlatRow>> = IndexMap::new();
                for r in rows { parts.entry(r.meta[col].clone()).or_default().push(r); }
                let values: Vec<String> = parts.keys()
                    .map(|v| if v.is_empty() { "(blank)".to_string() } else { v.clone() })
                    .collect();
                warnings.push(wafer_split_warning(&named, &meta_cols[col], &values));
                for (_, rs) in parts { units.push((lot.clone(), wafer_id.clone(), rs)); }
            }
        }
    }

    // 3. Wafers, and each wafer's own metadata.
    let mut wafers: Vec<WaferData> = Vec::with_capacity(units.len());
    let mut fields: Vec<Vec<MetaField>> = Vec::with_capacity(units.len());
    let mut varies: Vec<Option<String>> = vec![None; meta_cols.len()];
    for (lot, wafer_id, rows) in &units {
        let mut f: Vec<MetaField> = Vec::new();
        if mapping.lot.is_some() { push_field(&mut f, "lotId", Some(lot.clone())); }
        for (ci, col) in meta_cols.iter().enumerate() {
            let mut distinct: Vec<&str> = Vec::new();
            for r in rows {
                let v = r.meta[ci].trim();
                if !v.is_empty() && !distinct.contains(&v) {
                    distinct.push(v);
                    if distinct.len() > 1 { break; }
                }
            }
            match distinct.len() {
                0 => {}
                1 => push_field(&mut f, col, Some(distinct[0].to_string())),
                _ => {
                    if varies[ci].is_none() {
                        varies[ci] = Some(format!("{}: {}, {}", describe(wafer_id, lot), distinct[0], distinct[1]));
                    }
                }
            }
        }
        fields.push(f);
        wafers.push(build_wafer(wafer_id.clone(), rows, long_format, &pass_bins, &mut test_keys));
    }

    // A column that varies within any wafer is not a property of wafers at all.
    for (ci, example) in varies.iter().enumerate() {
        let Some(example) = example else { continue };
        let col = &meta_cols[ci];
        for f in fields.iter_mut() { f.retain(|m| &m.key != col); }
        warnings.push(column_varies_warning(col, example));
    }

    let (common, residual) = split_common_fields(fields);
    for (w, f) in wafers.iter_mut().zip(residual) { w.fields = f; }
    Assembled { wafers, meta: LotMeta { fields: common }, warnings }
}

fn build_wafer(wafer_id: String, rows: &[FlatRow], long_format: bool, pass_bins: &HashSet<u32>,
               test_keys: &mut TestKeys) -> WaferData {
    let blank = |pos: Option<(i32, i32)>| DieResult {
        x: pos.map(|p| p.0), y: pos.map(|p| p.1), die_index: None,
        hbin: None, sbin: None, site_num: None, part_id: None, supersedes: None,
        test_values: HashMap::new(), test_pass: HashMap::new(),
    };
    let mut dies: Vec<DieResult> = Vec::new();
    if long_format {
        // Rows at one position are one die. A coordinate-less row has no
        // position to pivot by, so it is its own die rather than being merged
        // with unrelated rows under a shared empty key.
        let mut at: HashMap<(i32, i32), usize> = HashMap::new();
        for r in rows {
            let pos = position(r);
            let i = match pos.and_then(|p| at.get(&p).copied()) {
                Some(i) => i,
                None => {
                    dies.push(blank(pos));
                    if let Some(p) = pos { at.insert(p, dies.len() - 1); }
                    dies.len() - 1
                }
            };
            let d = &mut dies[i];
            d.hbin = d.hbin.or(r.hbin.map(|b| b as u32));
            d.sbin = d.sbin.or(r.sbin.map(|b| b as u32));
            d.site_num = d.site_num.or(r.site_num.map(|s| s as u32));
            for (t, v) in &r.tests { d.test_values.insert(test_keys.num(*t), *v); }
        }
    } else {
        for r in rows {
            let mut d = blank(position(r));
            d.hbin = r.hbin.map(|b| b as u32);
            d.sbin = r.sbin.map(|b| b as u32);
            d.site_num = r.site_num.map(|s| s as u32);
            d.test_values = r.tests.iter().map(|(t, v)| (test_keys.num(*t), *v)).collect();
            dies.push(d);
        }
    }
    // A coordinate-less die gets a stable per-wafer ordinal instead.
    let mut n = 0u32;
    for d in dies.iter_mut() {
        if d.x.is_none() { d.die_index = Some(n); n += 1; }
    }
    let part = dies.len() as u32;
    // Pass bins are hard-bin numbers, so only the hard bin decides. With none
    // given, which dies are good is unknown — not "all of them".
    let good = (!pass_bins.is_empty()).then(|| dies.iter()
        .filter(|d| d.hbin.is_some_and(|b| pass_bins.contains(&b)))
        .count() as u32);
    WaferData {
        wafer_id,
        // No wafer column mapped (or a blank one): `W1` is a placeholder.
        wafer_id_placeholder: rows.first().is_some_and(|r| r.wafer.is_empty()),
        results: dies,
        part_count: Some(part), good_count: good, fail_count: good.map(|g| part - g),
        fields: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping(meta: &[&str], lot: bool) -> CsvMapping {
        CsvMapping {
            x: Some("x".into()), y: Some("y".into()), hbin: Some("hbin".into()), sbin: None,
            wafer: Some("wafer".into()), lot: if lot { Some("lot".into()) } else { None }, site: None,
            tests: vec![], meta: meta.iter().map(|s| s.to_string()).collect(), split_by: vec![],
            testname_col: None, testnumber_col: None, testvalue_col: None,
            lo_limit_col: None, hi_limit_col: None, lo_spec_col: None, hi_spec_col: None, units_col: None, pass_bins: vec![1],
        }
    }

    fn row(lot: &str, wafer: &str, x: i32, meta: &[&str], tests: &[(u32, f64)]) -> FlatRow {
        FlatRow {
            lot: lot.into(), wafer: wafer.into(), split_parts: vec![],
            meta: meta.iter().map(|s| s.to_string()).collect(),
            x: Some(i64::from(x)), y: Some(0), hbin: Some(1), sbin: None, site_num: None,
            tests: tests.to_vec(),
        }
    }

    fn field<'a>(w: &'a WaferData, key: &str) -> Option<&'a str> {
        w.fields.iter().find(|f| f.key == key).map(|f| f.value.as_str())
    }

    #[test]
    fn same_wafer_id_in_two_lots_is_two_wafers() {
        let rows = vec![row("A", "W01", 0, &[], &[]), row("B", "W01", 0, &[], &[]), row("A", "W01", 1, &[], &[])];
        let a = assemble(rows, &mapping(&[], true), false);
        assert_eq!(a.wafers.len(), 2);
        assert_eq!(a.wafers[0].results.len(), 2);
        assert_eq!(field(&a.wafers[0], "lotId"), Some("A"));
        assert_eq!(field(&a.wafers[1], "lotId"), Some("B"));
        assert_eq!(a.meta.get("lotId"), None, "not lot-level when the wafers disagree");
    }

    #[test]
    fn a_single_lot_stays_lot_level() {
        let rows = vec![row("A", "W01", 0, &["25"], &[]), row("A", "W02", 0, &["25"], &[])];
        let a = assemble(rows, &mapping(&["temp"], true), false);
        assert_eq!(a.meta.get("lotId"), Some("A"));
        assert_eq!(a.meta.get("temp"), Some("25"));
        assert!(a.wafers.iter().all(|w| w.fields.is_empty()));
    }

    #[test]
    fn metadata_that_differs_between_wafers_stays_per_wafer() {
        let rows = vec![row("A", "W01", 0, &["P1"], &[]), row("A", "W02", 0, &["P2"], &[])];
        let a = assemble(rows, &mapping(&["program"], true), false);
        assert_eq!(field(&a.wafers[0], "program"), Some("P1"));
        assert_eq!(field(&a.wafers[1], "program"), Some("P2"));
        assert_eq!(a.meta.get("program"), None);
    }

    #[test]
    fn a_column_varying_within_a_wafer_is_dropped_and_reported() {
        let rows = vec![row("A", "W01", 0, &["t1"], &[]), row("A", "W01", 1, &["t2"], &[])];
        let a = assemble(rows, &mapping(&["stamp"], true), false);
        assert_eq!(a.meta.get("stamp"), None);
        assert!(a.wafers[0].fields.iter().all(|f| f.key != "stamp"));
        assert!(a.warnings.iter().any(|w| w.code == "column-varies-within-wafer"
            && w.message.contains("'stamp'")), "{:?}", a.warnings);
    }

    #[test]
    fn two_temperatures_of_one_wafer_become_two_wafers() {
        let rows = vec![
            row("A", "W01", 0, &["25"], &[(1, 1.0)]), row("A", "W01", 1, &["25"], &[(1, 1.1)]),
            row("A", "W01", 0, &["85"], &[(1, 2.0)]), row("A", "W01", 1, &["85"], &[(1, 2.1)]),
        ];
        let a = assemble(rows, &mapping(&["temp"], true), false);
        assert_eq!(a.wafers.len(), 2);
        assert_eq!(field(&a.wafers[0], "temp"), Some("25"));
        assert_eq!(field(&a.wafers[1], "temp"), Some("85"));
        assert_eq!(a.wafers[1].results[0].test_values["1"], 2.0);
        assert!(a.warnings.iter().any(|w| w.code == "wafer-split-by-column"
            && w.message.contains("2 passes") && w.message.contains("'temp'")), "{:?}", a.warnings);
    }

    #[test]
    fn long_format_passes_no_longer_overwrite_each_other() {
        let rows = vec![
            row("A", "W01", 0, &["25"], &[(1, 1.0)]), row("A", "W01", 0, &["25"], &[(2, 5.0)]),
            row("A", "W01", 0, &["85"], &[(1, 2.0)]), row("A", "W01", 0, &["85"], &[(2, 6.0)]),
        ];
        let a = assemble(rows, &mapping(&["temp"], true), true);
        assert_eq!(a.wafers.len(), 2);
        assert_eq!(a.wafers[0].results.len(), 1, "one die per position after the pivot");
        assert_eq!(a.wafers[0].results[0].test_values["1"], 1.0);
        assert_eq!(a.wafers[1].results[0].test_values["1"], 2.0);
    }

    #[test]
    fn a_per_die_timestamp_does_not_shatter_a_retested_wafer() {
        // Die 0 retested at the same temperature; every row has its own stamp.
        let rows = vec![
            row("A", "W01", 0, &["25", "s1"], &[]), row("A", "W01", 1, &["25", "s2"], &[]),
            row("A", "W01", 2, &["25", "s3"], &[]), row("A", "W01", 0, &["25", "s4"], &[]),
        ];
        let a = assemble(rows, &mapping(&["temp", "stamp"], true), false);
        assert_eq!(a.wafers.len(), 1);
        assert_eq!(a.wafers[0].results.len(), 4, "retests stay as dies for the host's retest policy");
        assert!(a.warnings.iter().any(|w| w.code == "retests-assumed"), "{:?}", a.warnings);
    }

    // ── End to end, through the real format entry points ─────────────────────

    #[test]
    fn csv_with_two_lots_keeps_each_lots_wafers_apart() {
        let csv = "lot,wafer,x,y,hbin,temp\nA,W01,0,0,1,25\nA,W01,1,0,1,25\nB,W01,0,0,2,25\nB,W01,1,0,1,25\n";
        let mut m = mapping(&["temp"], true);
        m.tests = vec![];
        let r = crate::parse_csv::parse_csv_from_bytes(csv.as_bytes(), m).unwrap();
        assert_eq!(r.wafers.len(), 2, "not one merged W01");
        assert_eq!(r.wafers.iter().map(|w| w.results.len()).collect::<Vec<_>>(), vec![2, 2]);
        assert_eq!(field(&r.wafers[1], "lotId"), Some("B"));
        assert_eq!(r.meta.get("lotId"), None);
        assert_eq!(r.meta.get("temp"), Some("25"), "shared by every wafer, so lot-level");
    }

    #[test]
    fn long_format_csv_with_two_temperatures_keeps_both_passes() {
        let csv = "wafer,x,y,hbin,temp,test,value\n\
                   W01,0,0,1,25,vth,0.40\nW01,0,0,1,25,idd,1.0\n\
                   W01,0,0,1,85,vth,0.35\nW01,0,0,1,85,idd,1.4\n";
        let mut m = mapping(&["temp"], false);
        m.testname_col = Some("test".into());
        m.testvalue_col = Some("value".into());
        let r = crate::parse_csv::parse_csv_from_bytes(csv.as_bytes(), m).unwrap();
        assert_eq!(r.wafers.len(), 2);
        let vth = r.test_defs.iter().find(|(_, d)| d.name == "vth").map(|(k, _)| k.clone()).unwrap();
        assert_eq!(r.wafers[0].results[0].test_values[vth.as_str()], 0.40);
        assert_eq!(r.wafers[1].results[0].test_values[vth.as_str()], 0.35, "85 °C no longer overwrites 25 °C");
    }

    #[test]
    fn json_with_two_lots_keeps_each_lots_wafers_apart() {
        let json = r#"[{"lot":"A","wafer":"W01","x":0,"y":0,"hbin":1},{"lot":"B","wafer":"W01","x":0,"y":0,"hbin":1}]"#;
        let r = crate::parse_json::parse_json_from_bytes(json.as_bytes(), mapping(&[], true)).unwrap();
        assert_eq!(r.wafers.len(), 2);
        assert_eq!(field(&r.wafers[0], "lotId"), Some("A"));
        assert_eq!(field(&r.wafers[1], "lotId"), Some("B"));
    }

    #[test]
    fn coordinate_less_rows_are_each_their_own_die() {
        let mut r1 = row("A", "W01", 0, &[], &[(1, 1.0)]);
        let mut r2 = row("A", "W01", 0, &[], &[(1, 2.0)]);
        r1.x = None;
        r2.x = None;
        let a = assemble(vec![r1, r2], &mapping(&[], true), true);
        assert_eq!(a.wafers[0].results.len(), 2);
        assert_eq!(a.wafers[0].results[1].die_index, Some(1));
        assert!(a.warnings.is_empty(), "no positions, so nothing to call a repeat: {:?}", a.warnings);
    }

    // ── STDF V4 ranges, the same for every flat format as for STDF/ATDF ──────

    fn range_mapping() -> CsvMapping {
        let mut m = mapping(&[], false);
        m.sbin = Some("sbin".into());
        m.site = Some("site".into());
        m.tests = vec![crate::parse_csv::CsvTestCol { col: "t1".into(), test_number: 1, name: "T1".into() }];
        m
    }

    fn assert_ranges_applied(r: &ParsedStdf, format: &str) {
        let dies = &r.wafers[0].results;
        let at = |x: i32| dies.iter().find(|d| d.x == Some(x));
        let d0 = at(0).unwrap_or_else(|| panic!("{format}: die at x 0"));
        assert_eq!((d0.hbin, d0.sbin, d0.site_num), (None, None, None), "{format}: bin 40000, bin -1, site 300 are missing");
        assert!(d0.test_values.is_empty(), "{format}: an infinite value is left out");
        assert!(dies.iter().any(|d| d.x.is_none() && d.y.is_none() && d.hbin == Some(2)),
            "{format}: a die at x 40000 has no position, in neither axis");
        let d1 = at(1).unwrap_or_else(|| panic!("{format}: die at x 1"));
        assert_eq!((d1.hbin, d1.sbin, d1.site_num), (Some(1), Some(3), Some(255)), "{format}: legal values kept");
        for code in ["bin-invalid", "coordinate-invalid", "site-invalid", "result-unusable"] {
            assert!(r.warnings.iter().any(|w| w.code == code), "{format}: no {code} in {:?}", r.warnings);
        }
    }

    #[test]
    fn csv_values_outside_stdf_ranges_are_missing_and_reported() {
        let csv = "wafer,x,y,hbin,sbin,site,t1\nW01,0,0,40000,-1,300,inf\nW01,40000,0,2,3,1,1.0\nW01,1,0,1,3,255,2.0\n";
        let r = crate::parse_csv::parse_csv_from_bytes(csv.as_bytes(), range_mapping()).unwrap();
        assert_ranges_applied(&r, "CSV");
    }

    #[test]
    fn json_values_outside_stdf_ranges_are_missing_and_reported() {
        let json = r#"[{"wafer":"W01","x":0,"y":0,"hbin":40000,"sbin":-1,"site":300,"t1":"inf"},
                       {"wafer":"W01","x":40000,"y":0,"hbin":2,"sbin":3,"site":1,"t1":1.0},
                       {"wafer":"W01","x":1,"y":0,"hbin":1,"sbin":3,"site":255,"t1":2.0}]"#;
        let r = crate::parse_json::parse_json_from_bytes(json.as_bytes(), range_mapping()).unwrap();
        assert_ranges_applied(&r, "JSON");
    }

    #[test]
    fn stdf_missing_soft_bin_and_coordinate_values_are_silent_in_flat_files_too() {
        // 65535 (soft bin) and -32768 (coordinate) are STDF's own "missing" values:
        // an STDF export written to CSV keeps them, and they mean no value, not an error.
        let csv = "wafer,x,y,hbin,sbin\nW01,-32768,-32768,1,65535\n";
        let mut m = mapping(&[], false);
        m.sbin = Some("sbin".into());
        let r = crate::parse_csv::parse_csv_from_bytes(csv.as_bytes(), m).unwrap();
        let d = &r.wafers[0].results[0];
        assert_eq!((d.x, d.sbin, d.hbin), (None, None, Some(1)));
        assert!(!r.warnings.iter().any(|w| w.code == "bin-invalid" || w.code == "coordinate-invalid"), "{:?}", r.warnings);
    }
}
