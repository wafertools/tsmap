use bytes::Bytes;
use parquet::file::reader::{FileReader, SerializedFileReader};
use parquet::record::{Field, Row};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use crate::types::*;
use crate::parse_csv::CsvMapping;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParquetHeadersResult {
    pub headers: Vec<String>,
    pub sample: Vec<HashMap<String, String>>,
    pub row_count: usize,
    /// Coarse per-column kind ("number" | "bool" | "string"), inferred from the
    /// first sampled row's Parquet field type — unlike CSV/JSON, Parquet columns
    /// are natively typed, so the mapping UI can flag an obviously wrong role
    /// (e.g. a string column mapped to X) instead of discovering it only after
    /// a full parse silently drops every row.
    pub column_types: HashMap<String, String>,
}

/// Coarse role of a Parquet field's physical type, for the mapping UI's
/// type-mismatch hint. `Null` defaults to "string" (permissive) since a null
/// sample tells us nothing about the column's real type.
fn field_kind(f: &Field) -> &'static str {
    match f {
        Field::Bool(_) => "bool",
        Field::Byte(_) | Field::Short(_) | Field::Int(_) | Field::Long(_)
        | Field::UByte(_) | Field::UShort(_) | Field::UInt(_) | Field::ULong(_)
        | Field::Float16(_) | Field::Float(_) | Field::Double(_) | Field::Decimal(_) => "number",
        _ => "string",
    }
}

