use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub test_defs: HashMap<String, TestDef>,
    pub die_count: u32,
}

/// Fast, MIR/SDR/WIR/WRR-only scan result for the file-filter table — deliberately
/// NOT a full parse (no PTR/FTR/PIR/PRR walk), so this stays cheap on a large batch
/// of files picked at once. `lot_meta` mirrors the same lot-level fields a full
/// parse would produce (from `mir_fields`); `earliest_start`/`latest_finish` and
/// `wafer_count` are aggregated across every WIR/WRR pair seen, since a file-filter
/// row is one row per FILE, not per wafer.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub lot_meta: LotMeta,
    pub wafer_count: u32,
    /// Earliest WIR START_T seen. `None` if the file has no WIR records (e.g.
    /// a single-wafer STDF with no wafer-level records at all).
    ///
    /// Normally fixed-width ISO 8601 — STDF converts from its epoch field via
    /// `epoch_to_iso`, ATDF from its `HH:MM:SS DD-MMM-YYYY` text via
    /// `atdf_time_to_iso` — which is what makes "earliest" a plain string
    /// compare. An ATDF value in some other convention passes through
    /// unrecognised rather than being dropped, so this is not *guaranteed*
    /// ISO; treat it as display text unless you have parsed it.
    pub earliest_start: Option<String>,
    /// Latest WRR FINISH_T seen, same format and caveat as `earliest_start`.
    /// `None` if no wafer completed (no WRR seen) — a still-running or
    /// truncated file.
    pub latest_finish: Option<String>,
    /// Total distinct site numbers across every SDR seen.
    pub site_count: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DieResult {
    /// Die grid X position. `None` (together with `y`) means this die has no
    /// reported spatial position at all — it still carries real measured
    /// data and counts toward every non-spatial stat downstream, but is
    /// never placed on a wafer map. A die is either fully positioned (both
    /// `x` and `y` `Some`) or fully unpositioned (both `None`) — never half;
    /// see wmap's `buildWaferMap`, which rejects that state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// Die grid Y position. See `x`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    /// Per-wafer ordinal (PRR/row encounter order), populated only when `x`/`y`
    /// are both `None` — gives the frontend/wmap a stable identity to key an
    /// unpositioned die by (`unpositioned_<die_index>`) without relying on
    /// array position surviving filters/sorts downstream.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub die_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hbin: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sbin: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_num: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_id: Option<u32>,
    /// Measured values, keyed by test number as a string.
    ///
    /// `Arc<str>` rather than `String` because the key is the same handful of
    /// interned strings repeated for every die: a 51-test, 266k-die lot inserts
    /// 13.6M of them, and as `String` each insert was a fresh malloc + memcpy of
    /// a key the parser already had. Cloning an `Arc<str>` is a refcount bump, so
    /// building this map got ~45% cheaper (it was 62% of a large STDF parse).
    ///
    /// It serialises exactly as a `String` key does — `{"1050":0.42}` — and
    /// `Arc<str>: Borrow<str>`, so `map["1050"]` and `map.get("1050")` still work.
    /// An integer key would be faster still, and is not an option:
    /// `serde_wasm_bindgen` rejects non-string map keys outright ("Map key is not
    /// a string and cannot be an object key") and would panic inside the WASM
    /// module, aborting it with no recovery.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub test_values: HashMap<Arc<str>, f64>,
    /// Recorded per-test pass/fail verdicts (true = pass), keyed like
    /// `test_values`. Functional (FTR) outcomes live here ONLY — they have no
    /// measured value; parametric (PTR) tests get an entry when the tester
    /// recorded a valid pass/fail indication (STDF TEST_FLG bit 6 clear).
    /// Empty map serialises to nothing, so parametric-only files are unchanged.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub test_pass: HashMap<Arc<str>, bool>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TestDef {
    pub name: String,
    pub test_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lo_limit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hi_limit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub units: Option<String>,
    /// Position to display this test in, independent of its (possibly
    /// hashed, see `test_identity`) number — CSV/JSON wide format sets this to
    /// the column's position, long format to first-encounter-in-file order.
    /// `None` for STDF/ATDF, where the real test number IS a meaningful order
    /// and the frontend falls back to sorting by number when this is absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaferData {
    pub wafer_id: String,
    pub results: Vec<DieResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fail_count: Option<u32>,
    /// Per-wafer metadata: every non-empty field from this wafer's records
    /// (STDF/ATDF WIR/WRR). Empty for formats without wafer-level records.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<MetaField>,
}

