use bytes::Bytes;
use parquet::file::reader::{FileReader, SerializedFileReader};
use parquet::record::{Field, Row};
use parquet::schema::types::Type;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use crate::types::*;
use crate::flat_wafers::{FlatRow, split_parts, into_parsed};
use crate::parse_csv::CsvMapping;
use crate::error::{ParseError, ParseResult};

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

/// No value in the cell: a Parquet null, or text that is empty or only spaces.
fn is_blank(f: &Field) -> bool {
    match f {
        Field::Null => true,
        Field::Str(s) => s.trim().is_empty(),
        _ => false,
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

pub fn parquet_headers_from_bytes(bytes: &[u8]) -> ParseResult<ParquetHeadersResult> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let reader = SerializedFileReader::new(Bytes::from(bytes.to_vec())).map_err(ParseError::parquet_read)?;
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

/// Opens `path` as a Parquet reader bound to `$r` and evaluates `$body` with
/// it — the one copy of the gz-or-plain branch described above, which every
/// path entry point needs. A macro rather than a function because the two
/// branches' readers are different types (`SerializedFileReader<Bytes>` vs
/// `<File>`). It was written out in full in each entry point until a third
/// (`parquet_distinct_count_inner`) came along.
#[cfg(feature = "native")]
macro_rules! with_path_reader {
    ($path:expr, |$r:ident| $body:expr) => {{
        let path: &str = $path;
        if is_gz_path(path) {
            let bytes = crate::read_file::read_bytes(path)?;
            let $r = SerializedFileReader::new(Bytes::from(bytes)).map_err(ParseError::parquet_read)?;
            $body
        } else {
            let file = std::fs::File::open(path).map_err(ParseError::file_read)?;
            let $r = SerializedFileReader::new(file).map_err(ParseError::parquet_read)?;
            $body
        }
    }};
}

#[cfg(feature = "native")]
pub fn parquet_headers_inner(path: String) -> ParseResult<ParquetHeadersResult> {
    with_path_reader!(&path, |reader| headers_from_reader(&reader))
}

fn headers_from_reader<R: FileReader>(reader: &R) -> ParseResult<ParquetHeadersResult> {
    let row_count = reader.metadata().file_metadata().num_rows().max(0) as usize;
    let row_iter = reader.get_row_iter(None).map_err(ParseError::parquet_read)?;

    let mut headers: Vec<String> = Vec::new();
    let mut column_types: HashMap<String, String> = HashMap::new();
    let mut sample: Vec<HashMap<String, String>> = Vec::new();

    for row_result in row_iter.take(5) {
        let row: Row = row_result.map_err(ParseError::parquet_read)?;
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

/// How many distinct combinations of `columns`' values the file holds — the
/// file filter's wafer count, asked for as (lot, wafer) pairs because that is
/// how a load identifies a wafer (`flat_wafers.rs`). Reads only those columns
/// (a projection), which is what makes this affordable during a header scan;
/// CSV/JSON have no such shortcut and so get no wafer count. Values are
/// trimmed, and a row blank in every column is not a wafer. A column name
/// missing from the schema is an error rather than a count of nothing.
pub fn parquet_distinct_count_from_bytes(bytes: &[u8], columns: &[String]) -> ParseResult<usize> {
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let reader = SerializedFileReader::new(Bytes::from(bytes.to_vec())).map_err(ParseError::parquet_read)?;
    distinct_count_from_reader(&reader, columns)
}

#[cfg(feature = "native")]
pub fn parquet_distinct_count_inner(path: String, columns: Vec<String>) -> ParseResult<usize> {
    with_path_reader!(&path, |reader| distinct_count_from_reader(&reader, &columns))
}

fn distinct_count_from_reader<R: FileReader>(reader: &R, columns: &[String]) -> ParseResult<usize> {
    let schema = reader.metadata().file_metadata().schema();
    if let Some(missing) = columns.iter().find(|c| !schema.get_fields().iter().any(|f| f.name() == c.as_str())) {
        return Err(ParseError::column_missing(missing));
    }
    // Schema order, not `columns` order: a projection must be a subset of the
    // schema as laid out. The count does not depend on the order.
    let fields = schema.get_fields().iter()
        .filter(|f| columns.iter().any(|c| c == f.name()))
        .cloned()
        .collect();
    let projection = Type::group_type_builder(schema.name())
        .with_fields(fields)
        .build()
        .map_err(ParseError::parquet_read)?;

    let mut seen: HashSet<Vec<String>> = HashSet::new();
    for row in reader.get_row_iter(Some(projection)).map_err(ParseError::parquet_read)? {
        let row = row.map_err(ParseError::parquet_read)?;
        let key: Vec<String> = row.get_column_iter()
            .map(|(_, f)| field_to_string(f).trim().to_string())
            .collect();
        if key.iter().all(|v| v.is_empty()) { continue; }
        seen.insert(key);
    }
    Ok(seen.len())
}

pub fn parse_parquet_from_bytes(bytes: &[u8], mapping: CsvMapping) -> ParseResult<ParsedStdf> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let reader = SerializedFileReader::new(Bytes::from(bytes.to_vec())).map_err(ParseError::parquet_read)?;
    parse_from_reader(&reader, mapping)
}

#[cfg(feature = "native")]
pub fn parse_parquet_inner(path: String, mapping: CsvMapping) -> ParseResult<ParsedStdf> {
    with_path_reader!(&path, |reader| parse_from_reader(&reader, mapping))
}

fn parse_from_reader<R: FileReader>(reader: &R, mapping: CsvMapping) -> ParseResult<ParsedStdf> {
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
                    lo_spec: None,
                    hi_spec: None,
                    lo_limit_inclusive: None,
                    hi_limit_inclusive: None,
                },
            )
        })
        .collect();

    let row_iter = reader.get_row_iter(None).map_err(ParseError::parquet_read)?;
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
    // A null, or a blank text cell, is no value — as an empty CSV/JSON cell is —
    // not a value that failed to coerce.
    if is_blank(f) { return None; }
    if let Some(v) = field_to_f64(f) {
        return Some(v);
    }
    if field_kind(f) == "string" {
        *mismatches.entry(role_key.to_string()).or_insert(0) += 1;
    }
    None
}

