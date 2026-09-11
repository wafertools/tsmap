use std::collections::HashMap;
use crate::types::*;

// ── ATDF field orders ─────────────────────────────────────────────────────────
// Taken from the ATDF specification (Teradyne, V5.00.00_flx), each checked
// against the spec's own sample record — see packages/parsers/SPEC_CONFORMANCE.md.
// ATDF has its OWN field order per record; it is NOT the STDF binary order
// (MIR, WRR and WCR all differ). Never derive a layout here from the STDF table:
// that is how MIR, WRR and WCR were all wrong until 2026-09-11.

// Spec sample: MIR:A3002B|80386|80386HOT|akbar|J971|8:14:59 23-JUL-1992|
//              8:23:02 23-JUL-1992|Sandy|P|1|2B|HOT|N|3.1.2|IG900|2.4|||300|100|…
const MIR: &[&str] = &[
    "LOT_ID","PART_TYP","JOB_NAM","NODE_NAM","TSTR_TYP","SETUP_T","START_T",
    "OPER_NAM","MODE_COD","STAT_NUM","SBLOT_ID","TEST_COD","RTST_COD","JOB_REV",
    "EXEC_TYP","EXEC_VER","PROT_COD","CMOD_COD","BURN_TIM","TST_TEMP","USER_TXT",
    "AUX_FILE","PKG_TYP","FAMLY_ID","DATE_COD","FACIL_ID","FLOOR_ID","PROC_ID",
    "OPER_FRQ","SPEC_NAM","SPEC_VER","FLOW_ID","SETUP_ID","DSGN_REV","ENG_ID",
    "ROM_COD","SERL_NUM","SUPR_NAM",
];
const WIR: &[&str] = &["HEAD_NUM","START_T","SITE_GRP","WAFER_ID"];
// Unlike STDF, ATDF puts WAFER_ID fourth. RTST_CNT sits between SITE_GRP and
// ABRT_CNT — without it every later field, GOOD_CNT included, reads one slot early.
const WRR: &[&str] = &[
    "HEAD_NUM","FINISH_T","PART_CNT","WAFER_ID","SITE_GRP","RTST_CNT",
    "ABRT_CNT","GOOD_CNT","FUNC_CNT","FABWF_ID","FRAME_ID","MASK_ID",
    "USR_DESC","EXC_DESC",
];
// SDR: site description. HEAD_NUM, SITE_GRP, SITE_CNT, then SITE_NUM (a
// sub-delimited list), followed by per-site descriptor fields we don't surface.
const SDR: &[&str] = &["HEAD_NUM","SITE_GRP","SITE_CNT","SITE_NUM"];
// Spec sample: WCR:D|R|D|5|.3|.25|1|23|19 — the orientation fields come first,
// and there is no HEAD_NUM/SITE_GRP (STDF's WCR has none either).
const WCR: &[&str] = &[
    "WF_FLAT","POS_X","POS_Y","WAFR_SIZ","DIE_HT","DIE_WID","WF_UNITS",
    "CENTER_X","CENTER_Y",
];
// Same caveat as WCR above — assumed to match STDF's binary HBR/SBR field
// order (HEAD_NUM, SITE_NUM, BIN_NUM, BIN_CNT, BIN_PF, BIN_NAM), not
// independently verified against a real ATDF file.
const HBR: &[&str] = &["HEAD_NUM","SITE_NUM","HBIN_NUM","HBIN_CNT","HBIN_PF","HBIN_NAM"];
const SBR: &[&str] = &["HEAD_NUM","SITE_NUM","SBIN_NUM","SBIN_CNT","SBIN_PF","SBIN_NAM"];
// PTR is used by the first-pass scan; the full parse reads PIR/PRR/FTR positionally
// (see the *_idx constants), so no field-name arrays are needed for those.
const PTR: &[&str] = &[
    "TEST_NUM","HEAD_NUM","SITE_NUM","RESULT","PASS_FAIL","ALARM_FLAGS",
    "TEST_TXT","ALARM_ID","LIMIT_COMPARE","UNITS","LO_LIMIT","HI_LIMIT",
    "C_RESFMT","C_LLMFMT","C_HLMFMT","LO_SPEC","HI_SPEC","RES_SCAL",
    "LLM_SCAL","HLM_SCAL",
];
const FTR: &[&str] = &["TEST_NUM","HEAD_NUM","SITE_NUM","PASS_FAIL"];

fn field_map<'a>(names: &[&'static str], values: &'a [&'a str]) -> HashMap<&'static str, &'a str> {
    names.iter().enumerate()
        .map(|(i, &name)| (name, *values.get(i).unwrap_or(&"")))
        .collect()
}

fn get<'a>(m: &HashMap<&str, &'a str>, key: &str) -> &'a str {
    m.get(key).copied().unwrap_or("").trim()
}

/// Positional field access for the hot record types (PTR/FTR/PIR/PRR), which make
/// up ~99% of records. Avoids building a `HashMap<&str,&str>` per record (and the
/// per-field hashmap lookups) — the field order is fixed by the spec, so we read
/// by index directly. Cold records (MIR/WIR/WRR, a handful per file) keep
/// `field_map`. Index constants below mirror the PTR/PRR/PIR/FTR name arrays.
#[inline]
fn at<'a>(fields: &[&'a str], i: usize) -> &'a str {
    fields.get(i).copied().unwrap_or("").trim()
}

// PTR field indices (see `PTR` array).
const PTR_TEST_NUM: usize = 0;
const PTR_HEAD_NUM: usize = 1;
const PTR_SITE_NUM: usize = 2;
const PTR_RESULT: usize = 3;
const PTR_PASS_FAIL: usize = 4;
const PTR_TEST_TXT: usize = 6;
const PTR_UNITS: usize = 9;
const PTR_LO_LIMIT: usize = 10;
const PTR_HI_LIMIT: usize = 11;
// FTR field indices (see `FTR` array).
const FTR_TEST_NUM: usize = 0;
const FTR_HEAD_NUM: usize = 1;
const FTR_SITE_NUM: usize = 2;
const FTR_PASS_FAIL: usize = 3;
// PIR field indices (see `PIR` array).
const PIR_HEAD_NUM: usize = 0;
const PIR_SITE_NUM: usize = 1;
// PRR field indices (see `PRR` array).
const PRR_HEAD_NUM: usize = 0;
const PRR_SITE_NUM: usize = 1;
const PRR_PART_ID: usize = 2;
const PRR_HARD_BIN: usize = 5;
const PRR_SOFT_BIN: usize = 6;
const PRR_X_COORD: usize = 7;
const PRR_Y_COORD: usize = 8;

/// Pack (head, site) into a single u32 key — replaces the `format!("{},{}")`
/// string key (one heap alloc per record) for the pending PIR→PRR maps.
#[inline]
fn site_key(head: &str, site: &str) -> u32 {
    let h: u32 = head.parse().unwrap_or(1);
    let s: u32 = site.parse().unwrap_or(1);
    (h << 16) | (s & 0xFFFF)
}

fn nonempty(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t.to_string()) }
}

/// Split raw ATDF text into logical records (joining continuation lines —
/// any line starting with a space is appended to the previous record, per
/// the ATDF spec) and detect the field delimiter from FAR, which must be the
/// first non-empty record. Shared by every entry point that reads ATDF text
/// (full parse, first-pass test-name scan, file-meta scan) — this used to be
/// duplicated verbatim in two of those three; a fourth copy for file-meta
/// would have made three.
fn split_atdf_records(raw: &str) -> (Vec<String>, char) {
    let mut delim: Option<char> = None;
    let mut records: Vec<String> = Vec::new();
    for line in raw.lines() {
        if line.starts_with(' ') {
            if let Some(last) = records.last_mut() {
                last.push_str(line.trim_start());
                continue;
            }
        }
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if delim.is_none() && trimmed.starts_with("FAR:") {
                delim = trimmed.chars().nth(5);
            }
            records.push(trimmed.to_string());
        }
    }
    (records, delim.unwrap_or('|'))
}