/// A non-fatal advisory from a parse, in the shape a host can act on: a stable
/// `code` to branch on, prose to display, and how much it matters.
///
/// `warnings` used to be `Vec<String>`. A host that wanted to treat "we
/// fabricated soft bins" differently from "this file holds two lots" had no
/// option but to match on the prose, which meant rewording a message silently
/// broke it — so in practice nothing branched and every advisory was logged
/// identically, including the ones saying a number on screen is not what the
/// file says. wmap made the same change for the same reason in its 0.22.0
/// (`stats.warnings`: `string[]` -> `WaferWarning[]`); this is that shape.
///
/// **Branch on `code`, never on `message`.** Codes are API and change only with
/// a major version; messages are prose and may be reworded at any time.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParserWarning {
    /// Stable kebab-case identifier — see the constructors below for the full set.
    pub code: &'static str,
    /// Human-readable prose. Display this; do not parse it.
    pub message: String,
    /// `"error"` means a number or a plot built from this parse can mislead,
    /// because data was dropped or a value was substituted. `"warning"` means
    /// the parse made a documented interpretation the caller may want to change,
    /// but nothing was altered or lost. Nothing here is fatal: a `ParsedStdf`
    /// carrying warnings is still a successful parse.
    pub severity: &'static str,
}

impl ParserWarning {
    fn warning(code: &'static str, message: String) -> Self {
        Self { code, message, severity: "warning" }
    }
    fn error(code: &'static str, message: String) -> Self {
        Self { code, message, severity: "error" }
    }
}

/// Interner for `DieResult::test_values` / `test_pass` keys.
///
/// The keys of those maps are the same handful of strings repeated once per die:
/// a 51-test, 266k-die lot needs 13.6M of them. Building a fresh `String` for
/// each was a malloc and a memcpy of a string the parser already had, and it was
/// the single largest cost in a large parse. Handing out `Arc<str>` makes the
/// per-die clone a refcount bump instead.
///
/// Two lookups because the parsers hold a test's identity in two forms — STDF and
/// the flat formats have a `u32`, ATDF has the raw text field — and converting
/// one to the other on the hot path would reintroduce the allocation this exists
/// to remove. One interner either way, so the same test cannot end up with two
/// separate key allocations in one parse.
#[derive(Default)]
pub struct TestKeys {
    by_text: HashMap<String, Arc<str>>,
    by_num: HashMap<u32, Arc<str>>,
}

impl TestKeys {
    /// Key for a test number already in its text form (ATDF's raw field), kept
    /// verbatim so it matches the `test_defs` key built from the same field.
    pub fn text(&mut self, test_num: &str) -> Arc<str> {
        if let Some(k) = self.by_text.get(test_num) {
            return Arc::clone(k);
        }
        let k: Arc<str> = Arc::from(test_num);
        self.by_text.insert(test_num.to_string(), Arc::clone(&k));
        k
    }

    /// Key for a numeric test number (STDF, CSV/JSON/Parquet).
    pub fn num(&mut self, test_num: u32) -> Arc<str> {
        if let Some(k) = self.by_num.get(&test_num) {
            return Arc::clone(k);
        }
        let k: Arc<str> = Arc::from(test_num.to_string().as_str());
        self.by_num.insert(test_num, Arc::clone(&k));
        k
    }
}

/// Shared across every parser: one warning per wafer that has at least one
/// die with no reported X/Y position, naming how many. Kept as a single
/// implementation so the message never drifts between formats — call this
/// once per wafer after all its dies are collected.
///
/// `error`, not `warning`: these dies hold real measured data but cannot be
/// placed, so a die count or yield taken from the wafer map is not the die count
/// or yield of the file.
pub fn position_warnings(wafers: &[WaferData]) -> Vec<ParserWarning> {
    wafers.iter().filter_map(|w| {
        let total = w.results.len();
        let unpositioned = w.results.iter().filter(|d| d.x.is_none()).count();
        if unpositioned == 0 {
            None
        } else {
            Some(ParserWarning::error("unpositioned-dies", format!(
                "Wafer {}: {unpositioned} of {total} die(s) have no reported X/Y position",
                w.wafer_id,
            )))
        }
    }).collect()
}