/// Coerce a typed Parquet field to `f64` for a numeric role (x/y/bins/site/test
/// value). Numeric-looking strings still parse (mirrors CSV/JSON's own
/// string-typed leniency); anything else fails.
fn field_to_f64(f: &Field) -> Option<f64> {
    match f {
        Field::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Field::Byte(n) => Some(*n as f64),
        Field::Short(n) => Some(*n as f64),
        Field::Int(n) => Some(*n as f64),
        Field::Long(n) => Some(*n as f64),
        Field::UByte(n) => Some(*n as f64),
        Field::UShort(n) => Some(*n as f64),
        Field::UInt(n) => Some(*n as f64),
        Field::ULong(n) => Some(*n as f64),
        Field::Float16(n) => Some(f64::from(*n)),
        Field::Float(n) => Some(*n as f64),
        Field::Double(n) => Some(*n),
        Field::Str(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// Stringify a field for metadata/text roles and the headers-overlay sample
/// preview. Deliberately not `Field`'s own `Display` impl: that wraps strings
/// in literal quote marks, which is right for a debug repr but wrong for a
/// text cell shown to the user (CSV/JSON never quote their string cells).
fn field_to_string(f: &Field) -> String {
    match f {
        Field::Null => String::new(),
        Field::Str(s) => s.clone(),
        Field::Bool(b) => b.to_string(),
        Field::Byte(n) => n.to_string(),
        Field::Short(n) => n.to_string(),
        Field::Int(n) => n.to_string(),
        Field::Long(n) => n.to_string(),
        Field::UByte(n) => n.to_string(),
        Field::UShort(n) => n.to_string(),
        Field::UInt(n) => n.to_string(),
        Field::ULong(n) => n.to_string(),
        Field::Float(n) => n.to_string(),
        Field::Double(n) => n.to_string(),
        // Decimal/Date/Time*/Bytes/nested groups — Display already formats these
        // sensibly (unquoted) and they're not roles this parser treats as text
        // metadata in practice.
        other => other.to_string(),
    }
}

pub fn parquet_headers_from_bytes(bytes: &[u8]) -> Result<ParquetHeadersResult, String> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let reader = SerializedFileReader::new(Bytes::from(bytes.to_vec())).map_err(|e| e.to_string())?;
    headers_from_reader(&reader)
}

/// A `.parquet.gz`-wrapped file (unusual — Parquet already compresses its own
/// pages — but not impossible, and every other format decompresses `.gz`
/// transparently by extension, so this stays consistent) can't be read via the
/// fast `File`-based `ChunkReader` path below: gzip streams aren't seekable,
/// and Parquet's footer-based format needs random access. It's read fully into
/// memory and decompressed via `read_file::read_bytes` (which already does the
/// same extension check), then wrapped in the same `Bytes` path the all-target
/// bytes functions use. A plain (non-gz) `.parquet` file — the common case —
/// keeps the direct, unbuffered `File` path.
#[cfg(feature = "native")]
fn is_gz_path(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gz"))
        .unwrap_or(false)
}

#[cfg(feature = "native")]
pub fn parquet_headers_inner(path: String) -> Result<ParquetHeadersResult, String> {
    if is_gz_path(&path) {
        let bytes = crate::read_file::read_bytes(&path)?;
        let reader = SerializedFileReader::new(Bytes::from(bytes)).map_err(|e| e.to_string())?;
        headers_from_reader(&reader)
    } else {
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let reader = SerializedFileReader::new(file).map_err(|e| e.to_string())?;
        headers_from_reader(&reader)
    }
}

fn headers_from_reader<R: FileReader>(reader: &R) -> Result<ParquetHeadersResult, String> {
    let row_count = reader.metadata().file_metadata().num_rows().max(0) as usize;
    let row_iter = reader.get_row_iter(None).map_err(|e| e.to_string())?;

    let mut headers: Vec<String> = Vec::new();
    let mut column_types: HashMap<String, String> = HashMap::new();
    let mut sample: Vec<HashMap<String, String>> = Vec::new();

    for row_result in row_iter.take(5) {
        let row: Row = row_result.map_err(|e| e.to_string())?;
        let mut record: HashMap<String, String> = HashMap::new();
        for (name, field) in row.get_column_iter() {
            if !headers.iter().any(|h| h == name) {
                headers.push(name.clone());
            }
            column_types.entry(name.clone()).or_insert_with(|| field_kind(field).to_string());
            record.insert(name.clone(), field_to_string(field));
        }
        sample.push(record);
    }

    // A file with zero rows still has a schema — fall back to it so an empty
    // Parquet file can still be mapped (just with no sample preview), rather
    // than presenting the user with no columns at all.
    if headers.is_empty() {
        headers = reader
            .metadata()
            .file_metadata()
            .schema_descr()
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();
    }

    Ok(ParquetHeadersResult { headers, sample, row_count, column_types })
}

pub fn parse_parquet_from_bytes(bytes: &[u8], mapping: CsvMapping) -> Result<ParsedStdf, String> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let reader = SerializedFileReader::new(Bytes::from(bytes.to_vec())).map_err(|e| e.to_string())?;
    parse_from_reader(&reader, mapping)
}

#[cfg(feature = "native")]
pub fn parse_parquet_inner(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String> {
    if is_gz_path(&path) {
        let bytes = crate::read_file::read_bytes(&path)?;
        let reader = SerializedFileReader::new(Bytes::from(bytes)).map_err(|e| e.to_string())?;
        parse_from_reader(&reader, mapping)
    } else {
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let reader = SerializedFileReader::new(file).map_err(|e| e.to_string())?;
        parse_from_reader(&reader, mapping)
    }
}

fn parse_from_reader<R: FileReader>(reader: &R, mapping: CsvMapping) -> Result<ParsedStdf, String> {
    let column_names: Vec<String> = reader
        .metadata()
        .file_metadata()
        .schema_descr()
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let col_idx: HashMap<String, usize> = column_names
        .iter()
        .enumerate()
        .map(|(i, h)| (h.clone(), i))
        .collect();

    // `t.test_number` is assigned upstream in TS (mappingUI.ts's readMapping,
    // hashed from the column's own key) — Rust just uses it as given. `order`
    // is the one thing only Rust can supply here: the column's position in
    // this array, i.e. the file's own column order.
    let test_defs: HashMap<String, TestDef> = mapping
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

    let row_iter = reader.get_row_iter(None).map_err(|e| e.to_string())?;
    let is_long_format = (mapping.testname_col.is_some() || mapping.testnumber_col.is_some())
        && mapping.testvalue_col.is_some();

    if is_long_format {
        parse_long_format(row_iter, &mapping, test_defs)
    } else {
        parse_wide_format(row_iter, &col_idx, &mapping, test_defs)
    }
}

/// Every field a row could carry, keyed by resolved column index, for a
/// single row — collected once per row so we don't re-walk `get_column_iter`
/// per mapped column. Positional (not a name-keyed map): schema/column order
/// is identical across every row, so the same `col_idx` resolved once outside
/// the loop applies to every row's `Vec`.
fn row_fields(row: &Row) -> Vec<&Field> {
    row.get_column_iter().map(|(_, f)| f).collect()
}

/// Coerce a resolved cell to a numeric role's `f64`. Counts (rather than
/// immediately warning on) a failure where the source field is itself
/// string-typed — i.e. an actual mapping mismatch, not just a sparse/null
/// value — so the caller can emit one summarised warning per role instead of
/// one per row.
fn coerce_role_f64(field: Option<&Field>, role_key: &str, mismatches: &mut HashMap<String, u32>) -> Option<f64> {
    let f = field?;
    if let Some(v) = field_to_f64(f) {
        return Some(v);
    }
    if field_kind(f) == "string" {
        *mismatches.entry(role_key.to_string()).or_insert(0) += 1;
    }
    None
}

fn mismatch_warnings(mismatches: &HashMap<String, u32>, test_defs: &HashMap<String, TestDef>) -> Vec<String> {
    let mut warnings: Vec<String> = mismatches
        .iter()
        .map(|(role, count)| {
            let label = test_defs.get(role).map(|d| d.name.as_str()).unwrap_or(role.as_str());
            format!("Column mapped to '{label}' contained {count} non-numeric value(s) that were skipped")
        })
        .collect();
    warnings.sort();
    warnings
}

/// Fast path: one column per test, values read straight from their typed
/// Parquet field with no string round-trip. This is the expected common case
/// for Parquet test-data exports (columnar storage naturally suits a wide
/// table), and the path where Parquet's speed over CSV/JSON actually matters.
fn parse_wide_format(
    row_iter: impl Iterator<Item = parquet::errors::Result<Row>>,
    col_idx: &HashMap<String, usize>,
    mapping: &CsvMapping,
    test_defs: HashMap<String, TestDef>,
) -> Result<ParsedStdf, String> {
    let idx = |name: &str| col_idx.get(name).copied();
    let opt_idx = |c: &Option<String>| c.as_deref().and_then(idx);

    let x_i = opt_idx(&mapping.x);
    let y_i = opt_idx(&mapping.y);
    let hbin_i = opt_idx(&mapping.hbin);
    let sbin_i = opt_idx(&mapping.sbin);
    let site_i = opt_idx(&mapping.site);
    let wafer_i = opt_idx(&mapping.wafer);
    let lot_i = opt_idx(&mapping.lot);
    let split_i: Vec<(String, usize)> = mapping.split_by.iter()
        .filter_map(|c| idx(c).map(|i| (c.clone(), i))).collect();
    let test_i: Vec<(String, usize)> = mapping.tests.iter()
        .filter_map(|t| idx(&t.col).map(|i| (t.test_number.to_string(), i))).collect();
    let meta_i: Vec<(String, usize)> = mapping.meta.iter()
        .filter_map(|c| idx(c).map(|i| (c.clone(), i))).collect();

    let pass_bin_set: HashSet<u32> = mapping.pass_bins.iter().copied().collect();
    let mut mismatches: HashMap<String, u32> = HashMap::new();

    let mut groups: indexmap::IndexMap<String, WaferData> = indexmap::IndexMap::new();
    let mut row_index_by_group: HashMap<String, u32> = HashMap::new();
    let mut first_kept: Option<HashMap<String, String>> = None;

    for row_result in row_iter {
        let row = row_result.map_err(|e| e.to_string())?;
        let fields = row_fields(&row);
        let cell = |i: usize| fields.get(i).copied();

        // No x/y column mapped, or this cell doesn't coerce to a number —
        // kept as a coordinate-less die rather than dropped.
        let x: Option<i32> = x_i.and_then(cell).and_then(field_to_f64).map(|v| v as i32);
        let y: Option<i32> = y_i.and_then(cell).and_then(field_to_f64).map(|v| v as i32);
        let (x, y) = if x.is_some() && y.is_some() { (x, y) } else { (None, None) };

        let wafer_field = wafer_i.and_then(cell);
        let wid = wafer_field.map(field_to_string).filter(|v| !v.is_empty()).unwrap_or_else(|| "W1".to_string());

        let key = if split_i.is_empty() {
            wid.clone()
        } else {
            let parts: Vec<String> = split_i.iter()
                .filter_map(|(name, i)| {
                    let v = cell(*i).map(field_to_string)?;
                    if v.is_empty() { None } else { Some(format!("{}: {}", name, v)) }
                })
                .collect();
            if parts.is_empty() { wid.clone() } else { format!("{} · {}", wid, parts.join(" · ")) }
        };

        let hbin = coerce_role_f64(hbin_i.and_then(cell), "hbin", &mut mismatches).map(|v| v as u32);
        let sbin = coerce_role_f64(sbin_i.and_then(cell), "sbin", &mut mismatches).map(|v| v as u32);
        let site_num = coerce_role_f64(site_i.and_then(cell), "site", &mut mismatches).map(|v| v as u32);

        let mut test_values: HashMap<String, f64> = HashMap::with_capacity(test_i.len());
        for (tnum, i) in &test_i {
            if let Some(v) = coerce_role_f64(cell(*i), tnum, &mut mismatches) {
                test_values.insert(tnum.clone(), v);
            }
        }

        if first_kept.is_none() {
            let mut m = HashMap::new();
            if let Some(i) = lot_i { m.insert("__lot".to_string(), field_to_string(fields[i])); }
            for (name, i) in &meta_i { m.insert(name.clone(), field_to_string(fields[*i])); }
            first_kept = Some(m);
        }

        let die_index = if x.is_none() {
            let counter = row_index_by_group.entry(key.clone()).or_insert(0);
            let idx = *counter;
            *counter += 1;
            Some(idx)
        } else {
            None
        };

        let wafer = groups.entry(key).or_insert_with(|| WaferData {
            wafer_id: wid,
            results: Vec::new(),
            part_count: None, good_count: None, fail_count: None,
            fields: Vec::new(),
        });
        wafer.results.push(DieResult { x, y, die_index, hbin, sbin, site_num, part_id: None, test_values, test_pass: HashMap::new() });
    }

    let wafers: Vec<WaferData> = groups.into_values().map(|mut w| {
        let part = w.results.len() as u32;
        let good = w.results.iter().filter(|d|
            pass_bin_set.is_empty()
            || d.hbin.map_or(false, |b| pass_bin_set.contains(&b))
            || d.sbin.map_or(false, |b| pass_bin_set.contains(&b))
        ).count() as u32;
        w.part_count = Some(part);
        w.good_count = Some(good);
        w.fail_count = Some(part - good);
        w
    }).collect();

    let mut meta = LotMeta::default();
    if let Some(m) = &first_kept {
        if mapping.lot.is_some() { meta.push("lotId", m.get("__lot").cloned()); }
        for col in &mapping.meta { meta.push(col, m.get(col).cloned()); }
    }

    let mut warnings = mismatch_warnings(&mismatches, &test_defs);
    warnings.extend(position_warnings(&wafers));
    Ok(ParsedStdf { meta, wafers, test_defs, sites: vec![], warnings })
}

/// Long/pivot format: one row per (die, test) rather than one column per test.
/// Less natural for a columnar format than wide, but the mapping UI offers the
/// same toggle it does for CSV/JSON, so a Parquet export using it must still
/// work. Values are stringified per row (mirrors CSV/JSON's own long-format
/// path) since the pivot is inherently dynamic — test identity isn't known
/// until the name column is read.
fn parse_long_format(
    row_iter: impl Iterator<Item = parquet::errors::Result<Row>>,
    mapping: &CsvMapping,
    mut test_defs: HashMap<String, TestDef>,
) -> Result<ParsedStdf, String> {
    let name_col = mapping.testname_col.as_deref();
    let num_col = mapping.testnumber_col.as_deref();
    let val_col = mapping.testvalue_col.as_deref().unwrap();

    let mut die_map: indexmap::IndexMap<String, HashMap<String, String>> = indexmap::IndexMap::new();
    let mut long_fmt_test_numbers: HashMap<String, u32> = HashMap::new();
    let mut used_test_numbers: HashSet<u32> = mapping.tests.iter().map(|t| t.test_number).collect();
    let mut next_order: u32 = 0;

    for (row_idx, row_result) in row_iter.enumerate() {
        let row = row_result.map_err(|e| e.to_string())?;
        let mut cells: HashMap<String, String> = HashMap::new();
        for (name, field) in row.get_column_iter() {
            cells.insert(name.clone(), field_to_string(field));
        }

        let x = mapping.x.as_deref().and_then(|c| cells.get(c)).map(|s| s.as_str()).unwrap_or("");
        let y = mapping.y.as_deref().and_then(|c| cells.get(c)).map(|s| s.as_str()).unwrap_or("");
        let has_position = !x.is_empty() && !y.is_empty();
        let wafer = mapping.wafer.as_deref().and_then(|c| cells.get(c)).map(|s| s.as_str()).unwrap_or("");
        let lot = mapping.lot.as_deref().and_then(|c| cells.get(c)).map(|s| s.as_str()).unwrap_or("");
        // Positioned rows pivot together by (wafer, lot, x, y) as before. A
        // coordinate-less row has no position to group by — rather than
        // merging unrelated rows under a shared empty key, each becomes its
        // own die (row_idx guarantees a unique key).
        let key = if has_position {
            format!("{}\x00{}\x00{}\x00{}", wafer, lot, x, y)
        } else {
            format!("{}\x00{}\x00__row_{}", wafer, lot, row_idx)
        };

        let wide = die_map.entry(key).or_insert_with(|| {
            let mut m = HashMap::new();
            if has_position {
                if let Some(c) = &mapping.x { m.insert(c.clone(), x.to_string()); }
                if let Some(c) = &mapping.y { m.insert(c.clone(), y.to_string()); }
            }
            if let Some(c) = &mapping.wafer { m.insert(c.clone(), wafer.to_string()); }
            if let Some(c) = &mapping.lot   { m.insert(c.clone(), lot.to_string()); }
            if let Some(c) = &mapping.hbin  { m.insert(c.clone(), cells.get(c).cloned().unwrap_or_default()); }
            if let Some(c) = &mapping.sbin  { m.insert(c.clone(), cells.get(c).cloned().unwrap_or_default()); }
            if let Some(c) = &mapping.site  { m.insert(c.clone(), cells.get(c).cloned().unwrap_or_default()); }
            for c in &mapping.meta { m.insert(c.clone(), cells.get(c).cloned().unwrap_or_default()); }
            m
        });

        let test_name = name_col.and_then(|c| cells.get(c)).map(|s| s.as_str()).unwrap_or("");
        let test_val = cells.get(val_col).map(|s| s.as_str()).unwrap_or("");
        if test_val.is_empty() { continue; }
        // A row's own number, when the column is mapped and this row's value
        // parses — takes priority over the name as the test's real identity.
        let real_number: Option<u32> = num_col
            .and_then(|c| cells.get(c))
            .filter(|s| !s.is_empty())
            .and_then(|s| s.trim().parse::<u32>().ok());
        if test_name.is_empty() && real_number.is_none() { continue; }

        let identity_key = match real_number {
            Some(n) => format!("#{n}"),
            None => test_name.to_string(),
        };

        let tnum = *long_fmt_test_numbers.entry(identity_key).or_insert_with(|| {
            let n = match real_number {
                Some(n) => { used_test_numbers.insert(n); n }
                None => crate::test_identity::stable_test_number(test_name, &mut used_test_numbers),
            };
            let order = next_order;
            next_order += 1;
            let lo_limit = mapping.lo_limit_col.as_deref()
                .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
            let hi_limit = mapping.hi_limit_col.as_deref()
                .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
            let units = mapping.units_col.as_deref()
                .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).cloned();
            // No name column (or this row's name cell was empty): the
            // number is all we have, so it doubles as the display name.
            let display_name = if test_name.is_empty() { n.to_string() } else { test_name.to_string() };
            test_defs.insert(n.to_string(), TestDef {
                name: display_name,
                test_type: "P".to_string(),
                lo_limit, hi_limit, units,
                order: Some(order),
            });
            n
        });
        wide.insert(format!("__test_{}", tnum), test_val.to_string());
    }

    let active_rows: Vec<HashMap<String, String>> = die_map.into_values().collect();
    let pass_bin_set: HashSet<u32> = mapping.pass_bins.iter().copied().collect();

    let mut groups: indexmap::IndexMap<String, Vec<&HashMap<String, String>>> = indexmap::IndexMap::new();
    for row in &active_rows {
        let wid = mapping.wafer.as_deref()
            .and_then(|c| row.get(c))
            .filter(|v| !v.is_empty())
            .cloned()
            .unwrap_or_else(|| "W1".to_string());
        let split_parts: Vec<String> = mapping.split_by.iter()
            .filter_map(|col| {
                let v = row.get(col)?;
                if v.is_empty() { None } else { Some(format!("{}: {}", col, v)) }
            })
            .collect();
        let key = if split_parts.is_empty() { wid } else { format!("{} · {}", wid, split_parts.join(" · ")) };
        groups.entry(key).or_default().push(row);
    }

    let mut wafers: Vec<WaferData> = Vec::new();
    for (wid, rows) in &groups {
        let mut dies: Vec<DieResult> = Vec::new();
        let mut row_index_in_wafer: u32 = 0;
        for row in rows {
            let x: Option<i32> = mapping.x.as_deref().and_then(|c| row.get(c)).and_then(|v| v.parse().ok());
            let y: Option<i32> = mapping.y.as_deref().and_then(|c| row.get(c)).and_then(|v| v.parse().ok());
            let (x, y) = if x.is_some() && y.is_some() { (x, y) } else { (None, None) };
            let die_index = if x.is_none() {
                let idx = row_index_in_wafer;
                row_index_in_wafer += 1;
                Some(idx)
            } else {
                None
            };
            let hbin: Option<u32> = mapping.hbin.as_deref().and_then(|c| row.get(c)).and_then(|v| v.parse().ok());
            let sbin: Option<u32> = mapping.sbin.as_deref().and_then(|c| row.get(c)).and_then(|v| v.parse().ok());
            let site_num: Option<u32> = mapping.site.as_deref().and_then(|c| row.get(c)).and_then(|v| v.trim().parse().ok());

            let mut test_values: HashMap<String, f64> = HashMap::new();
            for tnum in long_fmt_test_numbers.values() {
                let k = format!("__test_{}", tnum);
                if let Some(v) = row.get(&k).and_then(|s| s.parse::<f64>().ok()) {
                    test_values.insert(tnum.to_string(), v);
                }
            }

            dies.push(DieResult { x, y, die_index, hbin, sbin, site_num, part_id: None, test_values, test_pass: HashMap::new() });
        }

        let part_count = dies.len() as u32;
        let good_count = dies.iter()
            .filter(|d| pass_bin_set.is_empty()
                || d.hbin.map_or(false, |b| pass_bin_set.contains(&b))
                || d.sbin.map_or(false, |b| pass_bin_set.contains(&b)))
            .count() as u32;

        wafers.push(WaferData {
            wafer_id: wid.clone(),
            results: dies,
            part_count: Some(part_count),
            good_count: Some(good_count),
            fail_count: Some(part_count - good_count),
            fields: Vec::new(),
        });
    }

    let mut meta = LotMeta::default();
    if let Some(first) = active_rows.first() {
        if let Some(lot_col) = mapping.lot.as_deref() {
            meta.push("lotId", first.get(lot_col).cloned());
        }
        for col in &mapping.meta {
            meta.push(col, first.get(col).cloned());
        }
    }

    let warnings = position_warnings(&wafers);
    Ok(ParsedStdf { meta, wafers, test_defs, sites: vec![], warnings })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_csv::CsvTestCol;
    use parquet::data_type::{ByteArray, Int32Type, DoubleType, ByteArrayType};
    use parquet::file::properties::WriterProperties;
    use parquet::file::writer::SerializedFileWriter;
    use parquet::schema::parser::parse_message_type;
    use std::sync::Arc;

    fn basic_mapping(x: &str, y: &str) -> CsvMapping {
        CsvMapping {
            x: Some(x.to_string()), y: Some(y.to_string()),
            hbin: None, sbin: None, wafer: None, lot: None, site: None,
            tests: vec![], meta: vec![], split_by: vec![],
            testname_col: None, testnumber_col: None, testvalue_col: None,
            lo_limit_col: None, hi_limit_col: None, units_col: None,
            pass_bins: vec![],
        }
    }

    /// Writes a small wide-format Parquet fixture: `x:int32, y:int32, hbin:int32,
    /// wafer:byte_array (utf8), t1:double, t2:double`, compressed with the given
    /// codec. Row-by-row via the crate's own column-writer API (no `arrow`
    /// feature needed — the same one arrow-rs itself uses in its low-level tests).
    fn write_fixture(codec: parquet::basic::Compression) -> Vec<u8> {
        let schema = Arc::new(
            parse_message_type(
                "message schema {
                    REQUIRED INT32 x;
                    REQUIRED INT32 y;
                    REQUIRED INT32 hbin;
                    REQUIRED BYTE_ARRAY wafer (UTF8);
                    REQUIRED DOUBLE t1;
                    REQUIRED DOUBLE t2;
                }",
            )
            .unwrap(),
        );
        let props = Arc::new(WriterProperties::builder().set_compression(codec).build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut row_group = writer.next_row_group().unwrap();

            let xs = [0i32, 1, 2];
            let ys = [0i32, 0, 0];
            let hbins = [1i32, 1, 2];
            let wafers = [b"W1".to_vec(), b"W1".to_vec(), b"W1".to_vec()];
            let t1s = [1.1f64, 2.2, 3.3];
            let t2s = [4.4f64, 5.5, 6.6];

            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&xs, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&ys, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&hbins, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            let wafer_vals: Vec<ByteArray> = wafers.iter().map(|w| ByteArray::from(w.clone())).collect();
            col.typed::<ByteArrayType>().write_batch(&wafer_vals, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<DoubleType>().write_batch(&t1s, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<DoubleType>().write_batch(&t2s, None, None).unwrap();
            col.close().unwrap();

            row_group.close().unwrap();
            writer.close().unwrap();
        }
        buf
    }

    fn wide_mapping() -> CsvMapping {
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".to_string());
        m.wafer = Some("wafer".to_string());
        m.tests = vec![
            CsvTestCol { col: "t1".to_string(), test_number: 1, name: "T1".to_string() },
            CsvTestCol { col: "t2".to_string(), test_number: 2, name: "T2".to_string() },
        ];
        m
    }

    #[test]
    fn headers_report_columns_types_and_sample() {
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let result = parquet_headers_from_bytes(&bytes).unwrap();
        assert_eq!(result.row_count, 3);
        assert!(result.headers.contains(&"x".to_string()));
        assert!(result.headers.contains(&"wafer".to_string()));
        assert_eq!(result.column_types.get("x").map(|s| s.as_str()), Some("number"));
        assert_eq!(result.column_types.get("wafer").map(|s| s.as_str()), Some("string"));
        assert_eq!(result.sample.len(), 3);
        assert_eq!(result.sample[0].get("wafer").map(|s| s.as_str()), Some("W1"));
    }

    #[test]
    fn wide_format_parses_dies_and_test_values() {
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let result = parse_parquet_from_bytes(&bytes, wide_mapping()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 3);
        let d0 = dies.iter().find(|d| d.x == Some(0) && d.y == Some(0)).unwrap();
        assert_eq!(d0.hbin, Some(1));
        assert!((d0.test_values["1"] - 1.1).abs() < 1e-9);
        assert!((d0.test_values["2"] - 4.4).abs() < 1e-9);
    }

    #[test]
    fn pass_bins_filter_good_count() {
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let mut m = wide_mapping();
        m.pass_bins = vec![1];
        let result = parse_parquet_from_bytes(&bytes, m).unwrap();
        let w = &result.wafers[0];
        assert_eq!(w.part_count, Some(3));
        assert_eq!(w.good_count, Some(2));
        assert_eq!(w.fail_count, Some(1));
    }

    #[test]
    fn lot_and_wafer_id_from_mapped_columns() {
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let result = parse_parquet_from_bytes(&bytes, wide_mapping()).unwrap();
        assert_eq!(result.wafers[0].wafer_id, "W1");
    }

    #[test]
    fn each_codec_round_trips() {
        for codec in [
            parquet::basic::Compression::UNCOMPRESSED,
            parquet::basic::Compression::SNAPPY,
            parquet::basic::Compression::GZIP(Default::default()),
            parquet::basic::Compression::LZ4_RAW,
            parquet::basic::Compression::ZSTD(Default::default()),
        ] {
            let bytes = write_fixture(codec);
            let result = parse_parquet_from_bytes(&bytes, wide_mapping()).unwrap();
            assert_eq!(result.wafers[0].results.len(), 3, "codec {codec:?} round-trip failed");
        }
    }

    #[test]
    fn type_mismatch_warns_instead_of_panicking() {
        // Map a numeric test column ("t1") onto the string-typed "wafer" column —
        // every value should fail to coerce and be skipped, with a warning
        // surfaced rather than a panic or a silently-zeroed value.
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let mut m = basic_mapping("x", "y");
        m.tests = vec![CsvTestCol { col: "wafer".to_string(), test_number: 99, name: "Bogus".to_string() }];
        let result = parse_parquet_from_bytes(&bytes, m).unwrap();
        for die in &result.wafers[0].results {
            assert!(!die.test_values.contains_key("99"));
        }
        assert!(!result.warnings.is_empty(), "expected a type-mismatch warning");
        assert!(result.warnings[0].contains("Bogus"));
    }

    #[test]
    fn truncated_file_errors_without_panicking() {
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);
        let truncated = &bytes[..bytes.len() / 2];
        assert!(parquet_headers_from_bytes(truncated).is_err());
        assert!(parse_parquet_from_bytes(truncated, basic_mapping("x", "y")).is_err());
    }

    /// `.parquet.gz` — unusual (Parquet already compresses internally) but every
    /// other format decompresses `.gz` transparently by extension, and the
    /// native path here has its own `is_gz_path` branch specifically for this
    /// (see its doc comment) — so it needs its own coverage, not just the
    /// bytes-based tests above.
    #[test]
    fn native_gz_wrapped_file_parses_same_as_plain() {
        use std::io::Write;
        let bytes = write_fixture(parquet::basic::Compression::UNCOMPRESSED);

        let mut plain = tempfile::Builder::new().suffix(".parquet").tempfile().unwrap();
        plain.write_all(&bytes).unwrap();
        let plain_path = plain.into_temp_path().keep().unwrap();

        let mut gz_file = tempfile::Builder::new().suffix(".parquet.gz").tempfile().unwrap();
        let mut enc = flate2::write::GzEncoder::new(&mut gz_file, flate2::Compression::default());
        enc.write_all(&bytes).unwrap();
        enc.finish().unwrap();
        let gz_path = gz_file.into_temp_path().keep().unwrap();

        let plain_headers = parquet_headers_inner(plain_path.to_str().unwrap().to_string()).unwrap();
        let gz_headers = parquet_headers_inner(gz_path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(gz_headers.headers, plain_headers.headers);
        assert_eq!(gz_headers.row_count, plain_headers.row_count);

        let plain_parsed = parse_parquet_inner(plain_path.to_str().unwrap().to_string(), wide_mapping()).unwrap();
        let gz_parsed = parse_parquet_inner(gz_path.to_str().unwrap().to_string(), wide_mapping()).unwrap();
        let plain_dies: usize = plain_parsed.wafers.iter().map(|w| w.results.len()).sum();
        let gz_dies: usize = gz_parsed.wafers.iter().map(|w| w.results.len()).sum();
        assert_eq!(gz_dies, plain_dies);
    }

    #[test]
    fn empty_bytes_errors_without_panicking() {
        assert!(parquet_headers_from_bytes(&[]).is_err());
    }

    fn write_long_format_fixture() -> Vec<u8> {
        let schema = Arc::new(
            parse_message_type(
                "message schema {
                    REQUIRED INT32 x;
                    REQUIRED INT32 y;
                    REQUIRED BYTE_ARRAY test (UTF8);
                    REQUIRED DOUBLE val;
                }",
            )
            .unwrap(),
        );
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut row_group = writer.next_row_group().unwrap();

            let xs = [0i32, 0, 1];
            let ys = [0i32, 0, 0];
            let tests: Vec<ByteArray> = ["Vt", "Idsat", "Vt"].iter().map(|s| ByteArray::from(s.as_bytes().to_vec())).collect();
            let vals = [1.1f64, 2.2, 1.3];

            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&xs, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&ys, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<ByteArrayType>().write_batch(&tests, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<DoubleType>().write_batch(&vals, None, None).unwrap();
            col.close().unwrap();

            row_group.close().unwrap();
            writer.close().unwrap();
        }
        buf
    }

    /// Same 3-row (x,y,test,val) shape as `write_long_format_fixture`, plus an
    /// INT32 `tnum` column: row0/row2 share test "Vt"/1001, row1 is "Idsat"/1002.
    fn write_long_format_fixture_with_number() -> Vec<u8> {
        let schema = Arc::new(
            parse_message_type(
                "message schema {
                    REQUIRED INT32 x;
                    REQUIRED INT32 y;
                    REQUIRED BYTE_ARRAY test (UTF8);
                    REQUIRED INT32 tnum;
                    REQUIRED DOUBLE val;
                }",
            )
            .unwrap(),
        );
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut row_group = writer.next_row_group().unwrap();

            let xs = [0i32, 0, 1];
            let ys = [0i32, 0, 0];
            let tests: Vec<ByteArray> = ["Vt", "Idsat", "Vt"].iter().map(|s| ByteArray::from(s.as_bytes().to_vec())).collect();
            let tnums = [1001i32, 1002, 1001];
            let vals = [1.1f64, 2.2, 1.3];

            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&xs, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&ys, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<ByteArrayType>().write_batch(&tests, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&tnums, None, None).unwrap();
            col.close().unwrap();
            let mut col = row_group.next_column().unwrap().unwrap();
            col.typed::<DoubleType>().write_batch(&vals, None, None).unwrap();
            col.close().unwrap();

            row_group.close().unwrap();
            writer.close().unwrap();
        }
        buf
    }

    #[test]
    fn long_format_pivots_into_dies() {
        let bytes = write_long_format_fixture();
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_parquet_from_bytes(&bytes, m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
    }

    #[test]
    fn long_format_number_only_uses_real_number_and_copies_name_from_it() {
        let bytes = write_long_format_fixture_with_number();
        let mut m = basic_mapping("x", "y");
        m.testnumber_col = Some("tnum".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_parquet_from_bytes(&bytes, m).unwrap();
        assert_eq!(result.wafers[0].results.len(), 2);
        assert_eq!(result.test_defs.len(), 2);
        assert_eq!(result.test_defs.get("1001").map(|d| d.name.as_str()), Some("1001"));
        assert_eq!(result.test_defs.get("1002").map(|d| d.name.as_str()), Some("1002"));
    }

    #[test]
    fn long_format_name_and_number_uses_real_number_with_given_name() {
        let bytes = write_long_format_fixture_with_number();
        let mut m = basic_mapping("x", "y");
        m.testname_col = Some("test".to_string());
        m.testnumber_col = Some("tnum".to_string());
        m.testvalue_col = Some("val".to_string());
        let result = parse_parquet_from_bytes(&bytes, m).unwrap();
        assert_eq!(result.test_defs.len(), 2);
        assert_eq!(result.test_defs.get("1001").map(|d| d.name.as_str()), Some("Vt"));
        assert_eq!(result.test_defs.get("1002").map(|d| d.name.as_str()), Some("Idsat"));
    }

    #[test]
    fn sample_file_coordinateless_lot() {
        // sample_data/TESTNUM-COORDLESS-01.parquet — same lot as the CSV/JSON
        // fixtures of the same name: W01 fully positioned, W02 mixed (2 of 4
        // rows have null x/y), W03 fully coordinate-less. See WMAP_ISSUES.md #39.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/TESTNUM-COORDLESS-01.parquet");
        let mut m = basic_mapping("x", "y");
        m.wafer = Some("wafer".to_string());
        m.hbin = Some("hbin".to_string());
        m.sbin = Some("sbin".to_string());
        m.tests = vec![
            CsvTestCol { col: "3001".to_string(), test_number: 3001, name: "3001".to_string() },
            CsvTestCol { col: "3002".to_string(), test_number: 3002, name: "3002".to_string() },
            CsvTestCol { col: "3003".to_string(), test_number: 3003, name: "3003".to_string() },
        ];
        let result = parse_parquet_inner(path.to_string(), m).unwrap();
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
}