// ── Metadata extraction (generic, all non-empty fields) ────────────────────────
// Emit every non-empty MIR/WIR/WRR field as a key/value pair, keyed with the
// SAME camelCase keys the STDF parser uses so faceting is format-agnostic.
// Timestamps are normalised to ISO 8601 for the same reason — see
// `atdf_time_to_iso`.
// (ATDF→STDF-key map; left = ATDF field name, right = emitted key.)
const MIR_KEYS: &[(&str, &str)] = &[
    ("SETUP_T","setupT"), ("START_T","startT"), ("LOT_ID","lotId"),
    ("PART_TYP","partType"), ("NODE_NAM","nodeName"), ("TSTR_TYP","testerType"),
    ("JOB_NAM","jobName"), ("JOB_REV","jobRev"), ("SBLOT_ID","sublotId"),
    ("OPER_NAM","operName"), ("EXEC_TYP","execType"), ("EXEC_VER","execVer"),
    ("TEST_COD","testCode"), ("TST_TEMP","testTemp"), ("USER_TXT","userText"),
    ("AUX_FILE","auxFile"), ("PKG_TYP","packageType"), ("FAMLY_ID","familyId"),
    ("DATE_COD","dateCode"), ("FACIL_ID","facilityId"), ("FLOOR_ID","floorId"),
    ("PROC_ID","processId"), ("OPER_FRQ","operFreq"), ("SPEC_NAM","specName"),
    ("SPEC_VER","specVer"), ("FLOW_ID","flowId"), ("SETUP_ID","setupId"),
    ("DSGN_REV","designRev"), ("ENG_ID","engId"), ("ROM_COD","romCode"),
    ("SERL_NUM","serialNum"), ("SUPR_NAM","supervisorName"),
];
const WRR_KEYS: &[(&str, &str)] = &[
    ("FINISH_T","waferFinishT"), ("FABWF_ID","fabWaferId"), ("FRAME_ID","frameId"),
    ("MASK_ID","maskId"), ("USR_DESC","waferDescUser"), ("EXC_DESC","waferDescExec"),
];
// Same camelCase keys the STDF parser's wcr_fields emits, so faceting stays
// format-agnostic like every other record here. WAFR_SIZ/DIE_HT/DIE_WID are
// left as raw text — ATDF has no binary missing-value sentinel to strip (an
// absent/blank field is already just an empty string, handled generically by
// `fields_from` below, same as every other record).
const WCR_KEYS: &[(&str, &str)] = &[
    ("WAFR_SIZ","wafrSiz"), ("DIE_HT","dieHt"), ("DIE_WID","dieWid"),
    ("WF_UNITS","wfUnits"), ("WF_FLAT","wfFlat"), ("CENTER_X","centerX"),
    ("CENTER_Y","centerY"), ("POS_X","posX"), ("POS_Y","posY"),
];

/// Emitted keys carrying a timestamp. Kept as one list so the normalisation
/// below is applied by key, not re-decided at each call site.
const TIME_KEYS: &[&str] = &["setupT", "startT", "waferStartT", "waferFinishT"];

/// ATDF writes timestamps as `HH:MM:SS DD-MMM-YYYY` (e.g. `14:32:05 16-AUG-2026`),
/// which does **not** sort lexicographically — compared as plain strings they
/// order by hour-of-day, so `23:00:00 01-JAN-2020` looks later than
/// `09:00:00 31-DEC-2026`. The STDF parser emits the same keys as fixed-width
/// ISO 8601 via `epoch_to_iso`, so normalising here gives one format per key
/// across both parsers: faceting stays genuinely format-agnostic, and callers
/// that want the earliest/latest of a set (`parse_atdf_file_meta`) can just
/// compare strings.
///
/// Anything not matching the expected shape is returned trimmed but otherwise
/// unchanged — a generator that writes a bare `0`, or a vendor with its own
/// convention, keeps what it had rather than being dropped or mangled.
fn atdf_time_to_iso(raw: &str) -> String {
    let t = raw.trim();
    let Some((clock, date)) = t.split_once(' ') else { return t.to_string() };
    let mut cp = clock.split(':');
    let (Some(hh), Some(mm), Some(ss), None) = (cp.next(), cp.next(), cp.next(), cp.next()) else {
        return t.to_string();
    };
    let mut dp = date.split('-');
    let (Some(dd), Some(mon), Some(yyyy), None) = (dp.next(), dp.next(), dp.next(), dp.next()) else {
        return t.to_string();
    };
    const MONTHS: [&str; 12] = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    let Some(mon_idx) = MONTHS.iter().position(|m| m.eq_ignore_ascii_case(mon)) else {
        return t.to_string();
    };
    let (Ok(h), Ok(mi), Ok(s), Ok(d), Ok(y)) = (
        hh.parse::<u32>(), mm.parse::<u32>(), ss.parse::<u32>(),
        dd.parse::<u32>(), yyyy.parse::<i32>(),
    ) else {
        return t.to_string();
    };
    // s may be 60 — a leap second is legal in the source and harmless here.
    if h > 23 || mi > 59 || s > 60 || d == 0 || d > 31 {
        return t.to_string();
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mon_idx + 1, d, h, mi, s)
}

/// The one place a raw ATDF field value becomes an emitted metadata value.
/// Currently that only means timestamp normalisation, but routing every field
/// through it keeps that decision keyed off `TIME_KEYS` rather than duplicated
/// at each `push_field` call.
fn meta_value(key: &str, value: String) -> String {
    if TIME_KEYS.contains(&key) { atdf_time_to_iso(&value) } else { value }
}

fn fields_from(m: &HashMap<&str, &str>, keys: &[(&str, &str)]) -> Vec<MetaField> {
    let mut f = Vec::new();
    for (atdf, key) in keys {
        push_field(&mut f, key, nonempty(get(m, atdf)).map(|v| meta_value(key, v)));
    }
    f
}

/// Decodes an already-`field_map`'d HBR/SBR into its bin number, optional
/// name (blank text is already `""` in ATDF, no binary sentinel to strip),
/// and Pass flag. Shared by both records since they're identically shaped —
/// only the field *names* differ (HBIN_* vs SBIN_*), passed in by the caller.
fn decode_bin_record_atdf(f: &HashMap<&str, &str>, num_key: &str, pf_key: &str, nam_key: &str) -> BinRecord {
    BinRecord {
        bin: get(f, num_key).parse().unwrap_or(0),
        name: nonempty(get(f, nam_key)),
        pass: get(f, pf_key) == "P",
    }
}

/// Build the soft-bin advisory shown to the host when SOFT_BIN was the sentinel
/// 65535 ("no soft bin") and we mirrored the hard bin instead. Returns an empty
/// vec when no fabrication happened, so the field is omitted from serialisation.
fn soft_bin_warning(fabricated: usize) -> Vec<String> {
    if fabricated == 0 {
        vec![]
    } else {
        vec![format!(
            "{fabricated} die(s) had no soft bin (sentinel 65535) — mirrored the hard bin"
        )]
    }
}

pub fn parse_atdf_from_bytes(bytes: &[u8]) -> Result<ParsedStdf, String> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let raw = std::str::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
    parse_atdf_str(raw, None)
}