/// The soft-bin advisory for dies whose soft bin was the sentinel 65535 ("no
/// soft bin") and had the hard bin mirrored in instead. Empty when nothing was
/// fabricated, so the field stays out of the serialised output.
///
/// One implementation for both formats. It was two — identical prose in
/// `parse_stdf.rs` and `parse_atdf.rs`, each with its own copy of the sentinel
/// rule — which is precisely how a code and a message drift apart between two
/// formats that are meant to be indistinguishable to a caller.
///
/// `error`: a soft-bin map drawn from this shows numbers the file never stated.
pub fn soft_bin_warnings(fabricated: usize) -> Vec<ParserWarning> {
    if fabricated == 0 {
        vec![]
    } else {
        vec![ParserWarning::error("soft-bin-mirrored", format!(
            "{fabricated} die(s) had no soft bin (sentinel 65535) — mirrored the hard bin"
        ))]
    }
}

/// A column mapped to a numeric role held values that would not coerce, and
/// those dies have no value for it. `error`: data was dropped.
pub fn value_not_numeric_warning(label: &str, count: u32) -> ParserWarning {
    ParserWarning::error("values-not-numeric", format!(
        "Column mapped to '{label}' contained {count} non-numeric value(s) that were skipped"
    ))
}

/// Several dies share a position with no mapped column telling the passes
/// apart, so they were read as retests. `warning`: an interpretation the caller
/// can change by mapping the column that separates them.
pub fn retests_assumed_warning(named: &str, dies: usize) -> ParserWarning {
    ParserWarning::warning("retests-assumed", format!(
        "{named}: {dies} die position(s) were tested more than once and no mapped column          separates the passes, so they are treated as retests. If they are separate test          passes (e.g. two temperatures), map the column that tells them apart as metadata."
    ))
}

/// A wafer was split into one wafer per value of a mapped column. `warning`:
/// informational, and what the caller asked for by mapping that column.
pub fn wafer_split_warning(named: &str, column: &str, values: &[String]) -> ParserWarning {
    ParserWarning::warning("wafer-split-by-column", format!(
        "{named} was tested in {} passes, told apart by column '{column}' ({}) — each pass is          shown as its own wafer.",
        values.len(), values.join(", ")
    ))
}

/// A column mapped as metadata varies within a single wafer, so it describes
/// dies rather than wafers and was dropped from the wafer/lot properties.
/// `warning`: nothing measured was lost.
pub fn column_varies_warning(column: &str, example: &str) -> ParserWarning {
    ParserWarning::warning("column-varies-within-wafer", format!(
        "Column '{column}' has more than one value within a wafer (e.g. {example}), so it is not          shown as a wafer or lot property."
    ))
}

/// The file holds more than one lot record (MIR), so each wafer is labelled
/// with the lot it was tested under. `warning`: handled correctly, but worth
/// knowing before treating the file as one lot.
pub fn multiple_lot_records_warning(count: usize) -> ParserWarning {
    ParserWarning::warning("multiple-lot-records", format!(
        "This file holds {count} lot records (MIR), so each wafer is labelled with the lot it was          tested under. Bin names and pass bins from the file's HBR/SBR records apply to all of them."
    ))
}

/// One metadata field as a raw key/value pair. `key` is the source field name
/// (e.g. STDF `lotId`, `tstTemp`, `startT`); the host (tsmap) owns friendly
/// labels and which fields to surface — so adding/relabelling a facet never
/// requires republishing this crate. Timestamps are emitted as ISO 8601 strings.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaField {
    pub key: String,
    pub value: String,
}

/// Lot-level metadata: every non-empty field from the source's lot record
/// (STDF/ATDF MIR), in record order. Generic so new fields flow through with no
/// type or crate change. Shared across all wafers in the file.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LotMeta {
    pub fields: Vec<MetaField>,
}

impl LotMeta {
    /// Push a field if its value is present and non-empty (after trimming).
    pub fn push(&mut self, key: &str, value: Option<String>) {
        push_field(&mut self.fields, key, value);
    }

    /// Look up a field value by key (first match), or None.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.fields.iter().find(|f| f.key == key).map(|f| f.value.as_str())
    }
}