/// A whole number from a numeric role, or `None` — never truncated or clamped.
/// 2.7, NaN and true/false are not bins, sites or coordinates; they are counted with the
/// role's other unusable values. STDF's ranges are applied later, for every flat
/// format alike (`flat_wafers::into_parsed`).
fn coerce_role_whole<T: TryFrom<i64>>(field: Option<&Field>, role_key: &str,
                                      mismatches: &mut HashMap<String, u32>) -> Option<T> {
    // true/false is not a bin, a site or a position: read as 1/0 it would put
    // every die at one of two coordinates, or in bin 1 or 0.
    if let Some(Field::Bool(_)) = field {
        *mismatches.entry(role_key.to_string()).or_insert(0) += 1;
        return None;
    }
    let v = coerce_role_f64(field, role_key, mismatches)?;
    let whole = (v.is_finite() && v.fract() == 0.0 && v.abs() < 9.0e15)
        .then(|| T::try_from(v as i64).ok())
        .flatten();
    if whole.is_none() {
        *mismatches.entry(role_key.to_string()).or_insert(0) += 1;
    }
    whole
}

fn mismatch_warnings(mismatches: &HashMap<String, u32>, test_defs: &HashMap<String, TestDef>) -> Vec<ParserWarning> {
    let mut warnings: Vec<ParserWarning> = mismatches
        .iter()
        .map(|(role, count)| {
            let label = test_defs.get(role).map(|d| d.name.as_str()).unwrap_or(role.as_str());
            value_not_numeric_warning(label, *count)
        })
        .collect();
    // Sorted by message so the order is deterministic regardless of HashMap
    // iteration order — the codes are all the same here, the labels are not.
    warnings.sort_by(|a, b| a.message.cmp(&b.message));
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
) -> ParseResult<ParsedStdf> {
    let idx = |name: &str| col_idx.get(name).copied();
    let opt_idx = |c: &Option<String>| c.as_deref().and_then(idx);

    let x_i = opt_idx(&mapping.x);
    let y_i = opt_idx(&mapping.y);
    let hbin_i = opt_idx(&mapping.hbin);
    let sbin_i = opt_idx(&mapping.sbin);
    let site_i = opt_idx(&mapping.site);
    let wafer_i = opt_idx(&mapping.wafer);
    let lot_i = opt_idx(&mapping.lot);
    // (test number, its string key for mismatch messages, column index).
    let test_i: Vec<(u32, String, usize)> = mapping.tests.iter()
        .filter_map(|t| idx(&t.col).map(|i| (t.test_number, t.test_number.to_string(), i))).collect();
    let meta_i: Vec<Option<usize>> = mapping.meta.iter().map(|c| idx(c)).collect();

    let mut mismatches: HashMap<String, u32> = HashMap::new();
    let mut rows: Vec<FlatRow> = Vec::new();

    for row_result in row_iter {
        let row = row_result.map_err(ParseError::parquet_read)?;
        let fields = row_fields(&row);
        let cell = |i: usize| fields.get(i).copied();
        let text = |i: Option<usize>| i.and_then(cell).map(field_to_string).unwrap_or_default();

        let mut tests: Vec<(u32, f64)> = Vec::with_capacity(test_i.len());
        for (t, key, i) in &test_i {
            if let Some(v) = coerce_role_f64(cell(*i), key, &mut mismatches) { tests.push((*t, v)); }
        }
        let hbin = coerce_role_whole::<i64>(hbin_i.and_then(cell), "hbin", &mut mismatches);
        let sbin = coerce_role_whole::<i64>(sbin_i.and_then(cell), "sbin", &mut mismatches);
        let site_num = coerce_role_whole::<i64>(site_i.and_then(cell), "site", &mut mismatches);
        // No x/y column mapped, or a cell that is not a whole number: the die is
        // kept, coordinate-less, rather than dropped or moved.
        let x = coerce_role_whole::<i64>(x_i.and_then(cell), "x", &mut mismatches);
        let y = coerce_role_whole::<i64>(y_i.and_then(cell), "y", &mut mismatches);

        rows.push(FlatRow {
            lot: text(lot_i),
            wafer: text(wafer_i),
            split_parts: split_parts(&mapping.split_by, |c| text(idx(c))),
            meta: meta_i.iter().map(|i| text(*i)).collect(),
            x, y, hbin, sbin, site_num, tests,
        });
    }

    let extra = mismatch_warnings(&mismatches, &test_defs);
    Ok(into_parsed(rows, mapping, false, test_defs, extra))
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
) -> ParseResult<ParsedStdf> {
    let name_col = mapping.testname_col.as_deref();
    let num_col = mapping.testnumber_col.as_deref();
    let val_col = mapping.testvalue_col.as_deref().unwrap();

    let mut long_fmt_test_numbers: HashMap<String, u32> = HashMap::new();
    let mut used_test_numbers: HashSet<u32> = mapping.tests.iter().map(|t| t.test_number).collect();
    let mut next_order: u32 = 0;
    let mut rows: Vec<FlatRow> = Vec::new();

    for row_result in row_iter {
        let row = row_result.map_err(ParseError::parquet_read)?;
        let mut cells: HashMap<String, String> = HashMap::new();
        for (name, field) in row.get_column_iter() {
            cells.insert(name.clone(), field_to_string(field));
        }
        let get = |c: &str| cells.get(c).cloned().unwrap_or_default();
        let opt = |c: &Option<String>| c.as_deref().map(get).unwrap_or_default();
        let mut out = FlatRow {
            lot: opt(&mapping.lot),
            wafer: opt(&mapping.wafer),
            split_parts: split_parts(&mapping.split_by, get),
            meta: mapping.meta.iter().map(|c| get(c)).collect(),
            x: opt(&mapping.x).parse().ok(),
            y: opt(&mapping.y).parse().ok(),
            hbin: opt(&mapping.hbin).parse().ok(),
            sbin: opt(&mapping.sbin).parse().ok(),
            site_num: opt(&mapping.site).trim().parse().ok(),
            tests: Vec::new(),
        };

        let test_name = name_col.map(get).unwrap_or_default();
        let test_val = get(val_col);
        // A row's own number, when the column is mapped and this row's value
        // parses — takes priority over the name as the test's real identity.
        let real_number: Option<u32> = num_col
            .map(get)
            .filter(|s| !s.is_empty())
            .and_then(|s| s.trim().parse::<u32>().ok());

        if !test_val.is_empty() && !(test_name.is_empty() && real_number.is_none()) {
            let identity_key = match real_number {
                Some(n) => format!("#{n}"),
                None => test_name.clone(),
            };
            let tnum = *long_fmt_test_numbers.entry(identity_key).or_insert_with(|| {
                let n = match real_number {
                    Some(n) => { used_test_numbers.insert(n); n }
                    None => crate::test_identity::stable_test_number(&test_name, &mut used_test_numbers),
                };
                let order = next_order;
                next_order += 1;
                let lo_limit = mapping.lo_limit_col.as_deref()
                    .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let hi_limit = mapping.hi_limit_col.as_deref()
                    .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let lo_spec = mapping.lo_spec_col.as_deref()
                    .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let hi_spec = mapping.hi_spec_col.as_deref()
                    .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).and_then(|s| s.parse::<f64>().ok());
                let units = mapping.units_col.as_deref()
                    .and_then(|c| cells.get(c)).filter(|s| !s.is_empty()).cloned();
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
            if let Ok(v) = test_val.parse::<f64>() { out.tests.push((tnum, v)); }
        }
        rows.push(out);
    }

    Ok(into_parsed(rows, mapping, true, test_defs, Vec::new()))
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
            lo_limit_col: None, hi_limit_col: None, lo_spec_col: None, hi_spec_col: None, units_col: None,
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

    /// Bins, sites and coordinates held as doubles are used only when they are
    /// whole numbers in range — never truncated (2.7 → 2) or wrapped (−1 → 0).
    #[test]
    fn double_bins_and_coordinates_are_never_truncated() {
        let schema = Arc::new(parse_message_type(
            "message schema { REQUIRED DOUBLE x; REQUIRED DOUBLE y; REQUIRED DOUBLE hbin; }",
        ).unwrap());
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut rg = writer.next_row_group().unwrap();
            for vals in [[0.0, 1.9, 2.0, 3.0], [0.0, 0.0, 0.0, f64::NAN], [1.0, 1.0, -1.0, 2.7]] {
                let mut col = rg.next_column().unwrap().unwrap();
                col.typed::<DoubleType>().write_batch(&vals, None, None).unwrap();
                col.close().unwrap();
            }
            rg.close().unwrap();
            writer.close().unwrap();
        }
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".into());
        let r = parse_parquet_from_bytes(&buf, m).unwrap();
        let dies = &r.wafers[0].results;
        assert_eq!((dies[0].x, dies[0].hbin), (Some(0), Some(1)), "whole numbers are read");
        assert_eq!(dies[1].x, None, "x = 1.9 is not a position");
        assert_eq!(dies[2].hbin, None, "−1 is not a bin");
        assert_eq!((dies[3].y, dies[3].hbin), (None, None), "NaN and 2.7 are not read");
        assert!(r.warnings.iter().any(|w| w.code == "values-not-numeric"));
    }

    /// A true/false column mapped to a bin or position is a type mismatch, not bin 1/0.
    #[test]
    fn bool_bins_and_coordinates_are_mismatches() {
        use parquet::data_type::BoolType;
        let schema = Arc::new(parse_message_type(
            "message schema { REQUIRED INT32 x; REQUIRED INT32 y; REQUIRED BOOLEAN hbin; }",
        ).unwrap());
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut rg = writer.next_row_group().unwrap();
            for vals in [[0, 1], [0, 0]] {
                let mut col = rg.next_column().unwrap().unwrap();
                col.typed::<Int32Type>().write_batch(&vals, None, None).unwrap();
                col.close().unwrap();
            }
            let mut col = rg.next_column().unwrap().unwrap();
            col.typed::<BoolType>().write_batch(&[true, false], None, None).unwrap();
            col.close().unwrap();
            rg.close().unwrap();
            writer.close().unwrap();
        }
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".into());
        let r = parse_parquet_from_bytes(&buf, m).unwrap();
        assert!(r.wafers[0].results.iter().all(|d| d.hbin.is_none() && d.x.is_some()));
        assert!(r.warnings.iter().any(|w| w.code == "values-not-numeric"));
    }

    /// A null or blank cell is no value — the die keeps its other fields and has
    /// no position — never a value that failed to coerce.
    #[test]
    fn null_and_blank_cells_are_missing_not_unusable() {
        use parquet::data_type::Int32Type;
        let schema = Arc::new(parse_message_type(
            "message schema { OPTIONAL INT32 x; OPTIONAL INT32 y; REQUIRED INT32 hbin; OPTIONAL BYTE_ARRAY site (UTF8); }",
        ).unwrap());
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut rg = writer.next_row_group().unwrap();
            // Rows: (0,0) positioned; then two dies with null x/y.
            for _ in 0..2 {
                let mut col = rg.next_column().unwrap().unwrap();
                col.typed::<Int32Type>().write_batch(&[0], Some(&[1, 0, 0]), None).unwrap();
                col.close().unwrap();
            }
            let mut col = rg.next_column().unwrap().unwrap();
            col.typed::<Int32Type>().write_batch(&[1, 2, 1], None, None).unwrap();
            col.close().unwrap();
            let mut col = rg.next_column().unwrap().unwrap();
            let sites = [ByteArray::from("3"), ByteArray::from(" "), ByteArray::from("")];
            col.typed::<ByteArrayType>().write_batch(&sites, Some(&[1, 1, 1]), None).unwrap();
            col.close().unwrap();
            rg.close().unwrap();
            writer.close().unwrap();
        }
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".into());
        m.site = Some("site".into());
        let r = parse_parquet_from_bytes(&buf, m).unwrap();
        let dies = &r.wafers[0].results;
        assert_eq!(dies.len(), 3);
        assert_eq!((dies[0].x, dies[0].site_num), (Some(0), Some(3)));
        assert!(dies[1..].iter().all(|d| d.x.is_none() && d.y.is_none() && d.site_num.is_none()));
        assert!(!r.warnings.iter().any(|w| w.code == "values-not-numeric"), "{:?}", r.warnings);
        assert!(r.warnings.iter().any(|w| w.code == "unpositioned-dies"));
    }

    /// STDF's ranges apply to Parquet as to every other format: a whole number
    /// outside them is missing, and reported under the same codes.
    #[test]
    fn values_outside_stdf_ranges_are_missing_and_reported() {
        let schema = Arc::new(parse_message_type(
            "message schema { REQUIRED DOUBLE x; REQUIRED DOUBLE y; REQUIRED DOUBLE hbin; REQUIRED DOUBLE site; REQUIRED DOUBLE t1; }",
        ).unwrap());
        let props = Arc::new(WriterProperties::builder().build());
        let mut buf = Vec::new();
        {
            let mut writer = SerializedFileWriter::new(&mut buf, schema, props).unwrap();
            let mut rg = writer.next_row_group().unwrap();
            for vals in [[0.0, 40000.0, 1.0], [0.0, 0.0, 0.0], [40000.0, 2.0, 1.0], [300.0, 1.0, 255.0], [f64::INFINITY, 1.0, 2.0]] {
                let mut col = rg.next_column().unwrap().unwrap();
                col.typed::<DoubleType>().write_batch(&vals, None, None).unwrap();
                col.close().unwrap();
            }
            rg.close().unwrap();
            writer.close().unwrap();
        }
        let mut m = basic_mapping("x", "y");
        m.hbin = Some("hbin".into());
        m.site = Some("site".into());
        m.tests = vec![CsvTestCol { col: "t1".to_string(), test_number: 1, name: "T1".to_string() }];
        let r = parse_parquet_from_bytes(&buf, m).unwrap();
        let dies = &r.wafers[0].results;
        assert_eq!((dies[0].x, dies[0].hbin, dies[0].site_num), (Some(0), None, None), "bin 40000 and site 300 are missing");
        assert!(dies[0].test_values.is_empty(), "an infinite value is left out");
        assert_eq!((dies[1].x, dies[1].y, dies[1].hbin), (None, None, Some(2)), "x 40000: no position, in neither axis");
        assert_eq!((dies[2].x, dies[2].hbin, dies[2].site_num), (Some(1), Some(1), Some(255)), "legal values kept");
        for code in ["bin-invalid", "coordinate-invalid", "site-invalid", "result-unusable"] {
            assert!(r.warnings.iter().any(|w| w.code == code), "no {code} in {:?}", r.warnings);
        }
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
    fn distinct_count_counts_combinations_of_the_named_columns() {
        // Fixture: three rows, all wafer W1, hbins 1, 1, 2.
        let bytes = write_fixture(parquet::basic::Compression::SNAPPY);
        let count = |cols: &[&str]| parquet_distinct_count_from_bytes(
            &bytes, &cols.iter().map(|c| c.to_string()).collect::<Vec<_>>());
        assert_eq!(count(&["wafer"]), Ok(1));
        // Pairs, whatever order they are asked in: (W1,1) and (W1,2).
        assert_eq!(count(&["wafer", "hbin"]), Ok(2));
        assert_eq!(count(&["hbin", "wafer"]), Ok(2));
        assert!(count(&["no_such_column"]).is_err());
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
        assert_eq!(result.warnings[0].code, "values-not-numeric");
        assert!(result.warnings[0].message.contains("Bogus"));
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
        // rows have null x/y), W03 fully coordinate-less.
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
        // Its missing coordinates are real Parquet nulls: no value, not a bad one.
        assert!(!result.warnings.iter().any(|w| w.code == "values-not-numeric"), "{:?}", result.warnings);
    }
    /// Parquet's counterpart to `bench_parse_csv`/`bench_parse_json`, on the same
    /// logical data (10 wafers x 5000 dies x 50 tests) so the flat formats are
    /// comparable per die rather than per MB — Parquet is columnar and compressed,
    /// so its file is a fraction of the CSV's for identical content and MB/s
    /// flatters it.
    ///
    /// Fixture: `python3 scripts/generate_parquet_bench.py`.
    ///
    /// Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench --release -- --nocapture bench_parse_parquet
    #[cfg(feature = "bench")]
    #[test]
    fn bench_parse_parquet() {
        let path = crate::bench_fixtures::fixture("bench.parquet");
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => { eprintln!("SKIP: {} not found — run scripts/generate_parquet_bench.py", path.display()); return; }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;
        let mapping = CsvMapping {
            x: Some("x".into()), y: Some("y".into()),
            hbin: Some("hbin".into()), sbin: Some("sbin".into()),
            wafer: Some("wafer".into()), lot: Some("lot".into()), site: None,
            tests: (1..=50).map(|i| crate::parse_csv::CsvTestCol {
                col: format!("T{i}"), test_number: 1000 + i, name: format!("T{i}"),
            }).collect(),
            meta: vec![], split_by: vec![],
            testname_col: None, testnumber_col: None, testvalue_col: None,
            lo_limit_col: None, hi_limit_col: None, lo_spec_col: None, hi_spec_col: None, units_col: None,
            pass_bins: vec![1],
        };

        let _ = parse_parquet_from_bytes(&bytes, mapping.clone()).unwrap(); // warm
        let t = std::time::Instant::now();
        let result = parse_parquet_from_bytes(&bytes, mapping).unwrap();
        let ms = t.elapsed().as_millis();
        let dies: usize = result.wafers.iter().map(|w| w.results.len()).sum();
        println!(
            "\n=== bench_parse_parquet ({file_mb:.1} MB) ===\n\
             wafers: {}\ndies:   {dies}\ntests:  {}\ntotal:  {ms} ms\nthroughput: {:.0} MB/s",
            result.wafers.len(), result.test_defs.len(),
            file_mb / (ms as f64 / 1000.0).max(0.001),
        );
    }

}

