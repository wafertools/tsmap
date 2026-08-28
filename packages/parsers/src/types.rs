use serde::Serialize;
use std::collections::HashMap;

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
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub test_values: HashMap<String, f64>,
    /// Recorded per-test pass/fail verdicts (true = pass), keyed like
    /// `test_values`. Functional (FTR) outcomes live here ONLY — they have no
    /// measured value; parametric (PTR) tests get an entry when the tester
    /// recorded a valid pass/fail indication (STDF TEST_FLG bit 6 clear).
    /// Empty map serialises to nothing, so parametric-only files are unchanged.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub test_pass: HashMap<String, bool>,
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

/// Shared across every parser: one warning per wafer that has at least one
/// die with no reported X/Y position, naming how many. Kept as a single
/// implementation so the message never drifts between formats — call this
/// once per wafer after all its dies are collected.
pub fn position_warnings(wafers: &[WaferData]) -> Vec<String> {
    wafers.iter().filter_map(|w| {
        let total = w.results.len();
        let unpositioned = w.results.iter().filter(|d| d.x.is_none()).count();
        if unpositioned == 0 {
            None
        } else {
            Some(format!(
                "Wafer {}: {unpositioned} of {total} die(s) have no reported X/Y position",
                w.wafer_id,
            ))
        }
    }).collect()
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
    /// Non-fatal advisories surfaced to the host (e.g. fabricated soft bins).
    /// Empty array is omitted from the serialised output.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
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
        die.test_pass.insert("2001".to_string(), true);
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