/// Split per-wafer metadata into the fields EVERY wafer carries with the same
/// value — lot/file-level — and what remains on each wafer. The one rule for
/// "is this a lot property or a wafer property", shared by the flat-file
/// assembler and by STDF/ATDF files holding more than one lot record. With one
/// wafer, everything is common, which keeps single-lot output unchanged.
pub fn split_common_fields(per_wafer: Vec<Vec<MetaField>>) -> (Vec<MetaField>, Vec<Vec<MetaField>>) {
    let common: Vec<MetaField> = match per_wafer.first() {
        None => return (Vec::new(), per_wafer),
        Some(first) => first.iter()
            .filter(|f| per_wafer.iter().all(|w| w.iter().any(|g| g.key == f.key && g.value == f.value)))
            .cloned()
            .collect(),
    };
    let residual = per_wafer.into_iter()
        .map(|w| w.into_iter().filter(|g| !common.iter().any(|c| c.key == g.key)).collect())
        .collect();
    (common, residual)
}

/// Lot records (STDF/ATDF MIR) in a file, and which one each wafer was tested
/// under. The spec allows one per file, but concatenated streams — some
/// systems' way of returning a multi-lot selection as one response — carry
/// several. Assigning each MIR over the file's metadata, as the parsers did,
/// labelled every wafer with the LAST lot. File-level extras (WCR geometry)
/// are kept apart so they survive regardless of where they sit relative to a MIR.
#[derive(Default)]
pub struct LotRecords {
    current: Vec<MetaField>,
    count: usize,
    per_wafer: Vec<Vec<MetaField>>,
    file_fields: Vec<MetaField>,
}

impl LotRecords {
    /// A MIR: the lot record for every wafer that follows it.
    pub fn set_lot(&mut self, fields: Vec<MetaField>) {
        self.current = fields;
        self.count += 1;
    }

    /// File-level fields that are not lot identity (WCR geometry, the V4-2007 VUR).
    pub fn extend_file(&mut self, fields: Vec<MetaField>) {
        self.file_fields.extend(fields);
    }

    /// Push a wafer and record the lot it was tested under — the only way
    /// wafers may be added. This was once a separate `wafer_pushed()` call to
    /// pair with each `wafers.push`; three of the seven push sites forgot it,
    /// and any mismatch makes `finish` fall back to the last lot for every
    /// wafer. One call cannot drift out of step.
    pub fn push_wafer(&mut self, wafers: &mut Vec<WaferData>, wafer: WaferData) {
        wafers.push(wafer);
        self.per_wafer.push(self.current.clone());
    }

    /// The file's `LotMeta`. With one lot record — the normal case — this is
    /// exactly what the parsers produced before (MIR fields, then WCR). With
    /// several, fields every wafer shares stay file-level and the rest move
    /// onto each wafer, ahead of its own WIR/WRR fields.
    pub fn finish(self, wafers: &mut [WaferData], warnings: &mut Vec<ParserWarning>) -> LotMeta {
        let mut fields;
        if self.count <= 1 || self.per_wafer.len() != wafers.len() {
            fields = self.current;
        } else {
            let (common, residual) = split_common_fields(self.per_wafer);
            if residual.iter().any(|r| !r.is_empty()) {
                warnings.push(multiple_lot_records_warning(self.count));
            }
            for (w, mut r) in wafers.iter_mut().zip(residual) {
                r.extend(std::mem::take(&mut w.fields));
                w.fields = r;
            }
            fields = common;
        }
        fields.extend(self.file_fields);
        LotMeta { fields }
    }
}

/// Shared helper: append a non-empty field. Used for both lot- and wafer-level.
pub fn push_field(fields: &mut Vec<MetaField>, key: &str, value: Option<String>) {
    if let Some(v) = value {
        let t = v.trim();
        if !t.is_empty() {
            fields.push(MetaField { key: key.to_string(), value: t.to_string() });
        }
    }
}

/// Format an STDF U4 timestamp (seconds since the Unix epoch, UTC) as an ISO
/// 8601 string `YYYY-MM-DDTHH:MM:SSZ`. The host truncates to date-only where it
/// groups by date. Returns None for the zero/sentinel value. Pure (no chrono):
/// a civil-date conversion via the days-from-epoch algorithm.
pub fn epoch_to_iso(secs: u32) -> Option<String> {
    if secs == 0 || secs == u32::MAX {
        return None;
    }
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Howard Hinnant's civil_from_days (epoch = 1970-01-01).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    Some(format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, m, d, hh, mm, ss))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteInfo {
    pub head_num: u32,
    pub site_num: u32,
}