/// Parse ATDF text. `selected: Some(set)` accumulates only those test numbers
/// (filtered second pass); `None` accumulates all. Hot records (PTR/FTR/PIR/PRR,
/// ~99% of lines) read fields positionally and key the pending PIR→PRR maps by a
/// packed (head,site) u32 — no per-record `HashMap<&str,&str>` and no per-record
/// `format!` string key. Cold records (MIR/WIR/WRR) keep `field_map`.
fn parse_atdf_str(raw: &str, selected: Option<&std::collections::HashSet<u32>>) -> Result<ParsedStdf, String> {
    // Accumulate a test value iff there's no filter, or the filter contains it.
    let want = |test_num: &str| -> bool {
        match selected {
            None => true,
            Some(set) => test_num.parse::<u32>().map_or(false, |n| set.contains(&n)),
        }
    };
    let (records, delim) = split_atdf_records(raw);

    let mut lots = LotRecords::default();
    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    let mut wafers: Vec<WaferData> = Vec::new();
    let mut current_wafer: Option<WaferData> = None;
    let mut sites: Vec<SiteInfo> = Vec::new();
    let mut hbin_names: HashMap<u32, String> = HashMap::new();
    let mut sbin_names: HashMap<u32, String> = HashMap::new();
    let mut pass_hbins: std::collections::HashSet<u32> = std::collections::HashSet::new();
    // Keyed by packed (head,site) u32 (see `site_key`) — avoids a `format!` string
    // key per PIR/PTR/FTR/PRR. Inner map keyed by test-number string (tsmap identity).
    let mut pending_values: HashMap<u32, HashMap<String, f64>> = HashMap::new();
    let mut pending_pass: HashMap<u32, HashMap<String, bool>> = HashMap::new();
    let mut pending_site: HashMap<u32, u32> = HashMap::new();
    let mut soft_bin_fabricated: usize = 0;
    // Per-wafer PRR-encounter ordinal, reset on each WIR — used as die_index
    // for a die with no reported X/Y (see the PRR branch below), mirroring
    // parse_stdf.rs's identical scheme.
    let mut prr_index_in_wafer: u32 = 0;

    for rec in &records {
        let colon = match rec.find(':') {
            Some(i) => i,
            None => continue,
        };
        let name = &rec[..colon];
        let raw_fields: Vec<&str> = rec[colon + 1..].split(delim).collect();

        match name {
            // ── Cold records (a handful per file): keep `field_map` so metadata
            //    extraction stays identical — no field can be dropped. ──
            "MIR" => {
                // The lot for the wafers that follow — see LotRecords.
                let f = field_map(MIR, &raw_fields);
                lots.set_lot(fields_from(&f, MIR_KEYS));
            }
            // WCR is file-level geometry, kept apart from lot records so it
            // survives wherever it sits relative to a MIR.
            "WCR" => {
                let f = field_map(WCR, &raw_fields);
                lots.extend_file(fields_from(&f, WCR_KEYS));
            }
            "HBR" => {
                let f = field_map(HBR, &raw_fields);
                let hbr = decode_bin_record_atdf(&f, "HBIN_NUM", "HBIN_PF", "HBIN_NAM");
                if let Some(name) = hbr.name { hbin_names.insert(hbr.bin, name); }
                if hbr.pass { pass_hbins.insert(hbr.bin); }
            }
            "SBR" => {
                let f = field_map(SBR, &raw_fields);
                let sbr = decode_bin_record_atdf(&f, "SBIN_NUM", "SBIN_PF", "SBIN_NAM");
                if let Some(name) = sbr.name { sbin_names.insert(sbr.bin, name); }
            }
            "SDR" => {
                // Site description → ParsedStdf.sites, matching the STDF parser
                // (which fills sites from SDR). HEAD_NUM at [0]; every numeric field
                // from the SITE_CNT position (index 2) onward is a site number — our
                // generators emit the site list with the primary delimiter.
                let f = field_map(SDR, &raw_fields);
                let head: u32 = get(&f, "HEAD_NUM").parse().unwrap_or(1);
                for raw in raw_fields.iter().skip(2) {
                    if let Ok(site) = raw.trim().parse::<u32>() {
                        sites.push(SiteInfo { head_num: head, site_num: site });
                    }
                }
            }
            "WIR" => {
                let f = field_map(WIR, &raw_fields);
                let wafer_id = {
                    let id = get(&f, "WAFER_ID");
                    if id.is_empty() { format!("W{}", wafers.len() + 1) } else { id.to_string() }
                };
                let mut fields = Vec::new();
                push_field(&mut fields, "waferStartT",
                    nonempty(get(&f, "START_T")).map(|v| meta_value("waferStartT", v)));
                prr_index_in_wafer = 0;
                current_wafer = Some(WaferData {
                    wafer_id,
                    results: Vec::new(),
                    part_count: None,
                    good_count: None,
                    fail_count: None,
                    fields,
                });
            }
            "WRR" => {
                let f = field_map(WRR, &raw_fields);
                if let Some(mut w) = current_wafer.take() {
                    w.fields.extend(fields_from(&f, WRR_KEYS));
                    let wid = get(&f, "WAFER_ID");
                    if !wid.is_empty() { w.wafer_id = wid.to_string(); }
                    w.part_count = get(&f, "PART_CNT").parse().ok();
                    w.good_count = get(&f, "GOOD_CNT").parse().ok();
                    w.fail_count = match (w.part_count, w.good_count) {
                        (Some(p), Some(g)) => Some(p.saturating_sub(g)),
                        _ => None,
                    };
                    lots.push_wafer(&mut wafers, w);
                }
            }
            // ── Hot records (~99% of lines): positional field access, packed
            //    (head,site) u32 keys, and the `want` filter gate. No per-record
            //    HashMap, no per-record `format!` key. ──
            "PIR" => {
                let key = site_key(at(&raw_fields, PIR_HEAD_NUM), at(&raw_fields, PIR_SITE_NUM));
                let site: u32 = at(&raw_fields, PIR_SITE_NUM).parse().unwrap_or(1);
                pending_site.insert(key, site);
                pending_values.insert(key, HashMap::new());
                pending_pass.insert(key, HashMap::new());
            }
            "PTR" => {
                let test_num = at(&raw_fields, PTR_TEST_NUM);
                let key = site_key(at(&raw_fields, PTR_HEAD_NUM), at(&raw_fields, PTR_SITE_NUM));
                if !test_defs.contains_key(test_num) {
                    let lo = at(&raw_fields, PTR_LO_LIMIT).parse::<f64>().ok();
                    let hi = at(&raw_fields, PTR_HI_LIMIT).parse::<f64>().ok();
                    let txt = at(&raw_fields, PTR_TEST_TXT);
                    test_defs.insert(test_num.to_string(), TestDef {
                        name: if txt.is_empty() { test_num.to_string() } else { txt.to_string() },
                        test_type: "P".to_string(),
                        lo_limit: lo,
                        hi_limit: hi,
                        units: nonempty(at(&raw_fields, PTR_UNITS)),
                        ..Default::default()
                    });
                }
                if want(test_num) {
                    if let Ok(result) = at(&raw_fields, PTR_RESULT).parse::<f64>() {
                        if let Some(vals) = pending_values.get_mut(&key) {
                            vals.insert(test_num.to_string(), result);
                        }
                    }
                    // ATDF PTR field 5 is Pass/Fail Flag: "P"/"F"; blank = no indication.
                    let pf = at(&raw_fields, PTR_PASS_FAIL);
                    if pf.eq_ignore_ascii_case("P") || pf.eq_ignore_ascii_case("F") {
                        if let Some(passes) = pending_pass.get_mut(&key) {
                            passes.insert(test_num.to_string(), pf.eq_ignore_ascii_case("P"));
                        }
                    }
                }
            }
            "FTR" => {
                let test_num = at(&raw_fields, FTR_TEST_NUM);
                let key = site_key(at(&raw_fields, FTR_HEAD_NUM), at(&raw_fields, FTR_SITE_NUM));
                if !test_defs.contains_key(test_num) {
                    test_defs.insert(test_num.to_string(), TestDef {
                        name: test_num.to_string(),
                        test_type: "F".to_string(),
                        lo_limit: None,
                        hi_limit: None,
                        units: None,
                        ..Default::default()
                    });
                }
                if want(test_num) {
                    // Functional outcomes are verdicts, not values: "P"/"F" go to the
                    // pass channel; anything else records nothing (never a fabricated fail).
                    let pf = at(&raw_fields, FTR_PASS_FAIL);
                    if pf.eq_ignore_ascii_case("P") || pf.eq_ignore_ascii_case("F") {
                        if let Some(passes) = pending_pass.get_mut(&key) {
                            passes.insert(test_num.to_string(), pf.eq_ignore_ascii_case("P"));
                        }
                    }
                }
            }
            "PRR" => {
                // ATDF leaves the X/Y field blank when no position was
                // recorded for a die — kept as a coordinate-less die rather
                // than dropped (matching parse_stdf.rs's SENTINEL_I2
                // handling). A die is either fully positioned or fully
                // unpositioned; a malformed/half pair (one parses, one
                // doesn't) is treated as unpositioned too rather than losing
                // the whole die's test data over one bad field.
                let x_raw: Option<i32> = at(&raw_fields, PRR_X_COORD).parse().ok();
                let y_raw: Option<i32> = at(&raw_fields, PRR_Y_COORD).parse().ok();
                let (x, y) = if x_raw.is_some() && y_raw.is_some() { (x_raw, y_raw) } else { (None, None) };
                let key = site_key(at(&raw_fields, PRR_HEAD_NUM), at(&raw_fields, PRR_SITE_NUM));
                let site_num = pending_site.remove(&key);
                let test_values = pending_values.remove(&key).unwrap_or_default();
                let test_pass = pending_pass.remove(&key).unwrap_or_default();
                let hbin: Option<u32> = at(&raw_fields, PRR_HARD_BIN).parse().ok();
                let raw_sbin: Option<u32> = at(&raw_fields, PRR_SOFT_BIN).parse().ok();
                if raw_sbin == Some(65535) { soft_bin_fabricated += 1; }
                let sbin: Option<u32> = raw_sbin
                    .map(|v: u32| if v == 65535 { hbin.unwrap_or(1) } else { v })
                    .or(hbin);
                let part_id: Option<u32> = at(&raw_fields, PRR_PART_ID).parse().ok();
                let die_index = if x.is_none() {
                    let idx = prr_index_in_wafer;
                    prr_index_in_wafer += 1;
                    Some(idx)
                } else {
                    None
                };
                let die = DieResult { x, y, die_index, hbin, sbin, site_num, part_id, test_values, test_pass };
                match current_wafer.as_mut() {
                    Some(w) => w.results.push(die),
                    None => {
                        prr_index_in_wafer = 0;
                        let mut w = WaferData {
                            wafer_id: format!("W{}", wafers.len() + 1),
                            results: Vec::new(),
                            part_count: None,
                            good_count: None,
                            fail_count: None,
                            fields: Vec::new(),
                        };
                        w.results.push(die);
                        current_wafer = Some(w);
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(w) = current_wafer {
        if !w.results.is_empty() {
            lots.push_wafer(&mut wafers, w);
        }
    }

    let mut warnings = soft_bin_warning(soft_bin_fabricated);
    warnings.extend(position_warnings(&wafers));
    let meta = lots.finish(&mut wafers, &mut warnings);
    let hbin_defs = finish_bin_defs(hbin_names);
    let sbin_defs = finish_bin_defs(sbin_names);
    let mut pass_hbins: Vec<u32> = pass_hbins.into_iter().collect();
    pass_hbins.sort_unstable();
    Ok(ParsedStdf { meta, wafers, test_defs, sites, hbin_defs, sbin_defs, pass_hbins, warnings })
}

#[cfg(feature = "native")]
pub fn parse_atdf_sync(path: String) -> Result<ParsedStdf, String> {
    let text = crate::read_file::read_text(&path)
        .map_err(|e| format!("Failed to read {path}: {e}"))?;
    parse_atdf_str(&text, None)
}

// ── First-pass test name scan ─────────────────────────────────────────────────

/// Scans the file for PTR/FTR records only, collecting test names and limits.
/// Does not accumulate die results. Returns a flat map of test_num string → TestDef.
pub fn parse_atdf_test_names(bytes: &[u8]) -> Result<crate::types::ScanResult, String> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let raw = std::str::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
    parse_atdf_test_names_str(raw)
}

fn parse_atdf_test_names_str(raw: &str) -> Result<crate::types::ScanResult, String> {
    let (records, delim) = split_atdf_records(raw);

    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    let mut pir_count: u32 = 0;

    for rec in &records {
        let colon = match rec.find(':') {
            Some(i) => i,
            None => continue,
        };
        let name = &rec[..colon];
        let raw_fields: Vec<&str> = rec[colon + 1..].split(delim).collect();

        match name {
            "PIR" => { pir_count += 1; }
            "PTR" => {
                let f = field_map(PTR, &raw_fields);
                let test_num = get(&f, "TEST_NUM").to_string();
                test_defs.entry(test_num.clone()).or_insert_with(|| {
                    let lo = get(&f, "LO_LIMIT").parse::<f64>().ok();
                    let hi = get(&f, "HI_LIMIT").parse::<f64>().ok();
                    TestDef {
                        name: {
                            let t = get(&f, "TEST_TXT");
                            if t.is_empty() { test_num.clone() } else { t.to_string() }
                        },
                        test_type: "P".to_string(),
                        lo_limit: lo,
                        hi_limit: hi,
                        units: nonempty(get(&f, "UNITS")),
                        ..Default::default()
                    }
                });
            }
            "FTR" => {
                let f = field_map(FTR, &raw_fields);
                let test_num = get(&f, "TEST_NUM").to_string();
                test_defs.entry(test_num.clone()).or_insert_with(|| TestDef {
                    name: test_num.clone(),
                    test_type: "F".to_string(),
                    lo_limit: None,
                    hi_limit: None,
                    units: None,
                    ..Default::default()
                });
            }
            _ => {}
        }
    }

    Ok(crate::types::ScanResult { test_defs, die_count: pir_count })
}

/// Fast metadata-only scan for the file-filter table — the ATDF twin of
/// `parse_stdf.rs`'s `parse_stdf_file_meta`. ATDF has no binary records to
/// skip over (it's already line-based text), so this is simply "only handle
/// MIR/SDR/WIR/WRR line names, ignore everything else" rather than any kind
/// of seek/skip — reuses the same field tables and helpers the full parse
/// uses for these same four record types.
pub fn parse_atdf_file_meta(bytes: &[u8]) -> Result<crate::types::FileMeta, String> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let raw = std::str::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
    parse_atdf_file_meta_str(raw)
}

fn parse_atdf_file_meta_str(raw: &str) -> Result<crate::types::FileMeta, String> {
    let (records, delim) = split_atdf_records(raw);

    let mut lot_meta = LotMeta::default();
    let mut wafer_count: u32 = 0;
    let mut earliest_start: Option<String> = None;
    let mut latest_finish: Option<String> = None;
    let mut site_nums: std::collections::HashSet<u32> = std::collections::HashSet::new();

    for rec in &records {
        let colon = match rec.find(':') {
            Some(i) => i,
            None => continue,
        };
        let name = &rec[..colon];
        let raw_fields: Vec<&str> = rec[colon + 1..].split(delim).collect();

        match name {
            "MIR" => {
                let f = field_map(MIR, &raw_fields);
                lot_meta.fields = fields_from(&f, MIR_KEYS);
            }
            "SDR" => {
                // Same skip(2) convention as the full parse's own SDR handling —
                // HEAD_NUM/SITE_GRP occupy the first two positions, SITE_NUM is a
                // sub-delimited list from position 2 onward.
                for raw_site in raw_fields.iter().skip(2) {
                    if let Ok(site) = raw_site.trim().parse::<u32>() {
                        site_nums.insert(site);
                    }
                }
            }
            // Both comparisons are plain string compares, which is only sound
            // because meta_value has normalised these to fixed-width ISO 8601
            // — see atdf_time_to_iso.
            "WIR" => {
                wafer_count += 1;
                let f = field_map(WIR, &raw_fields);
                if let Some(t) = nonempty(get(&f, "START_T")).map(|v| meta_value("waferStartT", v)) {
                    if earliest_start.as_deref().map_or(true, |cur| t.as_str() < cur) {
                        earliest_start = Some(t);
                    }
                }
            }
            "WRR" => {
                let f = field_map(WRR, &raw_fields);
                if let Some(t) = nonempty(get(&f, "FINISH_T")).map(|v| meta_value("waferFinishT", v)) {
                    if latest_finish.as_deref().map_or(true, |cur| t.as_str() > cur) {
                        latest_finish = Some(t);
                    }
                }
            }
            _ => {}
        }
    }

    Ok(crate::types::FileMeta {
        lot_meta,
        wafer_count,
        earliest_start,
        latest_finish,
        site_count: if site_nums.is_empty() { None } else { Some(site_nums.len() as u32) },
    })
}

// ── Filtered parse ────────────────────────────────────────────────────────────

/// Like `parse_atdf_from_bytes` but skips die accumulation for test numbers not
/// in `selected`. Test defs are still registered for all tests.
pub fn parse_atdf_from_bytes_filtered(
    bytes: &[u8],
    selected: &std::collections::HashSet<u32>,
) -> Result<ParsedStdf, String> {
    let raw = std::str::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
    parse_atdf_str(raw, Some(selected))
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

    fn far() -> &'static str { "FAR:A|4\n" }

    fn mir_full() -> String {
        // ATDF MIR order — SBLOT_ID is field 11 (index 10). It used to sit at
        // index 30 here, matching the parser's old, non-spec layout.
        let mut fields = vec![""; 11];
        fields[0]  = "LOT-01";
        fields[1]  = "WIDGET";
        fields[2]  = "JOB1";
        fields[3]  = "NODE1";
        fields[4]  = "TSTR-A";
        fields[10] = "SUBLOT-1";
        format!("MIR:{}\n", fields.join("|"))
    }

    /// Arguments in STDF order for readability; written in the ATDF order.
    #[allow(clippy::too_many_arguments)]
    fn wcr(
        wafr_siz: &str, die_ht: &str, die_wid: &str, wf_units: &str, wf_flat: &str,
        center_x: &str, center_y: &str, pos_x: &str, pos_y: &str,
    ) -> String {
        format!("WCR:{wf_flat}|{pos_x}|{pos_y}|{wafr_siz}|{die_ht}|{die_wid}|{wf_units}|{center_x}|{center_y}\n")
    }

    fn hbr(bin: u32, cnt: u32, pf: &str, name: &str) -> String {
        format!("HBR:1|255|{bin}|{cnt}|{pf}|{name}\n")
    }
    fn sbr(bin: u32, cnt: u32, pf: &str, name: &str) -> String {
        format!("SBR:1|255|{bin}|{cnt}|{pf}|{name}\n")
    }

    fn wir(id: &str) -> String { format!("WIR:1||1|{id}\n") }
    fn wrr(id: &str, part: u32, good: u32) -> String {
        // HEAD|FINISH_T|PART_CNT|WAFER_ID|SITE_GRP|RTST_CNT|ABRT_CNT|GOOD_CNT
        format!("WRR:1||{part}|{id}|||0|{good}\n")
    }
    fn pir(head: u8, site: u8) -> String { format!("PIR:{head}|{site}\n") }
    fn prr(head: u8, site: u8, x: i32, y: i32, hbin: u32, sbin: u32) -> String {
        format!("PRR:{head}|{site}|1|4|P|{hbin}|{sbin}|{x}|{y}\n")
    }
    fn ptr_rec(tnum: &str, head: u8, site: u8, result: f64, lo: f64, hi: f64, txt: &str, units: &str) -> String {
        format!("PTR:{tnum}|{head}|{site}|{result}|P||{txt}||L|{units}|{lo}|{hi}\n")
    }
    fn ftr_rec(tnum: &str, head: u8, site: u8, pass: bool) -> String {
        format!("FTR:{tnum}|{head}|{site}|{}\n", if pass { "P" } else { "F" })
    }
    fn one_wafer(id: &str, inner: &str) -> String {
        format!("{}{}{}{}{}", far(), mir_full(), wir(id), inner, wrr(id, 4, 3))
    }

    #[test]
    fn meta_extracted_from_mir() {
        let text = one_wafer("W1", &(pir(1,1) + &prr(1,1,0,0,1,1)));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.meta.get("lotId"), Some("LOT-01"));
        assert_eq!(result.meta.get("partType"), Some("WIDGET"));
        assert_eq!(result.meta.get("jobName"), Some("JOB1"));
        assert_eq!(result.meta.get("nodeName"), Some("NODE1"));
        assert_eq!(result.meta.get("testerType"), Some("TSTR-A"));
        assert_eq!(result.meta.get("sublotId"), Some("SUBLOT-1"));
    }

    /// Pins the MIR, WCR and WRR layouts to the ATDF specification itself rather
    /// than to this crate's own writers — every earlier test used helpers built
    /// to the same wrong layouts as the parser, so they could never disagree.
    /// MIR and WCR are the spec's sample records verbatim (MIR cut after
    /// TST_TEMP); the WRR line is spec-shaped with distinct values per count.
    #[test]
    fn spec_sample_records_parse_to_the_right_fields() {
        let text = format!(
            "{}{}{}{}{}{}",
            far(),
            "MIR:A3002B|80386|80386HOT|akbar|J971|8:14:59 23-JUL-1992|8:23:02 23-JUL-1992|Sandy|P|1|2B|HOT|N|3.1.2|IG900|2.4|||300|100\n",
            "WCR:D|R|D|5|.3|.25|1|23|19\n",
            wir("W01"),
            pir(1,1) + &prr(1,1,0,0,1,1),
            "WRR:1|11:02:42 23-JUL-1992|492|W01|3|5|11|470|480|MOS-4|F54|S3-1|Glass buildup|Yield alarm\n",
        );
        let r = parse_atdf_str(&text, None).unwrap();
        for (key, want) in [
            ("lotId", "A3002B"), ("partType", "80386"), ("jobName", "80386HOT"),
            ("nodeName", "akbar"), ("testerType", "J971"),
            ("setupT", "1992-07-23T08:14:59Z"), ("startT", "1992-07-23T08:23:02Z"),
            ("operName", "Sandy"), ("sublotId", "2B"), ("testCode", "HOT"),
            ("jobRev", "3.1.2"), ("execType", "IG900"), ("execVer", "2.4"), ("testTemp", "100"),
            ("wfFlat", "D"), ("posX", "R"), ("posY", "D"), ("wafrSiz", "5"),
            ("dieHt", ".3"), ("dieWid", ".25"), ("wfUnits", "1"), ("centerX", "23"), ("centerY", "19"),
        ] {
            assert_eq!(r.meta.get(key), Some(want), "{key}");
        }
        let w = &r.wafers[0];
        assert_eq!(w.part_count, Some(492));
        assert_eq!(w.good_count, Some(470), "GOOD_CNT is field 8, after RTST_CNT and ABRT_CNT");
        let field = |k: &str| w.fields.iter().find(|f| f.key == k).map(|f| f.value.clone());
        assert_eq!(field("fabWaferId").as_deref(), Some("MOS-4"));
        assert_eq!(field("frameId").as_deref(), Some("F54"));
        assert_eq!(field("maskId").as_deref(), Some("S3-1"));
    }

    #[test]
    fn concatenated_lots_label_each_wafer_with_its_own_lot() {
        let die = pir(1,1) + &prr(1,1,0,0,1,1);
        let second = format!("{}{}{}{}", mir_full().replace("LOT-01", "LOT-02"), wir("W1"), die, wrr("W1", 4, 3));
        let text = one_wafer("W1", &die) + &second;
        for r in [
            parse_atdf_str(&text, None).unwrap(),
            parse_atdf_str(&text, Some(&std::collections::HashSet::new())).unwrap(),
        ] {
            assert_eq!(r.wafers.len(), 2);
            let lot = |i: usize| r.wafers[i].fields.iter()
                .find(|f| f.key == "lotId").map(|f| f.value.clone());
            assert_eq!(lot(0).as_deref(), Some("LOT-01"));
            assert_eq!(lot(1).as_deref(), Some("LOT-02"));
            assert_eq!(r.meta.get("partType"), Some("WIDGET"));
            assert_eq!(r.meta.get("lotId"), None);
            assert!(r.warnings.iter().any(|w| w.contains("2 lot records")));
        }
    }

    #[test]
    fn empty_mir_yields_none_meta() {
        let text = format!("{}MIR:\n", far());
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.meta.get("lotId").is_none());
        assert!(result.meta.get("partType").is_none());
    }

    #[test]
    fn wcr_fields_are_extracted_into_lot_meta() {
        let text = format!(
            "{}{}{}{}{}{}",
            far(), mir_full(), wcr("300","17.6","17.6","3","D","0","0","R","U"),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.meta.get("wafrSiz"), Some("300"));
        assert_eq!(result.meta.get("dieHt"), Some("17.6"));
        assert_eq!(result.meta.get("dieWid"), Some("17.6"));
        assert_eq!(result.meta.get("wfUnits"), Some("3"));
        assert_eq!(result.meta.get("wfFlat"), Some("D"));
        assert_eq!(result.meta.get("centerX"), Some("0"));
        assert_eq!(result.meta.get("centerY"), Some("0"));
        assert_eq!(result.meta.get("posX"), Some("R"));
        assert_eq!(result.meta.get("posY"), Some("U"));
    }

    #[test]
    fn wcr_blank_fields_are_omitted_not_emitted() {
        let text = format!(
            "{}{}{}{}{}{}",
            far(), mir_full(), wcr("","","","","","","","",""),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.meta.get("wafrSiz"), None);
        assert_eq!(result.meta.get("wfFlat"), None);
        assert_eq!(result.meta.get("centerX"), None);
    }

    #[test]
    fn wcr_wf_units_zero_is_still_emitted_as_a_real_value() {
        // "0" (Unknown) is itself a meaningful enum value here, not a blank
        // field — must not be treated the same as an omitted one.
        let text = format!(
            "{}{}{}{}{}{}",
            far(), mir_full(), wcr("","","","0","","","","",""),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.meta.get("wfUnits"), Some("0"));
    }

    #[test]
    fn hbr_sbr_fields_are_extracted() {
        let text = format!(
            "{}{}{}{}{}{}{}{}",
            far(), mir_full(),
            hbr(1, 500, "P", "Pass"), hbr(2, 20, "F", "Fail"), sbr(10, 5, "F", "Leakage Fail"),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 1).map(|d| d.name.as_str()), Some("Pass"));
        assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 2).map(|d| d.name.as_str()), Some("Fail"));
        assert_eq!(result.sbin_defs.iter().find(|d| d.bin == 10).map(|d| d.name.as_str()), Some("Leakage Fail"));
        assert_eq!(result.pass_hbins, vec![1]);
    }

    #[test]
    fn hbr_blank_name_is_omitted_but_still_counts_for_pass_hbins() {
        let text = format!(
            "{}{}{}{}{}{}",
            far(), mir_full(), hbr(1, 500, "P", ""),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.hbin_defs.iter().find(|d| d.bin == 1).is_none());
        assert_eq!(result.pass_hbins, vec![1]);
    }

    #[test]
    fn hbr_sbr_fields_also_reach_the_filtered_parse_entry_point() {
        let text = format!(
            "{}{}{}{}{}{}",
            far(), mir_full(), hbr(1, 500, "P", "Pass"),
            wir("W1"), pir(1,1) + &prr(1,1,0,0,1,1), wrr("W1",1,1),
        );
        let bytes = text.as_bytes();
        let result = parse_atdf_from_bytes_filtered(bytes, &std::collections::HashSet::new()).unwrap();
        assert_eq!(result.hbin_defs[0].name, "Pass");
        assert_eq!(result.pass_hbins, vec![1]);
    }

    #[test]
    fn single_wafer_parsed() {
        let inner = pir(1,1) + &prr(1,1,0,0,1,1);
        let text = one_wafer("W01", &inner);
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        assert_eq!(result.wafers[0].wafer_id, "W01");
    }

    #[test]
    fn wrr_wafer_id_overrides_wir() {
        let inner = pir(1,1) + &prr(1,1,0,0,1,1);
        let text = format!("{}{}{}{}{}", far(), mir_full(), wir("WIR-ID"), inner, wrr("WRR-ID", 1, 1));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].wafer_id, "WRR-ID");
    }

    #[test]
    fn fallback_wafer_id_when_wir_empty() {
        let inner = pir(1,1) + &prr(1,1,0,0,1,1);
        let text = format!("{}{}WIR:1||1|\n{}{}", far(), mir_full(), inner, wrr("", 1, 1));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].wafer_id, "W1");
    }

    #[test]
    fn multiple_wafers() {
        let w1 = wir("W01") + &pir(1,1) + &prr(1,1,0,0,1,1) + &wrr("W01", 1, 1);
        let w2 = wir("W02") + &pir(1,1) + &prr(1,1,1,1,1,1) + &wrr("W02", 1, 1);
        let text = format!("{}{}{}{}", far(), mir_full(), w1, w2);
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers.len(), 2);
        assert_eq!(result.wafers[0].wafer_id, "W01");
        assert_eq!(result.wafers[1].wafer_id, "W02");
    }

    #[test]
    fn sdr_populates_sites() {
        // Parity with the STDF parser, which fills ParsedStdf.sites from SDR.
        let inner = pir(1,1) + &prr(1,1,0,0,1,1);
        let text = format!("{}{}SDR:1|1|1|2|3|4\n{}{}{}", far(), mir_full(), wir("W01"), inner, wrr("W01", 1, 1));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let site_nums: Vec<u32> = result.sites.iter().map(|s| s.site_num).collect();
        assert_eq!(site_nums, vec![1, 2, 3, 4]);
        assert!(result.sites.iter().all(|s| s.head_num == 1));
    }

    #[test]
    fn hot_path_values_bins_and_site_preserved() {
        // Guards the positional/packed-key fast path: test values, bins and per-die
        // site_num must survive across multiple sites in one batch.
        let inner = pir(1,2) + &pir(1,3)
            + &ptr_rec("1000", 1, 2, 1.5, 0.0, 5.0, "leak", "nA")
            + &ptr_rec("1000", 1, 3, 2.5, 0.0, 5.0, "leak", "nA")
            + &ftr_rec("2000", 1, 2, true)
            + &prr(1, 2, 0, 0, 1, 1)
            + &prr(1, 3, 1, 0, 2, 2);
        let text = one_wafer("W01", &inner);
        let path = tmp(&text);
        let r = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let dies = &r.wafers[0].results;
        assert_eq!(dies.len(), 2);
        let d2 = dies.iter().find(|d| d.site_num == Some(2)).expect("site 2 die");
        let d3 = dies.iter().find(|d| d.site_num == Some(3)).expect("site 3 die");
        // Each site's value landed on the right die (packed key disambiguates sites).
        assert_eq!(d2.test_values.get("1000"), Some(&1.5));
        assert_eq!(d2.test_pass.get("2000"), Some(&true)); // FTR pass → verdict channel
        assert!(!d2.test_values.contains_key("2000"));
        assert_eq!(d3.test_values.get("1000"), Some(&2.5));
        assert_eq!(d2.hbin, Some(1));
        assert_eq!(d3.hbin, Some(2));
        // Test defs registered with limits/units from the full PTR.
        let td = r.test_defs.get("1000").expect("test 1000 def");
        assert_eq!(td.name, "leak");
        assert_eq!(td.units.as_deref(), Some("nA"));
        assert_eq!(td.lo_limit, Some(0.0));
        assert_eq!(td.hi_limit, Some(5.0));
    }

    #[test]
    fn part_good_fail_counts_from_wrr() {
        let inner = pir(1,1) + &prr(1,1,0,0,1,1);
        let text = format!("{}{}{}{}", far(), mir_full(), wir("W1"), inner) + &wrr("W1", 10, 7);
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].part_count, Some(10));
        assert_eq!(result.wafers[0].good_count, Some(7));
        assert_eq!(result.wafers[0].fail_count, Some(3));
    }

    #[test]
    fn wafer_flushed_without_wrr() {
        let text = format!("{}{}{}{}",
            far(), mir_full(), wir("W1"), pir(1,1)) + &prr(1,1,0,0,1,1);
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        assert_eq!(result.wafers[0].results.len(), 1);
    }

    #[test]
    fn no_wafers_for_empty_file() {
        let text = format!("{}{}", far(), mir_full());
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert!(result.wafers.is_empty());
    }

    #[test]
    fn die_coordinates_and_bins() {
        let inner = pir(1,1) + &prr(1,1,3,7,2,5);
        let path = tmp(&one_wafer("W1", &inner));
        let die = &parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap().wafers[0].results[0];
        assert_eq!(die.x, Some(3));
        assert_eq!(die.y, Some(7));
        assert_eq!(die.hbin, Some(2));
        assert_eq!(die.sbin, Some(5));
    }

    #[test]
    fn negative_coordinates() {
        let inner = pir(1,1) + &prr(1,1,-4,-9,1,1);
        let path = tmp(&one_wafer("W1", &inner));
        let die = &parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap().wafers[0].results[0];
        assert_eq!(die.x, Some(-4));
        assert_eq!(die.y, Some(-9));
    }

    #[test]
    fn die_with_missing_coords_is_kept_not_dropped() {
        let inner = pir(1,1) + "PRR:1|1|1|4|P|1|1||\n";
        let text = format!("{}{}{}{}{}", far(), mir_full(), wir("W1"), inner, wrr("W1", 0, 0));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 1, "the coordinate-less die must be kept, not dropped");
        assert_eq!(dies[0].x, None);
        assert_eq!(dies[0].y, None);
        assert_eq!(dies[0].hbin, Some(1));
        assert_eq!(dies[0].sbin, Some(1));
        assert_eq!(dies[0].die_index, Some(0));
    }

    #[test]
    fn multiple_dies_on_one_wafer() {
        let inner: String = (0..4).map(|i| pir(1,1) + &prr(1,1,i,i,1,1)).collect();
        let path = tmp(&one_wafer("W1", &inner));
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].results.len(), 4);
    }

    #[test]
    fn ptr_test_value_and_def() {
        let inner = pir(1,1)
            + &ptr_rec("100", 1, 1, 1.23, 0.0, 2.0, "Vt", "mV")
            + &prr(1,1,0,0,1,1);
        let path = tmp(&one_wafer("W1", &inner));
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let die = &result.wafers[0].results[0];
        let v = *die.test_values.get("100").unwrap();
        assert!((v - 1.23).abs() < 1e-9);
        let def = result.test_defs.get("100").unwrap();
        assert_eq!(def.name, "Vt");
        assert_eq!(def.test_type, "P");
        assert_eq!(def.lo_limit, Some(0.0));
        assert_eq!(def.hi_limit, Some(2.0));
        assert_eq!(def.units.as_deref(), Some("mV"));
    }

    #[test]
    fn ptr_test_def_captured_once() {
        let inner = pir(1,1) + &ptr_rec("1", 1, 1, 1.0, 0.0, 2.0, "First", "V") + &prr(1,1,0,0,1,1)
            + &pir(1,1) + &ptr_rec("1", 1, 1, 1.5, 10.0, 20.0, "Second", "V") + &prr(1,1,1,0,1,1);
        let path = tmp(&one_wafer("W1", &inner));
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let def = result.test_defs.get("1").unwrap();
        assert_eq!(def.name, "First");
        assert_eq!(def.lo_limit, Some(0.0));
    }

    #[test]
    fn multiple_ptr_values_per_die() {
        let inner = pir(1,1)
            + &ptr_rec("1", 1, 1, 1.0, 0.0, 2.0, "A", "V")
            + &ptr_rec("2", 1, 1, 3.5, 0.0, 5.0, "B", "V")
            + &prr(1,1,0,0,1,1);
        let path = tmp(&one_wafer("W1", &inner));
        let die = &parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap().wafers[0].results[0];
        assert!((die.test_values["1"] - 1.0).abs() < 1e-9);
        assert!((die.test_values["2"] - 3.5).abs() < 1e-9);
    }

    #[test]
    fn ftr_verdict_goes_to_test_pass_not_values() {
        let inner = pir(1,1) + &ftr_rec("200", 1, 1, true)  + &prr(1,1,0,0,1,1)
            + &pir(1,1) + &ftr_rec("200", 1, 1, false) + &prr(1,1,1,0,2,2);
        let path = tmp(&one_wafer("W1", &inner));
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].results[0].test_pass["200"], true);
        assert_eq!(result.wafers[0].results[1].test_pass["200"], false);
        // Functional outcomes are verdicts, never fabricated values.
        assert!(!result.wafers[0].results[0].test_values.contains_key("200"));
        assert!(!result.wafers[0].results[1].test_values.contains_key("200"));
        assert_eq!(result.test_defs["200"].test_type, "F");
    }

    #[test]
    fn multi_site_values_separated() {
        let inner = pir(1,1) + &pir(1,2)
            + &ptr_rec("1", 1, 1, 1.1, 0.0, 2.0, "T", "V")
            + &ptr_rec("1", 1, 2, 2.2, 0.0, 2.0, "T", "V")
            + &prr(1,1,0,0,1,1)
            + &prr(1,2,1,0,1,1);
        let path = tmp(&one_wafer("W1", &inner));
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 2);
        let d0 = dies.iter().find(|d| d.x == Some(0)).unwrap();
        let d1 = dies.iter().find(|d| d.x == Some(1)).unwrap();
        assert!((d0.test_values["1"] - 1.1).abs() < 1e-9);
        assert!((d1.test_values["1"] - 2.2).abs() < 1e-9);
    }

    #[test]
    fn comma_delimiter_from_far() {
        let pipe_to_comma = |s: &str| s.replace('|', ",");
        let text = "FAR:A,4\n".to_string()
            + &pipe_to_comma(&mir_full())
            + &pipe_to_comma(&wir("W1"))
            + &pipe_to_comma(&pir(1,1))
            + &pipe_to_comma(&prr(1,1,9,3,1,1))
            + &pipe_to_comma(&wrr("W1", 1, 1));
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        let die = &result.wafers[0].results[0];
        assert_eq!(die.x, Some(9));
        assert_eq!(die.y, Some(3));
    }

    #[test]
    fn default_pipe_delimiter_without_far() {
        let text = mir_full()
            + &wir("W1") + &pir(1,1) + &prr(1,1,5,6,1,1) + &wrr("W1", 1, 1);
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].results[0].x, Some(5));
    }

    #[test]
    fn crlf_line_endings() {
        let text = one_wafer("W1", &(pir(1,1) + &prr(1,1,1,2,1,1)))
            .replace('\n', "\r\n");
        let path = tmp(&text);
        let result = parse_atdf_sync(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers[0].results[0].x, Some(1));
        assert_eq!(result.wafers[0].results[0].y, Some(2));
    }

    #[test]
    fn sample_file_coordinateless_mixed_wafer() {
        // Hand-written fixture (sample_data/COORDLESS-LOT-01.atdf) — one
        // wafer, 6 positioned dies + 2 with blank PRR X/Y ("no position
        // reported"). See WMAP_ISSUES.md #39.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/COORDLESS-LOT-01.atdf");
        let result = parse_atdf_sync(path.to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        let dies = &result.wafers[0].results;
        assert_eq!(dies.len(), 8, "no die should be dropped");
        let positioned = dies.iter().filter(|d| d.x.is_some()).count();
        let unpositioned = dies.iter().filter(|d| d.x.is_none()).count();
        assert_eq!(positioned, 6);
        assert_eq!(unpositioned, 2);
        // Every unpositioned die still has a stable, unique die_index.
        let indices: std::collections::HashSet<_> =
            dies.iter().filter_map(|d| d.die_index).collect();
        assert_eq!(indices.len(), 2);
        // Real data survives — the whole point of keeping the die.
        assert!(dies.iter().all(|d| d.hbin.is_some()));
        assert!(dies.iter().all(|d| !d.test_values.is_empty()));
        let position_warning = result.warnings.iter().any(|w| w.contains("W01") && w.contains("position"));
        assert!(position_warning, "expected a position warning for W01: {:?}", result.warnings);
    }

    #[test]
    fn sample_file_multi_wafer() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03.atdf");
        let result = parse_atdf_sync(path.to_string()).unwrap();
        assert!(result.wafers.len() > 1, "expected multiple wafers");
        assert!(result.meta.get("lotId").is_some(), "expected lot ID");
        for w in &result.wafers {
            assert!(!w.results.is_empty(), "wafer {} has no dies", w.wafer_id);
        }
    }

    #[test]
    fn sample_file_single_wafer() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03_W01.atdf");
        let result = parse_atdf_sync(path.to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        assert!(!result.test_defs.is_empty(), "expected test defs");
    }

    // ── ATDF timestamp normalisation ──────────────────────────────────────────

    #[test]
    fn atdf_time_converts_spec_format_to_iso() {
        assert_eq!(atdf_time_to_iso("14:32:05 16-AUG-2026"), "2026-08-16T14:32:05Z");
        assert_eq!(atdf_time_to_iso("09:00:00 01-jan-2020"), "2020-01-01T09:00:00Z");
        assert_eq!(atdf_time_to_iso("  23:59:59 31-DEC-1999  "), "1999-12-31T23:59:59Z");
    }

    #[test]
    fn atdf_time_normalisation_makes_string_compare_chronological() {
        // The bug this guards: as raw ATDF text, "23:00:00 01-JAN-2020" sorts
        // AFTER "09:00:00 31-DEC-2026" because the hour leads the string.
        let early = atdf_time_to_iso("23:00:00 01-JAN-2020");
        let late = atdf_time_to_iso("09:00:00 31-DEC-2026");
        assert!(early < late, "{early} should compare before {late}");
        assert!("23:00:00 01-JAN-2020" > "09:00:00 31-DEC-2026", "raw form sorts wrongly");
    }

    #[test]
    fn atdf_time_passes_through_unrecognised_values() {
        // Our own generators write a bare "0"; vendors may use anything.
        assert_eq!(atdf_time_to_iso("0"), "0");
        assert_eq!(atdf_time_to_iso(""), "");
        assert_eq!(atdf_time_to_iso("not a time"), "not a time");
        assert_eq!(atdf_time_to_iso("25:00:00 16-AUG-2026"), "25:00:00 16-AUG-2026");
        assert_eq!(atdf_time_to_iso("14:32:05 16-XXX-2026"), "14:32:05 16-XXX-2026");
        assert_eq!(atdf_time_to_iso("14:32 16-AUG-2026"), "14:32 16-AUG-2026");
    }

    #[test]
    fn file_meta_picks_earliest_and_latest_across_wafers() {
        // Three wafers, deliberately out of order and crossing a day boundary
        // so an hour-of-day comparison would pick the wrong pair.
        let text = format!(
            "{}{}\
             WIR:1|09:00:00 02-FEB-2026|1|W01\nWRR:1|10:00:00 02-FEB-2026|1|W01|1||0|1\n\
             WIR:1|23:00:00 01-FEB-2026|1|W02\nWRR:1|23:30:00 01-FEB-2026|1|W02|1||0|1\n\
             WIR:1|11:00:00 03-FEB-2026|1|W03\nWRR:1|12:00:00 03-FEB-2026|1|W03|1||0|1\n",
            far(), mir_full(),
        );
        let meta = parse_atdf_file_meta(text.as_bytes()).unwrap();
        assert_eq!(meta.wafer_count, 3);
        assert_eq!(meta.earliest_start.as_deref(), Some("2026-02-01T23:00:00Z"));
        assert_eq!(meta.latest_finish.as_deref(), Some("2026-02-03T12:00:00Z"));
    }

    // ── File-meta fast scan: consistency against the full parse (ATDF twin of
    // parse_stdf.rs's own file_meta tests) ──────────────────────────────────

    #[test]
    fn file_meta_lot_fields_and_wafer_count_match_full_parse() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03.atdf");
        let bytes = std::fs::read(path).unwrap();
        let meta = parse_atdf_file_meta(&bytes).unwrap();
        let full = parse_atdf_from_bytes(&bytes).unwrap();
        assert_eq!(meta.lot_meta.get("lotId"), full.meta.get("lotId"));
        assert_eq!(meta.wafer_count as usize, full.wafers.len());
        assert!(full.wafers.len() > 1, "expected multiple wafers");
    }

    #[test]
    fn file_meta_wafer_count_matches_full_parse_for_coordinate_less_lot() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/COORDLESS-LOT-01.atdf");
        let bytes = std::fs::read(path).unwrap();
        let meta = parse_atdf_file_meta(&bytes).unwrap();
        let full = parse_atdf_from_bytes(&bytes).unwrap();
        assert_eq!(meta.wafer_count as usize, full.wafers.len());
    }

    #[test]
    fn file_meta_single_wafer() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03_W01.atdf");
        let bytes = std::fs::read(path).unwrap();
        let meta = parse_atdf_file_meta(&bytes).unwrap();
        assert_eq!(meta.wafer_count, 1);
        assert!(meta.lot_meta.get("lotId").is_some());
    }

    fn gz_of(src: &str) -> std::path::PathBuf {
        use std::io::Write;
        let bytes = std::fs::read(src).unwrap();
        let mut f = tempfile::Builder::new().suffix(".atdf.gz").tempfile().unwrap();
        let mut enc = flate2::write::GzEncoder::new(&mut f, flate2::Compression::default());
        enc.write_all(&bytes).unwrap();
        enc.finish().unwrap();
        f.into_temp_path().keep().unwrap()
    }

    #[test]
    fn gz_parsed_same_as_plain() {
        let plain_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03.atdf");
        let plain   = parse_atdf_sync(plain_path.to_string()).unwrap();
        let gz_path = gz_of(plain_path);
        let gz      = parse_atdf_sync(gz_path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(gz.wafers.len(), plain.wafers.len());
        assert_eq!(gz.meta.get("lotId"), plain.meta.get("lotId"));
        let plain_dies: usize = plain.wafers.iter().map(|w| w.results.len()).sum();
        let gz_dies:    usize = gz.wafers.iter().map(|w| w.results.len()).sum();
        assert_eq!(gz_dies, plain_dies);
    }

    // Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench --release -- --nocapture bench_parse_atdf
    #[cfg(feature = "bench")]
    #[test]
    fn bench_parse_atdf() {
        let path = "/tmp/bench.atdf";
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => { eprintln!("SKIP: {path} not found — run scripts/generate_atdf_bench.py"); return; }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;

        let _ = parse_atdf_from_bytes(&bytes).unwrap(); // warm
        let t = std::time::Instant::now();
        let result = parse_atdf_from_bytes(&bytes).unwrap();
        let ms = t.elapsed().as_millis();
        let dies: usize = result.wafers.iter().map(|w| w.results.len()).sum();
        println!(
            "\n=== bench_parse_atdf ({file_mb:.1} MB) ===\n\
             wafers: {}\ndies:   {dies}\ntests:  {}\ntotal:  {ms} ms\nthroughput: {:.0} MB/s",
            result.wafers.len(), result.test_defs.len(),
            file_mb / (ms as f64 / 1000.0).max(0.001),
        );
    }
}
