use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub test_defs: HashMap<String, TestDef>,
    pub die_count: u32,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStdf {
    pub meta: LotMeta,
    pub wafers: Vec<WaferData>,
    pub test_defs: HashMap<String, TestDef>,
    pub sites: Vec<SiteInfo>,
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