/// One bin's human-readable name, from an STDF/ATDF HBR (hard bin) or SBR
/// (soft bin) record — hard and soft bins occupy independent number spaces
/// (STDF V4), so `ParsedStdf` carries separate `hbin_defs`/`sbin_defs`, never
/// mixed. Matches wmap's own `BinDef` shape (`{ bin, name }` — `color` has no
/// STDF/ATDF source, left for the host to set if it wants one).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BinDef {
    pub bin: u32,
    pub name: String,
}

/// Sorts a `bin → name` accumulator (built identically by the STDF and ATDF
/// parsers from HBR/SBR) into the `Vec<BinDef>` `ParsedStdf` carries — sorted
/// by bin number for deterministic output (a `HashMap`'s iteration order
/// isn't). Shared here rather than duplicated per parser since it has no
/// format-specific logic.
pub fn finish_bin_defs(names: HashMap<u32, String>) -> Vec<BinDef> {
    let mut defs: Vec<BinDef> = names.into_iter().map(|(bin, name)| BinDef { bin, name }).collect();
    defs.sort_by_key(|d| d.bin);
    defs
}

/// A single decoded HBR/SBR record — bin number, optional name (blank/absent
/// is `None`, never an empty string), and whether `BIN_PF` was `'P'`. Shared
/// shape for both the STDF (binary) and ATDF (text field-map) decoders, which
/// keep their own decode functions since the extraction mechanics genuinely
/// differ, but produce this same triple.
pub struct BinRecord {
    pub bin: u32,
    pub name: Option<String>,
    pub pass: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStdf {
    pub meta: LotMeta,
    pub wafers: Vec<WaferData>,
    pub test_defs: HashMap<String, TestDef>,
    pub sites: Vec<SiteInfo>,
    /// Hard/soft bin names from HBR/SBR, one entry per distinct bin number
    /// that had a non-empty name (a bin with no recorded name is omitted,
    /// not emitted with an empty string — the host falls back to its own
    /// "Bin N" default). Empty array is omitted from the serialised output.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hbin_defs: Vec<BinDef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sbin_defs: Vec<BinDef>,
    /// Hard bin numbers HBR marks Pass (`HBIN_PF == 'P'`) — feeds wmap's
    /// `waferConfig.passBins`, which otherwise defaults to `[1]` regardless
    /// of whether bin 1 is actually this file's pass bin. Empty when no HBR
    /// record had a usable Pass flag; the host leaves wmap's own default in
    /// place rather than passing an empty (meaning "nothing passes") array.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pass_hbins: Vec<u32>,
    /// Non-fatal advisories surfaced to the host — see `ParserWarning`. Branch on
    /// `code`, display `message`. Empty array is omitted from the serialised output.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<ParserWarning>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_to_iso_converts_known_timestamps() {
        // 2009-02-13T23:31:30Z = 1234567890
        assert_eq!(epoch_to_iso(1_234_567_890).as_deref(), Some("2009-02-13T23:31:30Z"));
        // Unix epoch
        assert_eq!(epoch_to_iso(0), None); // 0 treated as "unset"
        assert_eq!(epoch_to_iso(1).as_deref(), Some("1970-01-01T00:00:01Z"));
        assert_eq!(epoch_to_iso(u32::MAX), None); // sentinel
    }

    #[test]
    fn die_result_serialises_test_pass_camel_case_and_omits_empty() {
        let mut die = DieResult {
            x: Some(1), y: Some(2), die_index: None, hbin: Some(1), sbin: None, site_num: None, part_id: None,
            test_values: HashMap::new(), test_pass: HashMap::new(),
        };
        let json = serde_json::to_string(&die).unwrap();
        assert!(!json.contains("testPass"), "empty map must serialise to nothing: {json}");
        die.test_pass.insert(Arc::from("2001"), true);
        let json = serde_json::to_string(&die).unwrap();
        assert!(json.contains("\"testPass\":{\"2001\":true}"), "camelCase key expected: {json}");
    }

    #[test]
    fn die_result_omits_x_y_when_unpositioned_and_serialises_die_index() {
        let die = DieResult {
            x: None, y: None, die_index: Some(3), hbin: Some(1), sbin: None, site_num: None, part_id: None,
            test_values: HashMap::new(), test_pass: HashMap::new(),
        };
        let json = serde_json::to_string(&die).unwrap();
        assert!(!json.contains("\"x\""), "unpositioned die must omit x: {json}");
        assert!(!json.contains("\"y\""), "unpositioned die must omit y: {json}");
        assert!(json.contains("\"dieIndex\":3"), "die_index expected: {json}");
    }

    /// The full warning surface, in one place. A host branches on `code`, so a
    /// code is API: renaming one silently breaks every caller that handled it,
    /// and there is no compiler error anywhere to catch that. This test is the
    /// list — changing it is the deliberate act of changing the API.
    #[test]
    fn every_warning_code_and_severity_is_as_documented() {
        let wafer = |id: &str, positioned: bool| WaferData {
            wafer_id: id.to_string(),
            results: vec![DieResult {
                x: if positioned { Some(1) } else { None },
                y: if positioned { Some(1) } else { None },
                die_index: if positioned { None } else { Some(0) },
                hbin: Some(1), sbin: None, site_num: None, part_id: None,
                test_values: HashMap::new(), test_pass: HashMap::new(),
            }],
            part_count: None, good_count: None, fail_count: None, fields: vec![],
        };

        let all: Vec<ParserWarning> = vec![
            position_warnings(&[wafer("W01", false)]).remove(0),
            soft_bin_warnings(3).remove(0),
            value_not_numeric_warning("Vdd", 7),
            retests_assumed_warning("Wafer W01", 4),
            wafer_split_warning("Wafer W01", "temp", &["25".into(), "85".into()]),
            column_varies_warning("stamp", "12:00"),
            multiple_lot_records_warning(2),
        ];

        // `error` is reserved for "a number or a plot built from this can
        // mislead, because data was dropped or a value was substituted".
        let expected = [
            ("unpositioned-dies",           "error"),
            ("soft-bin-mirrored",           "error"),
            ("values-not-numeric",          "error"),
            ("retests-assumed",             "warning"),
            ("wafer-split-by-column",       "warning"),
            ("column-varies-within-wafer",  "warning"),
            ("multiple-lot-records",        "warning"),
        ];
        assert_eq!(all.len(), expected.len(), "a warning kind was added without extending this test");
        for (w, (code, severity)) in all.iter().zip(expected) {
            assert_eq!(w.code, code, "warning code changed — this is an API break: {w:?}");
            assert_eq!(w.severity, severity, "severity changed for {code}");
            assert!(!w.message.is_empty(), "{code} has no message");
            assert!(w.severity == "error" || w.severity == "warning", "{code}: unknown severity");
        }

        // Codes are kebab-case and distinct — a duplicate would make two
        // different situations indistinguishable to a host that branches.
        let codes: Vec<&str> = all.iter().map(|w| w.code).collect();
        let mut unique = codes.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), codes.len(), "duplicate warning code: {codes:?}");
        for c in codes {
            assert!(c.chars().all(|ch| ch.is_ascii_lowercase() || ch == '-'), "not kebab-case: {c}");
        }
    }

    #[test]
    fn soft_bin_warning_is_one_implementation_for_both_formats() {
        // It was two — the same prose duplicated in parse_stdf.rs and
        // parse_atdf.rs. A caller cannot tell STDF from ATDF by design, so the
        // advisory for an identical situation must be identical, and the only
        // way to guarantee that is for there to be one of it.
        assert!(soft_bin_warnings(0).is_empty(), "nothing fabricated means no warning at all");
        let w = soft_bin_warnings(5);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].code, "soft-bin-mirrored");
        assert!(w[0].message.contains('5'), "the count belongs in the message: {}", w[0].message);
    }

    #[test]
    fn warning_serialises_as_code_message_severity() {
        let json = serde_json::to_string(&soft_bin_warnings(1)[0]).unwrap();
        assert!(json.contains("\"code\":\"soft-bin-mirrored\""), "{json}");
        assert!(json.contains("\"severity\":\"error\""), "{json}");
        assert!(json.contains("\"message\":"), "{json}");
    }

    #[test]
    fn lot_meta_push_skips_empty_and_get_finds() {
        let mut m = LotMeta::default();
        m.push("lotId", Some("LOT-1".into()));
        m.push("partType", Some("  ".into())); // whitespace → skipped
        m.push("nodeName", None);              // none → skipped
        assert_eq!(m.fields.len(), 1);
        assert_eq!(m.get("lotId"), Some("LOT-1"));
        assert_eq!(m.get("partType"), None);
    }
}
