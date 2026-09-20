use std::collections::HashMap;
use std::sync::Arc;
use crate::types::*;
use crate::error::{ParseError, ParseResult};

fn nonempty(s: String) -> Option<String> {
    if s.is_empty() { None } else { Some(s) }
}

const SENTINEL_U4: u32 = 4_294_967_295;
const SENTINEL_I2: i16 = -32768;

// ── Metadata extraction (generic, all non-empty fields) ────────────────────────
// We emit every non-empty MIR/WIR/WRR field as a raw key/value pair. tsmap owns
// friendly labels and which fields to surface, so adding or relabelling a facet
// never requires republishing this crate. Keys are camelCase STDF field names.

// Read a sequence of Cn strings starting at `pos`, returning each in order. A
// truncated record yields empty strings for the missing trailing fields (Cn
// reader returns "" past end), so optional tail fields degrade gracefully.
struct CnSeq<'a> { b: &'a [u8], pos: usize }
impl<'a> CnSeq<'a> {
    fn new(b: &'a [u8], pos: usize) -> Self { Self { b, pos } }
    fn next(&mut self) -> String {
        let (s, p) = read_cn_str(self.b, self.pos);
        self.pos = p;
        s
    }
}

/// All non-empty lot-level fields from a MIR record body (STDF V4, 1·10).
/// Fixed prefix is 15 bytes: SETUP_T(U4) START_T(U4) STAT_NUM(U1) MODE_COD(C1)
/// RTST_COD(C1) PROT_COD(C1) BURN_TIM(U2) CMOD_COD(C1); then a run of Cn strings.
fn mir_fields(b: &[u8], o: ByteOrder) -> Vec<MetaField> {
    let mut f = Vec::new();
    // Timestamps → ISO 8601 (host truncates to date where it groups by date).
    push_field(&mut f, "setupT", read_u4(b, 0, o).and_then(epoch_to_iso));
    push_field(&mut f, "startT", read_u4(b, 4, o).and_then(epoch_to_iso));
    // Single-char code fields (STAT_NUM/MODE_COD/RTST_COD/PROT_COD/BURN_TIM/
    // CMOD_COD) are low-value and skipped; the Cn run begins at byte 15.
    let mut cn = CnSeq::new(b, 15);
    // Order matches the STDF V4 MIR Cn field sequence.
    push_field(&mut f, "lotId",      nonempty(cn.next())); // LOT_ID
    push_field(&mut f, "partType",   nonempty(cn.next())); // PART_TYP
    push_field(&mut f, "nodeName",   nonempty(cn.next())); // NODE_NAM
    push_field(&mut f, "testerType", nonempty(cn.next())); // TSTR_TYP
    push_field(&mut f, "jobName",    nonempty(cn.next())); // JOB_NAM
    push_field(&mut f, "jobRev",     nonempty(cn.next())); // JOB_REV
    push_field(&mut f, "sublotId",   nonempty(cn.next())); // SBLOT_ID
    push_field(&mut f, "operName",   nonempty(cn.next())); // OPER_NAM
    push_field(&mut f, "execType",   nonempty(cn.next())); // EXEC_TYP
    push_field(&mut f, "execVer",    nonempty(cn.next())); // EXEC_VER
    push_field(&mut f, "testCode",   nonempty(cn.next())); // TEST_COD
    push_field(&mut f, "testTemp",   nonempty(cn.next())); // TST_TEMP
    push_field(&mut f, "userText",   nonempty(cn.next())); // USER_TXT
    push_field(&mut f, "auxFile",    nonempty(cn.next())); // AUX_FILE
    push_field(&mut f, "packageType", nonempty(cn.next())); // PKG_TYP
    push_field(&mut f, "familyId",   nonempty(cn.next())); // FAMLY_ID
    push_field(&mut f, "dateCode",   nonempty(cn.next())); // DATE_COD
    push_field(&mut f, "facilityId", nonempty(cn.next())); // FACIL_ID
    push_field(&mut f, "floorId",    nonempty(cn.next())); // FLOOR_ID
    push_field(&mut f, "processId",  nonempty(cn.next())); // PROC_ID
    push_field(&mut f, "operFreq",   nonempty(cn.next())); // OPER_FRQ
    push_field(&mut f, "specName",   nonempty(cn.next())); // SPEC_NAM
    push_field(&mut f, "specVer",    nonempty(cn.next())); // SPEC_VER
    push_field(&mut f, "flowId",     nonempty(cn.next())); // FLOW_ID
    push_field(&mut f, "setupId",    nonempty(cn.next())); // SETUP_ID
    push_field(&mut f, "designRev",  nonempty(cn.next())); // DSGN_REV
    push_field(&mut f, "engId",      nonempty(cn.next())); // ENG_ID
    push_field(&mut f, "romCode",    nonempty(cn.next())); // ROM_COD
    push_field(&mut f, "serialNum",  nonempty(cn.next())); // SERL_NUM
    push_field(&mut f, "supervisorName", nonempty(cn.next())); // SUPR_NAM
    f
}

/// WIR record body (2·10): HEAD_NUM(U1) SITE_GRP(U1) START_T(U4) WAFER_ID(Cn).
struct WirData { wafer_id: String, fields: Vec<MetaField> }
fn decode_wir(b: &[u8], o: ByteOrder) -> WirData {
    let mut fields = Vec::new();
    push_field(&mut fields, "waferStartT", read_u4(b, 2, o).and_then(epoch_to_iso));
    let (wafer_id, _) = read_cn_str(b, 6);
    WirData { wafer_id, fields }
}

/// WRR record body (2·20): HEAD_NUM(U1) SITE_GRP(U1) FINISH_T(U4) PART_CNT(U4)
/// RTST_CNT(U4) ABRT_CNT(U4) GOOD_CNT(U4) FUNC_CNT(U4) WAFER_ID(Cn) FABWF_ID(Cn)
/// FRAME_ID(Cn) MASK_ID(Cn) USR_DESC(Cn) EXC_DESC(Cn).
struct WrrData { wafer_id: String, part_cnt: u32, good_cnt: u32, fields: Vec<MetaField> }
fn decode_wrr(b: &[u8], o: ByteOrder) -> WrrData {
    let part_cnt = read_u4(b, 6, o).unwrap_or(SENTINEL_U4);
    let good_cnt = read_u4(b, 18, o).unwrap_or(SENTINEL_U4);
    let mut cn = CnSeq::new(b, 26);
    let wafer_id = cn.next();           // WAFER_ID
    let fabwf_id = cn.next();           // FABWF_ID
    let frame_id = cn.next();           // FRAME_ID
    let mask_id  = cn.next();           // MASK_ID
    let usr_desc = cn.next();           // USR_DESC
    let exc_desc = cn.next();           // EXC_DESC
    let mut fields = Vec::new();
    push_field(&mut fields, "waferFinishT", read_u4(b, 2, o).and_then(epoch_to_iso));
    push_field(&mut fields, "fabWaferId", nonempty(fabwf_id));
    push_field(&mut fields, "frameId", nonempty(frame_id));
    push_field(&mut fields, "maskId",  nonempty(mask_id));
    push_field(&mut fields, "waferDescUser", nonempty(usr_desc));
    push_field(&mut fields, "waferDescExec", nonempty(exc_desc));
    WrrData { wafer_id, part_cnt, good_cnt, fields }
}

/// WCR record body (2·30), per the STDF V4 table: WAFR_SIZ(R4) DIE_HT(R4) DIE_WID(R4)
/// WF_UNITS(U1) WF_FLAT(C1) CENTER_X(I2) CENTER_Y(I2) POS_X(C1) POS_Y(C1) — 20 bytes.
/// There is no HEAD_NUM/SITE_GRP: until 2026-09-11 this read every field 2 bytes
/// late, expecting that prefix (see SPEC_CONFORMANCE.md). Fully fixed-width, no
/// Cn run — unlike MIR. STDF's own missing-value
/// conventions are applied before emitting (0 for R4, `SENTINEL_I2` for I2,
/// blank for C1), so a field the tester's software never populated is
/// omitted, not emitted as literal zero/sentinel data — the frontend treats
/// an omitted field as "nothing known," never as "this file says zero."
/// `wfUnits` is the one exception: `0` ("Unknown") is itself a meaningful
/// enum value here, not a missing-value sentinel, so it's always emitted
/// when present; the frontend decides not to use the accompanying
/// measurements when it sees `0`.
fn wcr_fields(b: &[u8], o: ByteOrder) -> Vec<MetaField> {
    let mut f = Vec::new();
    let r4_present = |v: Option<f32>| v.filter(|&x| x > 0.0);
    push_field(&mut f, "wafrSiz", r4_present(read_f32(b, 0, o)).map(|v| v.to_string()));
    push_field(&mut f, "dieHt",   r4_present(read_f32(b, 4, o)).map(|v| v.to_string()));
    push_field(&mut f, "dieWid",  r4_present(read_f32(b, 8, o)).map(|v| v.to_string()));
    push_field(&mut f, "wfUnits", b.get(12).map(|v| v.to_string()));
    push_field(&mut f, "wfFlat",  read_c1(b, 13));
    let i2_present = |v: Option<i16>| v.filter(|&x| x != SENTINEL_I2);
    push_field(&mut f, "centerX", i2_present(read_i2(b, 14, o)).map(|v| v.to_string()));
    push_field(&mut f, "centerY", i2_present(read_i2(b, 16, o)).map(|v| v.to_string()));
    push_field(&mut f, "posX", read_c1(b, 18));
    push_field(&mut f, "posY", read_c1(b, 19));
    f
}

/// VUR record body (0·30, STDF V4-2007): UPD_NAM(Cn), the version update name —
/// `"V4-2007"` for that revision. The record means the file may also hold records
/// only V4-2007 defines (PSR, NMR, CNR, SSR, SCR, STR); every dispatch skips those.
/// V4-2007 requires VUR straight after the FAR, i.e. BEFORE the MIR, so callers
/// must keep it apart from the MIR's fields rather than let a MIR overwrite it.
fn vur_fields(b: &[u8]) -> Vec<MetaField> {
    let mut f = Vec::new();
    let (upd_nam, _) = read_cn_str(b, 0);
    push_field(&mut f, "updNam", nonempty(upd_nam));
    f
}

/// HBR (1·40) / SBR (1·50) body — identical layout for both:
/// HEAD_NUM(U1) SITE_NUM(U1) BIN_NUM(U2) BIN_CNT(U4) BIN_PF(C1) BIN_NAM(Cn).
/// A real file commonly has several records per bin (one per site, plus a
/// lot-wide summary at HEAD_NUM/SITE_NUM 255) — callers accumulate into a
/// `HashMap<bin, name>` keyed by bin number, so a later record simply
/// overwrites an earlier one. Names aren't expected to vary across those
/// (they describe the bin, not the site), but nothing here assumes it.
fn decode_bin_record(b: &[u8], o: ByteOrder) -> BinRecord {
    let bin = read_u2(b, 2, o).unwrap_or(0) as u32;
    let pass = read_c1(b, 8).as_deref() == Some("P");
    let (name, _) = read_cn_str(b, 9);
    BinRecord { bin, name: nonempty(name), pass }
}

/// SDR record body (1·80): HEAD_NUM(U1) SITE_GRP(U1) SITE_CNT(U1) then
/// SITE_NUM array of SITE_CNT × U1, followed by descriptor Cn fields we ignore.
/// Returns (head_num, [site_num…]).
fn decode_sdr(b: &[u8]) -> (u32, Vec<u32>) {
    if b.len() < 3 { return (1, Vec::new()); }
    let head = b[0] as u32;
    let cnt = b[2] as usize;
    let mut sites = Vec::with_capacity(cnt);
    for i in 0..cnt {
        if let Some(&s) = b.get(3 + i) { sites.push(s as u32); }
    }
    (head, sites)
}

// ── Warnings ───────────────────────────────────────────────────────────────────


// ── Byte order ────────────────────────────────────────────────────────────────

/// STDF byte order, read from the FAR record's CPU_TYPE byte (1 = big-endian
/// legacy Sun/SPARC controllers; 2 = little-endian x86). Honoured per-file — a
/// Teradyne IG-XL floor can still emit either depending on its controller.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ByteOrder {
    Little,
    Big,
}

// ── Raw byte helpers ──────────────────────────────────────────────────────────

// All readers are bounds-checked and return None on a short slice, so a
// truncated record can never panic (in WASM a panic aborts the whole module).
// Multi-byte integers/floats honour the file's byte order.
#[inline(always)]
fn read_u4(b: &[u8], pos: usize, o: ByteOrder) -> Option<u32> {
    let a: [u8; 4] = b.get(pos..pos + 4)?.try_into().ok()?;
    Some(match o { ByteOrder::Little => u32::from_le_bytes(a), ByteOrder::Big => u32::from_be_bytes(a) })
}

#[inline(always)]
fn read_u2(b: &[u8], pos: usize, o: ByteOrder) -> Option<u16> {
    let a: [u8; 2] = b.get(pos..pos + 2)?.try_into().ok()?;
    Some(match o { ByteOrder::Little => u16::from_le_bytes(a), ByteOrder::Big => u16::from_be_bytes(a) })
}

#[inline(always)]
fn read_i2(b: &[u8], pos: usize, o: ByteOrder) -> Option<i16> {
    let a: [u8; 2] = b.get(pos..pos + 2)?.try_into().ok()?;
    Some(match o { ByteOrder::Little => i16::from_le_bytes(a), ByteOrder::Big => i16::from_be_bytes(a) })
}

#[inline(always)]
fn read_f32(b: &[u8], pos: usize, o: ByteOrder) -> Option<f32> {
    let bits = read_u4(b, pos, o)?;
    Some(f32::from_bits(bits))
}

/// Reads a single-character C*1 field (not a Cn string — no length prefix, just
/// one raw ASCII byte), treating blank (space or null) as absent — STDF's own
/// "unknown" convention for these fields (WCR's WF_FLAT/POS_X/POS_Y).
#[inline(always)]
fn read_c1(b: &[u8], pos: usize) -> Option<String> {
    let c = *b.get(pos)?;
    if c == 0 || c == b' ' { None } else { Some((c as char).to_string()) }
}

// ── Record framing ────────────────────────────────────────────────────────────

/// One STDF record: type/sub codes and a borrowed view of its body.
struct RawRecord<'a> {
    typ: u8,
    sub: u8,
    body: &'a [u8],
}

/// Borrowing iterator over STDF records in `bytes`. Header is
/// `[REC_LEN: U2][REC_TYP: U1][REC_SUB: U1]` followed by REC_LEN body bytes;
/// REC_LEN is read in the file's byte order. Stops at the first malformed/short
/// header (matching how a truncated file tails off). Pure borrow — no per-record
/// allocation, the body is a slice into the original buffer.
struct RecordIter<'a> {
    bytes: &'a [u8],
    pos: usize,
    order: ByteOrder,
}

impl<'a> RecordIter<'a> {
    fn next_record(&mut self) -> Option<RawRecord<'a>> {
        // Need at least a 4-byte header.
        if self.pos + 4 > self.bytes.len() { return None; }
        let len = read_u2(self.bytes, self.pos, self.order)? as usize;
        let typ = self.bytes[self.pos + 2];
        let sub = self.bytes[self.pos + 3];
        let body_start = self.pos + 4;
        let body_end = body_start + len;
        if body_end > self.bytes.len() { return None; } // truncated final record
        let body = &self.bytes[body_start..body_end];
        self.pos = body_end;
        Some(RawRecord { typ, sub, body })
    }
}

/// Read the FAR record to determine byte order and validate it's STDF V4. FAR is
/// always the first record: header `[REC_LEN][0][10]`, body `[CPU_TYPE][STDF_VER]`.
/// CPU_TYPE and the header type/sub are single bytes (byte-order-independent), so
/// we can read CPU_TYPE before knowing the order. CPU_TYPE: 1 = big-endian (legacy
/// Sun/SPARC), 2 = little-endian (x86). Other values are rejected.
fn detect_byte_order(bytes: &[u8]) -> ParseResult<ByteOrder> {
    // FAR header is 4 bytes, body is CPU_TYPE(1) + STDF_VER(1).
    if bytes.len() < 6 {
        return Err(ParseError::not_stdf("file too short to contain a FAR record"));
    }
    if bytes[2] != 0 || bytes[3] != 10 {
        return Err(ParseError::not_stdf("first record is not a FAR — not a valid STDF file"));
    }
    let cpu_type = bytes[4];
    match cpu_type {
        1 => Ok(ByteOrder::Big),
        2 => Ok(ByteOrder::Little),
        other => Err(ParseError::stdf_unsupported(
            format!("unsupported STDF CPU_TYPE {other} (expected 1=big-endian or 2=little-endian)"))),
    }
}

// Read a Cn (1-byte length + ASCII) and return (string, new_pos).
// Returns empty string if pos is at or past end.
fn read_cn_str(b: &[u8], pos: usize) -> (String, usize) {
    if pos >= b.len() {
        return (String::new(), pos);
    }
    let len = b[pos] as usize;
    let start = pos + 1;
    let end = (start + len).min(b.len());
    let s = std::str::from_utf8(&b[start..end]).unwrap_or("").to_string();
    (s, end)
}

// ── PIR/PRR direct parse ──────────────────────────────────────────────────────

#[inline(always)]
fn pir_head_site(b: &[u8]) -> Option<(u8, u8)> {
    if b.len() >= 2 { Some((b[0], b[1])) } else { None }
}

struct PrrFields {
    head: u8,
    site: u8,
    hard_bin: u16,
    soft_bin: u16,
    x: i16,
    y: i16,
    part_id: Option<u32>,
}

fn parse_prr(b: &[u8], o: ByteOrder) -> Option<PrrFields> {
    if b.len() < 14 { return None; }
    let head     = b[0];
    let site     = b[1];
    // b[2] = part_flg, b[3..5] = num_test
    let hard_bin = read_u2(b, 5, o)?;
    let soft_bin = read_u2(b, 7, o).unwrap_or(hard_bin);
    let x        = read_i2(b, 9, o).unwrap_or(SENTINEL_I2);
    let y        = read_i2(b, 11, o).unwrap_or(SENTINEL_I2);
    // test_t is 4 bytes at 13..17, then part_id as Cn at 17
    let part_id  = if b.len() > 17 {
        let (s, _) = read_cn_str(b, 17);
        s.parse::<u32>().ok()
    } else {
        None
    };
    Some(PrrFields { head, site, hard_bin, soft_bin, x, y, part_id })
}

// ── PTR/FTR fast path ─────────────────────────────────────────────────────────

// PTR layout: [0..4] test_num, [4] head, [5] site, [6] test_flg, [7] parm_flg,
//             [8..12] result (f32), [12..] test_txt (Cn), alarm_id (Cn),
//             optional fields (opt_flag, res_scal, llm_scal, hlm_scal, lo_limit, hi_limit, units, ...)
struct PtrFast {
    test_num: u32,
    head: u8,
    site: u8,
    failed: bool,
    /// Recorded pass/fail verdict from TEST_FLG: `None` when bit 6 (0x40,
    /// "no pass/fail indication") is set, else `Some(bit 7 == 0)`.
    pass: Option<bool>,
    result: f32,
}

/// TEST_FLG (shared PTR/FTR semantics): bit 6 (0x40) = no pass/fail indication
/// recorded; bit 7 (0x80) = test failed. Valid verdict only when bit 6 is clear.
#[inline(always)]
fn test_flg_pass(flg: u8) -> Option<bool> {
    if flg & 0x40 != 0 { None } else { Some(flg & 0x80 == 0) }
}

#[inline(always)]
fn parse_ptr_fast(b: &[u8], o: ByteOrder) -> Option<PtrFast> {
    if b.len() < 12 { return None; }
    Some(PtrFast {
        test_num: read_u4(b, 0, o)?,
        head:     b[4],
        site:     b[5],
        failed:   b[6] & 0x80 != 0,
        pass:     test_flg_pass(b[6]),
        result:   read_f32(b, 8, o)?,
    })
}

// Extract test_txt and optional lo/hi limits from a PTR raw record.
// Called only on the first occurrence of each test_num.
fn ptr_defs_from_raw(b: &[u8], o: ByteOrder) -> (String, Option<f64>, Option<f64>, Option<String>) {
    if b.len() < 12 {
        return (String::new(), None, None, None);
    }
    let (test_txt, pos) = read_cn_str(b, 12);
    let (_, pos) = read_cn_str(b, pos); // alarm_id
    if pos >= b.len() {
        return (test_txt, None, None, None);
    }
    let opt_flag = b[pos];
    let pos = pos + 1;
    if pos + 3 > b.len() {
        return (test_txt, None, None, None);
    }
    let pos = pos + 3; // skip res_scal, llm_scal, hlm_scal (1 byte each)
    // OPT_FLAG (STDF V4): bit 4 = LO_LIMIT invalid in this record (use the
    // default from the first PTR), bit 6 = no low limit for this test; bits 5/7
    // are the same for the high limit. Either makes the bytes here meaningless.
    // Only bits 6/7 mean "no limit" — see ptr_limits_explicitly_absent.
    let lo = if opt_flag & 0x50 == 0 {
        read_f32(b, pos, o).map(|v| v as f64)
    } else {
        None
    };
    let pos = pos + 4;
    let hi = if opt_flag & 0xA0 == 0 {
        read_f32(b, pos, o).map(|v| v as f64)
    } else {
        None
    };
    let pos = pos + 4;
    let units = if pos < b.len() {
        let (u, _) = read_cn_str(b, pos);
        if u.is_empty() { None } else { Some(u) }
    } else {
        None
    };
    (test_txt, lo, hi, units)
}

// Returns true if opt_flag is present in this PTR and explicitly marks both limits absent.
// opt_flag bit 6 = no lo_limit, bit 7 = no hi_limit.
fn ptr_limits_explicitly_absent(b: &[u8]) -> bool {
    if b.len() < 12 { return false; }
    let (_, pos) = read_cn_str(b, 12); // skip test_txt
    let (_, pos) = read_cn_str(b, pos); // skip alarm_id
    if pos >= b.len() { return false; }
    let opt_flag = b[pos];
    // Both absent bits set → no limits will ever appear for this test
    opt_flag & 0xC0 == 0xC0
}

// FTR layout: [0..4] test_num, [4] head, [5] site, [6] test_flg
// The returned verdict is `None` when TEST_FLG bit 6 marks it invalid — the
// caller records nothing then (never a fabricated fail).
#[inline(always)]
fn parse_ftr_fast(b: &[u8], o: ByteOrder) -> Option<(u32, u8, u8, Option<bool>)> {
    if b.len() < 7 { return None; }
    let test_num = read_u4(b, 0, o)?;
    let head = b[4];
    let site = b[5];
    Some((test_num, head, site, test_flg_pass(b[6])))
}

// FTR TEST_TXT is deep in the record after many fixed + variable-length fields.
// Layout (STDF V4 FTR, 1,20): TEST_NUM(U4) HEAD(U1) SITE(U1) TEST_FLG(B1)
// OPT_FLAG(B1), then five U4 counts (CYCL_CNT, REL_VADR, REPT_CNT, NUM_FAIL,
// XFAIL_AD i4, YFAIL_AD i4), VECT_OFF(i2), then four U2 array counts
// (RTN_ICNT, PGM_ICNT) which precede variable-length arrays… rather than decode
// all of that, we scan to TEST_TXT by walking the documented field sequence. In
// practice TEST_TXT only matters on the first occurrence of each test number, so
// this is cold. We bound-check every step and return "" if the record is short.
fn ftr_test_txt_from_raw(b: &[u8], o: ByteOrder) -> String {
    // Fixed head: TEST_NUM(4) HEAD(1) SITE(1) TEST_FLG(1) OPT_FLAG(1) = 8 bytes.
    if b.len() < 8 { return String::new(); }
    let opt_flag = b[7];
    let mut pos = 8usize;
    // Five U4 + two I4 conditional on OPT_FLAG, per the spec these are always
    // present as U4/I4 (15 bytes of fixed numerics): CYCL_CNT, REL_VADR,
    // REPT_CNT, NUM_FAIL, XFAIL_AD, YFAIL_AD, VECT_OFF.
    // CYCL_CNT U4, REL_VADR U4, REPT_CNT U4, NUM_FAIL U4 (4×4=16), XFAIL_AD I4,
    // YFAIL_AD I4 (2×4=8), VECT_OFF I2 (2) = 26 bytes.
    pos += 26;
    // RTN_ICNT (U2), PGM_ICNT (U2).
    let rtn_icnt = read_u2(b, pos, o).unwrap_or(0) as usize; pos += 2;
    let pgm_icnt = read_u2(b, pos, o).unwrap_or(0) as usize; pos += 2;
    // RTN_INDX: rtn_icnt × U2.
    pos += rtn_icnt * 2;
    // RTN_STAT: rtn_icnt nibbles → ceil(rtn_icnt/2) bytes.
    pos += rtn_icnt.div_ceil(2);
    // PGM_INDX: pgm_icnt × U2.
    pos += pgm_icnt * 2;
    // PGM_STAT: pgm_icnt nibbles → ceil(pgm_icnt/2) bytes.
    pos += pgm_icnt.div_ceil(2);
    // FAIL_PIN: Dn (bit-encoded) → U2 bit count + ceil(bits/8) bytes.
    if let Some(bits) = read_u2(b, pos, o) { pos += 2 + (bits as usize).div_ceil(8); } else { return String::new(); }
    // VECT_NAM(Cn), TIME_SET(Cn), OP_CODE(Cn): skip three Cn strings.
    let (_, p) = read_cn_str(b, pos); pos = p;
    let (_, p) = read_cn_str(b, pos); pos = p;
    let (_, p) = read_cn_str(b, pos); pos = p;
    // TEST_TXT(Cn).
    let _ = opt_flag; // opt_flag governs whether some counts are valid, not presence
    let (txt, _) = read_cn_str(b, pos);
    txt
}

// ── Per-site accumulator ──────────────────────────────────────────────────────

// Maps test_num → (slot_index, is_ftr). Built incrementally as new tests appear.
// slot_index is an index into pending_values[site].values.
struct TestIndex {
    map: HashMap<u32, usize>, // test_num → slot index
    order: Vec<u32>,          // slot index → test_num (for building DieResult)
}

impl TestIndex {
    fn new() -> Self {
        TestIndex { map: HashMap::new(), order: Vec::new() }
    }
    fn get_or_insert(&mut self, test_num: u32) -> usize {
        if let Some(&idx) = self.map.get(&test_num) {
            return idx;
        }
        let idx = self.order.len();
        self.map.insert(test_num, idx);
        self.order.push(test_num);
        idx
    }
    fn len(&self) -> usize { self.order.len() }
}

// Per-slot pass/fail channel encoding for SiteAccum::pass.
const PASS_ABSENT: u8 = 0;
const PASS_FAIL:   u8 = 1;
const PASS_PASS:   u8 = 2;

struct SiteAccum {
    values: Vec<f32>,   // NaN = not present / failed with result==0
    pass: Vec<u8>,      // PASS_ABSENT / PASS_FAIL / PASS_PASS, parallel to `values`
}

impl SiteAccum {
    fn new(capacity: usize) -> Self {
        SiteAccum { values: vec![f32::NAN; capacity], pass: vec![PASS_ABSENT; capacity] }
    }
    fn ensure_slot(&mut self, idx: usize) {
        if idx >= self.values.len() {
            self.values.resize(idx + 1, f32::NAN);
            self.pass.resize(idx + 1, PASS_ABSENT);
        }
    }
    fn set(&mut self, idx: usize, v: f32) {
        self.ensure_slot(idx);
        self.values[idx] = v;
    }
    fn set_pass(&mut self, idx: usize, passed: bool) {
        self.ensure_slot(idx);
        self.pass[idx] = if passed { PASS_PASS } else { PASS_FAIL };
    }
    fn reset(&mut self) {
        self.values.iter_mut().for_each(|v| *v = f32::NAN);
        self.pass.iter_mut().for_each(|p| *p = PASS_ABSENT);
    }
    fn to_test_values(&self, index: &TestIndex, test_defs_keys: &[Arc<str>]) -> HashMap<Arc<str>, f64> {
        // Count non-NaN entries first so we can pre-size the HashMap and avoid rehashing.
        let cap = self.values.iter().take(index.order.len()).filter(|v| !v.is_nan()).count();
        let mut out = HashMap::with_capacity(cap);
        for (i, _) in index.order.iter().enumerate() {
            let v = if i < self.values.len() { self.values[i] } else { f32::NAN };
            if !v.is_nan() {
                if let Some(key) = test_defs_keys.get(i) {
                    out.insert(key.clone(), v as f64);
                }
            }
        }
        out
    }
    fn to_test_pass(&self, index: &TestIndex, test_defs_keys: &[Arc<str>]) -> HashMap<Arc<str>, bool> {
        let cap = self.pass.iter().take(index.order.len()).filter(|p| **p != PASS_ABSENT).count();
        let mut out = HashMap::with_capacity(cap);
        for (i, _) in index.order.iter().enumerate() {
            let p = if i < self.pass.len() { self.pass[i] } else { PASS_ABSENT };
            if p != PASS_ABSENT {
                if let Some(key) = test_defs_keys.get(i) {
                    out.insert(key.clone(), p == PASS_PASS);
                }
            }
        }
        out
    }
}

// ── Main parser ───────────────────────────────────────────────────────────────

pub fn parse_stdf_from_bytes(bytes: &[u8]) -> ParseResult<ParsedStdf> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let order = detect_byte_order(bytes)?;
    let mut iter = RecordIter { bytes, pos: 0, order };

    let mut lots = LotRecords::default();
    let mut sites: Vec<SiteInfo> = Vec::new();
    let mut hbin_names: HashMap<u32, String> = HashMap::new();
    let mut sbin_names: HashMap<u32, String> = HashMap::new();
    let mut pass_hbins: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    // test_num → string key (cached to avoid re-formatting on every PTR)
    let mut test_num_to_key: HashMap<u32, String> = HashMap::new();
    // test_nums whose limits are fully resolved (both lo+hi found, or opt_flag confirms absent)
    let mut limits_resolved: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut wafers: Vec<WaferData> = Vec::new();
    let mut soft_bin_fabricated: usize = 0;
    let mut current_wafer: Option<WaferData> = None;
    // Per-wafer PRR-encounter ordinal — reset on each WIR, used as die_index
    // for a die that has no reported x/y (SENTINEL_I2 on either), so it still
    // has a stable identity downstream (unpositioned_<die_index>).
    let mut prr_index_in_wafer: u32 = 0;

    // Shared test index and per-site accumulators.
    // Key = (head_num, site_num).
    let mut test_index = TestIndex::new();
    let mut site_accums: HashMap<(u8, u8), SiteAccum> = HashMap::new();
    // test_num → ordered key string (parallel to test_index.order)
    let mut index_keys: Vec<Arc<str>> = Vec::new();

    while let Some(raw) = iter.next_record() {
        let (typ, sub) = (raw.typ, raw.sub);
        let b = raw.body;

        match (typ, sub) {
            // ── PTR ──────────────────────────────────────────────────────────
            (15, 10) => {
                let Some(ptr) = parse_ptr_fast(b, order) else { continue };
                let key = (ptr.head, ptr.site);

                // Register test def on first occurrence; update limits until resolved
                if !test_num_to_key.contains_key(&ptr.test_num) {
                    let key_str = ptr.test_num.to_string();
                    let (test_txt, lo, hi, units) = ptr_defs_from_raw(b, order);
                    let resolved = lo.is_some() || hi.is_some()
                        || ptr_limits_explicitly_absent(b);
                    if resolved { limits_resolved.insert(ptr.test_num); }
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "P".to_string(),
                        lo_limit: lo,
                        hi_limit: hi,
                        units,
                        ..Default::default()
                    });
                    let idx = test_index.get_or_insert(ptr.test_num);
                    while index_keys.len() <= idx {
                        index_keys.push(Arc::from(""));
                    }
                    index_keys[idx] = Arc::from(key_str.as_str());
                    test_num_to_key.insert(ptr.test_num, key_str);
                } else if !limits_resolved.contains(&ptr.test_num) {
                    // Limits not yet found — check this record
                    let (_, lo, hi, units) = ptr_defs_from_raw(b, order);
                    if lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b) {
                        limits_resolved.insert(ptr.test_num);
                        if let Some(key_str) = test_num_to_key.get(&ptr.test_num) {
                            if let Some(def) = test_defs.get_mut(key_str) {
                                if lo.is_some() { def.lo_limit = lo; }
                                if hi.is_some() { def.hi_limit = hi; }
                                if units.is_some() && def.units.is_none() { def.units = units; }
                            }
                        }
                    }
                }

                if let Some(accum) = site_accums.get_mut(&key) {
                    let idx = test_index.get_or_insert(ptr.test_num);
                    let value = if ptr.failed && ptr.result == 0.0 {
                        f32::NAN
                    } else {
                        ptr.result
                    };
                    accum.set(idx, value);
                    if let Some(p) = ptr.pass { accum.set_pass(idx, p); }
                }
            }

            // ── FTR ──────────────────────────────────────────────────────────
            (15, 20) => {
                let Some((test_num, head, site, pass)) = parse_ftr_fast(b, order) else { continue };
                let key = (head, site);

                if !test_num_to_key.contains_key(&test_num) {
                    let key_str = test_num.to_string();
                    let test_txt = ftr_test_txt_from_raw(b, order);
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "F".to_string(),
                        lo_limit: None,
                        hi_limit: None,
                        units: None,
                        ..Default::default()
                    });
                    let idx = test_index.get_or_insert(test_num);
                    while index_keys.len() <= idx {
                        index_keys.push(Arc::from(""));
                    }
                    index_keys[idx] = Arc::from(key_str.as_str());
                    test_num_to_key.insert(test_num, key_str);
                }

                // Functional outcomes are verdicts, not values — recorded on the
                // pass channel only (nothing when TEST_FLG marks no indication).
                if let Some(p) = pass {
                    if let Some(accum) = site_accums.get_mut(&key) {
                        let idx = test_index.get_or_insert(test_num);
                        accum.set_pass(idx, p);
                    }
                }
            }

            // ── PIR ──────────────────────────────────────────────────────────
            (5, 10) => {
                let Some((head, site)) = pir_head_site(b) else { continue };
                let key = (head, site);
                let cap = test_index.len().max(64);
                site_accums.entry(key).or_insert_with(|| SiteAccum::new(cap)).reset();
            }

            // ── PRR ──────────────────────────────────────────────────────────
            (5, 20) => {
                let Some(prr) = parse_prr(b, order) else { continue };
                let key = (prr.head, prr.site);
                // SENTINEL_I2 on X or Y is STDF's documented "no position
                // reported" marker — real data, not a parse failure, so the
                // die is kept (with x/y: None) rather than dropped.
                let unpositioned = prr.x == SENTINEL_I2 || prr.y == SENTINEL_I2;
                let (test_values, test_pass) = if let Some(accum) = site_accums.get(&key) {
                    (accum.to_test_values(&test_index, &index_keys),
                     accum.to_test_pass(&test_index, &index_keys))
                } else {
                    (HashMap::new(), HashMap::new())
                };
                if unpositioned {
                    site_accums.remove(&key);
                }
                if prr.soft_bin == 65535 { soft_bin_fabricated += 1; }
                let die_index = if unpositioned {
                    let idx = prr_index_in_wafer;
                    prr_index_in_wafer += 1;
                    Some(idx)
                } else {
                    None
                };
                let die = DieResult {
                    x: if unpositioned { None } else { Some(prr.x as i32) },
                    y: if unpositioned { None } else { Some(prr.y as i32) },
                    die_index,
                    hbin: Some(prr.hard_bin as u32),
                    sbin: Some(if prr.soft_bin == 65535 {
                        prr.hard_bin as u32
                    } else {
                        prr.soft_bin as u32
                    }),
                    site_num: Some(prr.site as u32),
                    part_id: prr.part_id,
                    test_values,
                    test_pass,
                };
                if current_wafer.is_none() {
                    prr_index_in_wafer = 0;
                    current_wafer = Some(WaferData {
                        wafer_id: format!("W{}", wafers.len() + 1),
                        results: Vec::new(),
                        part_count: None,
                        good_count: None,
                        fail_count: None,
                        fields: Vec::new(),
                    });
                }
                if let Some(ref mut wafer) = current_wafer {
                    wafer.results.push(die);
                }
            }

            // ── Structural records (cold: a handful per file) ─────────────
            (1, 10) => { // MIR — the lot for the wafers that follow (see LotRecords)
                lots.set_lot(mir_fields(b, order));
            }
            // WCR conventionally follows MIR in the stream (SEMI E10/STDF V4:
            // "may appear anywhere between the MIR and the MRR, typically near
            // the beginning") — extend rather than replace, so it never
            // depends on arriving before MIR's own assignment above.
            (2, 30) => { // WCR
                lots.extend_file(wcr_fields(b, order));
            }
            (0, 30) => { // VUR (V4-2007) — file-level, and precedes the MIR
                lots.extend_file(vur_fields(b));
            }
            (1, 80) => { // SDR
                let (head, site_nums) = decode_sdr(b);
                for site in site_nums {
                    sites.push(SiteInfo { head_num: head, site_num: site });
                }
            }
            (2, 10) => { // WIR
                let wir = decode_wir(b, order);
                prr_index_in_wafer = 0;
                current_wafer = Some(WaferData {
                    wafer_id: if wir.wafer_id.is_empty() {
                        format!("W{}", wafers.len() + 1)
                    } else {
                        wir.wafer_id
                    },
                    results: Vec::new(),
                    part_count: None,
                    good_count: None,
                    fail_count: None,
                    fields: wir.fields,
                });
            }
            (2, 20) => { // WRR
                if let Some(mut wafer) = current_wafer.take() {
                    let wrr = decode_wrr(b, order);
                    wafer.fields.extend(wrr.fields);
                    if !wrr.wafer_id.is_empty() {
                        wafer.wafer_id = wrr.wafer_id;
                    }
                    wafer.part_count = if wrr.part_cnt != SENTINEL_U4 { Some(wrr.part_cnt) } else { None };
                    wafer.good_count = if wrr.good_cnt != SENTINEL_U4 { Some(wrr.good_cnt) } else { None };
                    wafer.fail_count = if wrr.good_cnt != SENTINEL_U4 && wrr.part_cnt != SENTINEL_U4 {
                        Some(wrr.part_cnt.saturating_sub(wrr.good_cnt))
                    } else {
                        None
                    };
                    lots.push_wafer(&mut wafers, wafer);
                }
            }
            (1, 40) => { // HBR
                let hbr = decode_bin_record(b, order);
                if let Some(name) = hbr.name { hbin_names.insert(hbr.bin, name); }
                if hbr.pass { pass_hbins.insert(hbr.bin); }
            }
            (1, 50) => { // SBR
                let sbr = decode_bin_record(b, order);
                if let Some(name) = sbr.name { sbin_names.insert(sbr.bin, name); }
            }
            _ => {}
        }
    }

    if let Some(wafer) = current_wafer.take() {
        if !wafer.results.is_empty() {
            lots.push_wafer(&mut wafers, wafer);
        }
    }

    let mut warnings = soft_bin_warnings(soft_bin_fabricated);
    warnings.extend(position_warnings(&wafers));
    let meta = lots.finish(&mut wafers, &mut warnings);
    let hbin_defs = finish_bin_defs(hbin_names);
    let sbin_defs = finish_bin_defs(sbin_names);
    let mut pass_hbins: Vec<u32> = pass_hbins.into_iter().collect();
    pass_hbins.sort_unstable();
    Ok(ParsedStdf { meta, wafers, test_defs, sites, hbin_defs, sbin_defs, pass_hbins, warnings })
}

#[cfg(feature = "native")]
pub fn parse_stdf_sync(path: String) -> ParseResult<ParsedStdf> {
    let bytes = crate::read_file::read_bytes(&path)?;
    parse_stdf_from_bytes(&bytes)
}

// ── First-pass test name scan ─────────────────────────────────────────────────

/// Scans the file for PTR/FTR records only, collecting test names and limits.
/// Does not accumulate die results. Used to populate the test selector overlay
/// before the full parse. Returns a flat map of test_num string → TestDef.
pub fn parse_stdf_test_names(bytes: &[u8]) -> ParseResult<crate::types::ScanResult> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let order = detect_byte_order(bytes)?;
    let mut iter = RecordIter { bytes, pos: 0, order };

    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    let mut test_num_to_key: HashMap<u32, String> = HashMap::new();
    let mut limits_resolved: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut pir_count: u32 = 0;

    while let Some(raw) = iter.next_record() {
        let b = raw.body;
        match (raw.typ, raw.sub) {
            (5, 10) => { pir_count += 1; }
            (15, 10) => {
                let Some(test_num) = read_u4(b, 0, order) else { continue; };
                if !test_num_to_key.contains_key(&test_num) {
                    let key_str = test_num.to_string();
                    let (test_txt, lo, hi, units) = ptr_defs_from_raw(b, order);
                    let resolved = lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b);
                    if resolved { limits_resolved.insert(test_num); }
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "P".to_string(),
                        lo_limit: lo,
                        hi_limit: hi,
                        units,
                        ..Default::default()
                    });
                    test_num_to_key.insert(test_num, key_str);
                } else if !limits_resolved.contains(&test_num) {
                    let (_, lo, hi, units) = ptr_defs_from_raw(b, order);
                    if lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b) {
                        limits_resolved.insert(test_num);
                        if let Some(key_str) = test_num_to_key.get(&test_num) {
                            if let Some(def) = test_defs.get_mut(key_str) {
                                if lo.is_some() { def.lo_limit = lo; }
                                if hi.is_some() { def.hi_limit = hi; }
                                if units.is_some() && def.units.is_none() { def.units = units; }
                            }
                        }
                    }
                }
            }
            (15, 20) => {
                let Some(test_num) = read_u4(b, 0, order) else { continue; };
                if !test_num_to_key.contains_key(&test_num) {
                    let key_str = test_num.to_string();
                    let test_txt = ftr_test_txt_from_raw(b, order);
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "F".to_string(),
                        lo_limit: None,
                        hi_limit: None,
                        units: None,
                        ..Default::default()
                    });
                    test_num_to_key.insert(test_num, key_str);
                }
            }
            _ => {}
        }
    }

    Ok(crate::types::ScanResult { test_defs, die_count: pir_count })
}

/// Fast metadata-only scan for the file-filter table (WMAP_ISSUES-adjacent
/// feature, not test-selection related — see `crate::types::FileMeta`'s own
/// doc comment). Matches only MIR/SDR/WIR/WRR and otherwise relies on
/// `RecordIter::next_record`'s existing length-prefixed skip to pass over
/// every PTR/FTR/PIR/PRR without decoding a single one — this is the same
/// skip every record type already gets when a scan doesn't match on it, so
/// walking as far as the last WRR costs "skip N more record headers," not
/// new per-record work.
pub fn parse_stdf_file_meta(bytes: &[u8]) -> ParseResult<crate::types::FileMeta> {
    // Transparently unwrap a .gz container — see read_file::maybe_gunzip.
    // Borrows (no copy) when the input isn't gzipped.
    let bytes = crate::read_file::maybe_gunzip(bytes)?;
    let bytes: &[u8] = &bytes;
    let order = detect_byte_order(bytes)?;
    let mut iter = RecordIter { bytes, pos: 0, order };

    let mut lot_meta = LotMeta::default();
    let mut wafer_count: u32 = 0;
    let mut earliest_start: Option<String> = None;
    let mut latest_finish: Option<String> = None;
    let mut site_nums: std::collections::HashSet<u32> = std::collections::HashSet::new();
    // File-level fields kept apart from the MIR's, which are assigned outright:
    // VUR precedes the MIR, so folding it in first would be overwritten.
    let mut file_fields: Vec<MetaField> = Vec::new();

    while let Some(raw) = iter.next_record() {
        let b = raw.body;
        match (raw.typ, raw.sub) {
            (1, 10) => { lot_meta.fields = mir_fields(b, order); } // MIR
            (0, 30) => { file_fields.extend(vur_fields(b)); } // VUR (V4-2007)
            (1, 80) => { // SDR
                let (_, sites) = decode_sdr(b);
                site_nums.extend(sites);
            }
            (2, 10) => { // WIR
                wafer_count += 1;
                let wir = decode_wir(b, order);
                if let Some(t) = wir.fields.iter().find(|f| f.key == "waferStartT").map(|f| f.value.clone()) {
                    if earliest_start.as_deref().map_or(true, |cur| t.as_str() < cur) {
                        earliest_start = Some(t);
                    }
                }
            }
            (2, 20) => { // WRR
                let wrr = decode_wrr(b, order);
                if let Some(t) = wrr.fields.iter().find(|f| f.key == "waferFinishT").map(|f| f.value.clone()) {
                    if latest_finish.as_deref().map_or(true, |cur| t.as_str() > cur) {
                        latest_finish = Some(t);
                    }
                }
            }
            _ => {}
        }
    }

    lot_meta.fields.extend(file_fields);
    Ok(crate::types::FileMeta {
        lot_meta,
        wafer_count,
        earliest_start,
        latest_finish,
        site_count: if site_nums.is_empty() { None } else { Some(site_nums.len() as u32) },
    })
}

// ── Filtered parse ────────────────────────────────────────────────────────────

/// Like `parse_stdf_from_bytes` but skips die accumulation for test numbers not
/// in `selected`. Test defs are still registered for all tests so the result's
/// `test_defs` map remains complete; only `test_values` per die is filtered.
pub fn parse_stdf_from_bytes_filtered(
    bytes: &[u8],
    selected: &std::collections::HashSet<u32>,
) -> ParseResult<ParsedStdf> {
    let order = detect_byte_order(bytes)?;
    let mut iter = RecordIter { bytes, pos: 0, order };

    let mut lots = LotRecords::default();
    let mut sites: Vec<SiteInfo> = Vec::new();
    let mut hbin_names: HashMap<u32, String> = HashMap::new();
    let mut sbin_names: HashMap<u32, String> = HashMap::new();
    let mut pass_hbins: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    let mut test_num_to_key: HashMap<u32, String> = HashMap::new();
    let mut limits_resolved: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut wafers: Vec<WaferData> = Vec::new();
    let mut soft_bin_fabricated: usize = 0;
    let mut current_wafer: Option<WaferData> = None;
    let mut prr_index_in_wafer: u32 = 0;
    let mut test_index = TestIndex::new();
    let mut site_accums: HashMap<(u8, u8), SiteAccum> = HashMap::new();
    let mut index_keys: Vec<Arc<str>> = Vec::new();

    while let Some(raw) = iter.next_record() {
        let (typ, sub) = (raw.typ, raw.sub);
        let b = raw.body;

        match (typ, sub) {
            (15, 10) => {
                let Some(ptr) = parse_ptr_fast(b, order) else { continue };
                let key = (ptr.head, ptr.site);

                // Always register/update test def regardless of selection
                if !test_num_to_key.contains_key(&ptr.test_num) {
                    let key_str = ptr.test_num.to_string();
                    let (test_txt, lo, hi, units) = ptr_defs_from_raw(b, order);
                    let resolved = lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b);
                    if resolved { limits_resolved.insert(ptr.test_num); }
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "P".to_string(),
                        lo_limit: lo,
                        hi_limit: hi,
                        units,
                        ..Default::default()
                    });
                    test_num_to_key.insert(ptr.test_num, key_str.clone());
                    // Only add to the accumulation index if this test is selected
                    if selected.contains(&ptr.test_num) {
                        let idx = test_index.get_or_insert(ptr.test_num);
                        while index_keys.len() <= idx { index_keys.push(Arc::from("")); }
                        index_keys[idx] = Arc::from(key_str.as_str());
                    }
                } else if !limits_resolved.contains(&ptr.test_num) {
                    let (_, lo, hi, units) = ptr_defs_from_raw(b, order);
                    if lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b) {
                        limits_resolved.insert(ptr.test_num);
                        if let Some(key_str) = test_num_to_key.get(&ptr.test_num) {
                            if let Some(def) = test_defs.get_mut(key_str) {
                                if lo.is_some() { def.lo_limit = lo; }
                                if hi.is_some() { def.hi_limit = hi; }
                                if units.is_some() && def.units.is_none() { def.units = units; }
                            }
                        }
                    }
                }

                // Skip accumulation for unselected tests
                if !selected.contains(&ptr.test_num) { continue; }

                if let Some(accum) = site_accums.get_mut(&key) {
                    let idx = test_index.get_or_insert(ptr.test_num);
                    let value = if ptr.failed && ptr.result == 0.0 { f32::NAN } else { ptr.result };
                    accum.set(idx, value);
                    if let Some(p) = ptr.pass { accum.set_pass(idx, p); }
                }
            }

            (15, 20) => {
                let Some((test_num, head, site, pass)) = parse_ftr_fast(b, order) else { continue };
                let key = (head, site);

                if !test_num_to_key.contains_key(&test_num) {
                    let key_str = test_num.to_string();
                    let test_txt = ftr_test_txt_from_raw(b, order);
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt,
                        test_type: "F".to_string(),
                        lo_limit: None,
                        hi_limit: None,
                        units: None,
                        ..Default::default()
                    });
                    test_num_to_key.insert(test_num, key_str.clone());
                    // Only add to the accumulation index if this test is selected
                    if selected.contains(&test_num) {
                        let idx = test_index.get_or_insert(test_num);
                        while index_keys.len() <= idx { index_keys.push(Arc::from("")); }
                        index_keys[idx] = Arc::from(key_str.as_str());
                    }
                }

                // Skip accumulation for unselected tests
                if !selected.contains(&test_num) { continue; }

                // Functional outcomes are verdicts, not values — pass channel only.
                if let Some(p) = pass {
                    if let Some(accum) = site_accums.get_mut(&key) {
                        let idx = test_index.get_or_insert(test_num);
                        accum.set_pass(idx, p);
                    }
                }
            }

            (5, 10) => {
                let Some((head, site)) = pir_head_site(b) else { continue };
                let key = (head, site);
                let cap = test_index.len().max(64);
                site_accums.entry(key).or_insert_with(|| SiteAccum::new(cap)).reset();
            }

            (5, 20) => {
                let Some(prr) = parse_prr(b, order) else { continue };
                let key = (prr.head, prr.site);
                // SENTINEL_I2 on X or Y is STDF's documented "no position
                // reported" marker — real data, not a parse failure, so the
                // die is kept (with x/y: None) rather than dropped.
                let unpositioned = prr.x == SENTINEL_I2 || prr.y == SENTINEL_I2;
                let (test_values, test_pass) = if let Some(accum) = site_accums.get(&key) {
                    (accum.to_test_values(&test_index, &index_keys),
                     accum.to_test_pass(&test_index, &index_keys))
                } else {
                    (HashMap::new(), HashMap::new())
                };
                if unpositioned {
                    site_accums.remove(&key);
                }
                if prr.soft_bin == 65535 { soft_bin_fabricated += 1; }
                let die_index = if unpositioned {
                    let idx = prr_index_in_wafer;
                    prr_index_in_wafer += 1;
                    Some(idx)
                } else {
                    None
                };
                let die = DieResult {
                    x: if unpositioned { None } else { Some(prr.x as i32) },
                    y: if unpositioned { None } else { Some(prr.y as i32) },
                    die_index,
                    hbin: Some(prr.hard_bin as u32),
                    sbin: Some(if prr.soft_bin == 65535 {
                        prr.hard_bin as u32
                    } else {
                        prr.soft_bin as u32
                    }),
                    site_num: Some(prr.site as u32),
                    part_id: prr.part_id,
                    test_values,
                    test_pass,
                };
                if current_wafer.is_none() {
                    prr_index_in_wafer = 0;
                    current_wafer = Some(WaferData {
                        wafer_id: format!("W{}", wafers.len() + 1),
                        results: Vec::new(),
                        part_count: None,
                        good_count: None,
                        fail_count: None,
                        fields: Vec::new(),
                    });
                }
                if let Some(ref mut wafer) = current_wafer { wafer.results.push(die); }
            }

            (1, 10) => { // MIR — the lot for the wafers that follow (see LotRecords)
                lots.set_lot(mir_fields(b, order));
            }
            (2, 30) => { // WCR — see the full-parse dispatch's own comment on ordering.
                lots.extend_file(wcr_fields(b, order));
            }
            (0, 30) => { // VUR (V4-2007) — see vur_fields.
                lots.extend_file(vur_fields(b));
            }
            (1, 80) => { // SDR
                let (head, site_nums) = decode_sdr(b);
                for site in site_nums {
                    sites.push(SiteInfo { head_num: head, site_num: site });
                }
            }
            (2, 10) => { // WIR
                let wir = decode_wir(b, order);
                prr_index_in_wafer = 0;
                current_wafer = Some(WaferData {
                    wafer_id: if wir.wafer_id.is_empty() {
                        format!("W{}", wafers.len() + 1)
                    } else {
                        wir.wafer_id
                    },
                    results: Vec::new(),
                    part_count: None,
                    good_count: None,
                    fail_count: None,
                    fields: wir.fields,
                });
            }
            (2, 20) => { // WRR
                if let Some(mut wafer) = current_wafer.take() {
                    let wrr = decode_wrr(b, order);
                    wafer.fields.extend(wrr.fields);
                    if !wrr.wafer_id.is_empty() { wafer.wafer_id = wrr.wafer_id; }
                    wafer.part_count = if wrr.part_cnt != SENTINEL_U4 { Some(wrr.part_cnt) } else { None };
                    wafer.good_count = if wrr.good_cnt != SENTINEL_U4 { Some(wrr.good_cnt) } else { None };
                    wafer.fail_count = if wrr.good_cnt != SENTINEL_U4 && wrr.part_cnt != SENTINEL_U4 {
                        Some(wrr.part_cnt.saturating_sub(wrr.good_cnt))
                    } else {
                        None
                    };
                    lots.push_wafer(&mut wafers, wafer);
                }
            }
            (1, 40) => { // HBR
                let hbr = decode_bin_record(b, order);
                if let Some(name) = hbr.name { hbin_names.insert(hbr.bin, name); }
                if hbr.pass { pass_hbins.insert(hbr.bin); }
            }
            (1, 50) => { // SBR
                let sbr = decode_bin_record(b, order);
                if let Some(name) = sbr.name { sbin_names.insert(sbr.bin, name); }
            }
            _ => {}
        }
    }

    if let Some(wafer) = current_wafer.take() {
        if !wafer.results.is_empty() { lots.push_wafer(&mut wafers, wafer); }
    }

    let mut warnings = soft_bin_warnings(soft_bin_fabricated);
    warnings.extend(position_warnings(&wafers));
    let meta = lots.finish(&mut wafers, &mut warnings);
    let hbin_defs = finish_bin_defs(hbin_names);
    let sbin_defs = finish_bin_defs(sbin_names);
    let mut pass_hbins: Vec<u32> = pass_hbins.into_iter().collect();
    pass_hbins.sort_unstable();
    Ok(ParsedStdf { meta, wafers, test_defs, sites, hbin_defs, sbin_defs, pass_hbins, warnings })
}

// ── Phased timing (bench feature only) ───────────────────────────────────────

#[cfg(feature = "bench")]
pub struct ParseTiming {
    /// Time spent in the RawDataIter loop excluding to_test_values calls (ms)
    pub p1_iter_ms: u128,
    /// Time spent in to_test_values HashMap construction across all PRR records (ms)
    pub p2_hashmap_ms: u128,
    pub die_count: usize,
    pub test_count: usize,
}

/// Identical to `parse_stdf_from_bytes` but instruments P1 (record iteration)
/// and P2 (per-die HashMap construction) separately.
/// Only available with `--features bench`; the normal hot path is untouched.
#[cfg(feature = "bench")]
pub fn parse_stdf_from_bytes_timed(bytes: &[u8]) -> ParseResult<(ParsedStdf, ParseTiming)> {
    use std::time::Instant;

    let order = detect_byte_order(bytes)?;
    let mut iter = RecordIter { bytes, pos: 0, order };

    let mut lots = LotRecords::default();
    let mut sites: Vec<SiteInfo> = Vec::new();
    let mut test_defs: HashMap<String, TestDef> = HashMap::new();
    let mut test_num_to_key: HashMap<u32, String> = HashMap::new();
    let mut limits_resolved: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut wafers: Vec<WaferData> = Vec::new();
    let mut soft_bin_fabricated: usize = 0;
    let mut current_wafer: Option<WaferData> = None;
    let mut prr_index_in_wafer: u32 = 0;
    let mut test_index = TestIndex::new();
    let mut site_accums: HashMap<(u8, u8), SiteAccum> = HashMap::new();
    let mut index_keys: Vec<Arc<str>> = Vec::new();

    let mut p2_hashmap_ns: u128 = 0;
    let mut die_count: usize = 0;

    let loop_start = Instant::now();

    while let Some(raw) = iter.next_record() {
        let (typ, sub) = (raw.typ, raw.sub);
        let b = raw.body;

        match (typ, sub) {
            (15, 10) => {
                let Some(ptr) = parse_ptr_fast(b, order) else { continue };
                let key = (ptr.head, ptr.site);
                if !test_num_to_key.contains_key(&ptr.test_num) {
                    let key_str = ptr.test_num.to_string();
                    let (test_txt, lo, hi, units) = ptr_defs_from_raw(b, order);
                    let resolved = lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b);
                    if resolved { limits_resolved.insert(ptr.test_num); }
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt, test_type: "P".to_string(),
                        lo_limit: lo, hi_limit: hi, units,
                        ..Default::default()
                    });
                    let idx = test_index.get_or_insert(ptr.test_num);
                    while index_keys.len() <= idx { index_keys.push(Arc::from("")); }
                    index_keys[idx] = Arc::from(key_str.as_str());
                    test_num_to_key.insert(ptr.test_num, key_str);
                } else if !limits_resolved.contains(&ptr.test_num) {
                    let (_, lo, hi, units) = ptr_defs_from_raw(b, order);
                    if lo.is_some() || hi.is_some() || ptr_limits_explicitly_absent(b) {
                        limits_resolved.insert(ptr.test_num);
                        if let Some(key_str) = test_num_to_key.get(&ptr.test_num) {
                            if let Some(def) = test_defs.get_mut(key_str) {
                                if lo.is_some() { def.lo_limit = lo; }
                                if hi.is_some() { def.hi_limit = hi; }
                                if units.is_some() && def.units.is_none() { def.units = units; }
                            }
                        }
                    }
                }
                if let Some(accum) = site_accums.get_mut(&key) {
                    let idx = test_index.get_or_insert(ptr.test_num);
                    let value = if ptr.failed && ptr.result == 0.0 { f32::NAN } else { ptr.result };
                    accum.set(idx, value);
                    if let Some(p) = ptr.pass { accum.set_pass(idx, p); }
                }
            }
            (15, 20) => {
                let Some((test_num, head, site, pass)) = parse_ftr_fast(b, order) else { continue };
                let key = (head, site);
                if !test_num_to_key.contains_key(&test_num) {
                    let key_str = test_num.to_string();
                    let test_txt = ftr_test_txt_from_raw(b, order);
                    test_defs.insert(key_str.clone(), TestDef {
                        name: test_txt, test_type: "F".to_string(),
                        lo_limit: None, hi_limit: None, units: None,
                        ..Default::default()
                    });
                    let idx = test_index.get_or_insert(test_num);
                    while index_keys.len() <= idx { index_keys.push(Arc::from("")); }
                    index_keys[idx] = Arc::from(key_str.as_str());
                    test_num_to_key.insert(test_num, key_str);
                }
                // Functional outcomes are verdicts, not values — pass channel only.
                if let Some(p) = pass {
                    if let Some(accum) = site_accums.get_mut(&key) {
                        let idx = test_index.get_or_insert(test_num);
                        accum.set_pass(idx, p);
                    }
                }
            }
            (5, 10) => {
                let Some((head, site)) = pir_head_site(b) else { continue };
                let key = (head, site);
                let cap = test_index.len().max(64);
                site_accums.entry(key).or_insert_with(|| SiteAccum::new(cap)).reset();
            }
            (5, 20) => {
                let Some(prr) = parse_prr(b, order) else { continue };
                let key = (prr.head, prr.site);
                let unpositioned = prr.x == SENTINEL_I2 || prr.y == SENTINEL_I2;
                let t_hmap = Instant::now();
                let (test_values, test_pass) = if let Some(accum) = site_accums.get(&key) {
                    (accum.to_test_values(&test_index, &index_keys),
                     accum.to_test_pass(&test_index, &index_keys))
                } else {
                    (HashMap::new(), HashMap::new())
                };
                if unpositioned {
                    site_accums.remove(&key);
                }
                p2_hashmap_ns += t_hmap.elapsed().as_nanos();
                die_count += 1;
                if prr.soft_bin == 65535 { soft_bin_fabricated += 1; }
                let die_index = if unpositioned {
                    let idx = prr_index_in_wafer;
                    prr_index_in_wafer += 1;
                    Some(idx)
                } else {
                    None
                };
                let die = DieResult {
                    x: if unpositioned { None } else { Some(prr.x as i32) },
                    y: if unpositioned { None } else { Some(prr.y as i32) },
                    die_index,
                    hbin: Some(prr.hard_bin as u32),
                    sbin: Some(if prr.soft_bin == 65535 { prr.hard_bin as u32 } else { prr.soft_bin as u32 }),
                    site_num: Some(prr.site as u32),
                    part_id: prr.part_id,
                    test_values,
                    test_pass,
                };
                if current_wafer.is_none() {
                    prr_index_in_wafer = 0;
                    current_wafer = Some(WaferData {
                        wafer_id: format!("W{}", wafers.len() + 1),
                        results: Vec::new(), part_count: None, good_count: None, fail_count: None,
                        fields: Vec::new(),
                    });
                }
                if let Some(ref mut wafer) = current_wafer { wafer.results.push(die); }
            }
            // MIR — the lot for the wafers that follow. Goes through
            // LotRecords like the full and filtered dispatches above: this
            // arm was left assigning a bare `meta.fields` when afaffa9 moved
            // lot metadata onto the accumulator, which broke every `bench`
            // build (see the equivalence test below).
            (1, 10) => { lots.set_lot(mir_fields(b, order)); }
            (1, 80) => {
                let (head, site_nums) = decode_sdr(b);
                for site in site_nums { sites.push(SiteInfo { head_num: head, site_num: site }); }
            }
            (2, 10) => {
                let wir = decode_wir(b, order);
                prr_index_in_wafer = 0;
                current_wafer = Some(WaferData {
                    wafer_id: if wir.wafer_id.is_empty() { format!("W{}", wafers.len() + 1) } else { wir.wafer_id },
                    results: Vec::new(), part_count: None, good_count: None, fail_count: None,
                    fields: Vec::new(),
                });
            }
            (2, 20) => {
                if let Some(mut wafer) = current_wafer.take() {
                    let wrr = decode_wrr(b, order);
                    if !wrr.wafer_id.is_empty() { wafer.wafer_id = wrr.wafer_id; }
                    wafer.part_count = if wrr.part_cnt != SENTINEL_U4 { Some(wrr.part_cnt) } else { None };
                    wafer.good_count = if wrr.good_cnt != SENTINEL_U4 { Some(wrr.good_cnt) } else { None };
                    wafer.fail_count = if wrr.good_cnt != SENTINEL_U4 && wrr.part_cnt != SENTINEL_U4 {
                        Some(wrr.part_cnt.saturating_sub(wrr.good_cnt))
                    } else { None };
                    lots.push_wafer(&mut wafers, wafer);
                }
            }
            _ => {}
        }
    }

    let loop_total_ms = loop_start.elapsed().as_millis();
    let p2_ms = p2_hashmap_ns / 1_000_000;

    if let Some(wafer) = current_wafer.take() {
        if !wafer.results.is_empty() { lots.push_wafer(&mut wafers, wafer); }
    }

    let timing = ParseTiming {
        p1_iter_ms: loop_total_ms.saturating_sub(p2_ms),
        p2_hashmap_ms: p2_ms,
        die_count,
        test_count: test_index.len(),
    };

    let mut warnings = soft_bin_warnings(soft_bin_fabricated);
    warnings.extend(position_warnings(&wafers));
    let meta = lots.finish(&mut wafers, &mut warnings);
    // Bench-only path deliberately skips HBR/SBR (and WIR/WRR field
    // extraction, see above) — it measures raw parse throughput, not
    // metadata completeness.
    Ok((ParsedStdf { meta, wafers, test_defs, sites, hbin_defs: Vec::new(), sbin_defs: Vec::new(), pass_hbins: Vec::new(), warnings }, timing))
}

#[cfg(test)]
mod tests {


    use super::*;

    const MULTI_WAFER: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03.stdf");
    const SINGLE_WAFER: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03_W01.stdf");
    // Generated by scripts/generate_stdf_coordinateless.py — W01 fully
    // positioned, W02 ~15% coordinate-less (mixed), W03 100% coordinate-less.
    // See WMAP_ISSUES.md #39.
    const COORDLESS_LOT: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/COORDLESS-LOT-01.stdf");
    // Generated by scripts/generate_stdf_corner_lot.py, which writes a WCR
    // record (see that script) — the one real-fixture regression check that
    // WCR parsing reaches an actual committed file, not just the hand-built
    // bytes in the byte_order::wcr_* tests below.
    const PVT_LOT_05: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/PVT-LOT-05.stdf");

    #[test]
    fn pvt_lot_05_has_wcr_fields() {
        let result = parse_stdf_sync(PVT_LOT_05.to_string()).unwrap();
        assert_eq!(result.meta.get("wafrSiz"), Some("300"));
        assert_eq!(result.meta.get("dieHt"), Some("16.9"));
        assert_eq!(result.meta.get("dieWid"), Some("16.9"));
        assert_eq!(result.meta.get("wfUnits"), Some("3"));
        assert_eq!(result.meta.get("wfFlat"), Some("D"));
        assert_eq!(result.meta.get("centerX"), Some("0"));
        assert_eq!(result.meta.get("centerY"), Some("0"));
        assert_eq!(result.meta.get("posX"), Some("R"));
        assert_eq!(result.meta.get("posY"), Some("U"));
        assert_eq!(result.wafers.len(), 13);
    }

    #[test]
    fn pvt_lot_05_has_hbr_sbr_fields() {
        let result = parse_stdf_sync(PVT_LOT_05.to_string()).unwrap();
        assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 1).map(|d| d.name.as_str()), Some("Pass"));
        assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 2).map(|d| d.name.as_str()), Some("Fail (1 test)"));
        assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 3).map(|d| d.name.as_str()), Some("Fail (multi)"));
        assert_eq!(result.sbin_defs.iter().find(|d| d.bin == 1).map(|d| d.name.as_str()), Some("Pass"));
        assert_eq!(result.pass_hbins, vec![1]);
        // Sanity check the counts sum to the total die count (2873).
        let total: u32 = result.wafers.iter().map(|w| w.results.len() as u32).sum();
        assert_eq!(total, 2873);
    }

    #[test]
    fn coordless_lot_w01_is_fully_positioned() {
        let result = parse_stdf_sync(COORDLESS_LOT.to_string()).unwrap();
        let w01 = result.wafers.iter().find(|w| w.wafer_id == "W01").unwrap();
        assert!(!w01.results.is_empty());
        assert!(w01.results.iter().all(|d| d.x.is_some() && d.y.is_some()));
        assert!(w01.results.iter().all(|d| d.die_index.is_none()));
    }

    #[test]
    fn coordless_lot_w02_is_mixed() {
        let result = parse_stdf_sync(COORDLESS_LOT.to_string()).unwrap();
        let w02 = result.wafers.iter().find(|w| w.wafer_id == "W02").unwrap();
        let positioned = w02.results.iter().filter(|d| d.x.is_some()).count();
        let unpositioned = w02.results.iter().filter(|d| d.x.is_none()).count();
        assert!(positioned > 0, "expected some positioned dies in the mixed wafer");
        assert!(unpositioned > 0, "expected some coordinate-less dies in the mixed wafer");
        // Every unpositioned die still has a stable, unique die_index.
        let indices: std::collections::HashSet<_> =
            w02.results.iter().filter_map(|d| d.die_index).collect();
        assert_eq!(indices.len(), unpositioned);
    }

    #[test]
    fn coordless_lot_w03_is_fully_coordinate_less_but_keeps_bin_and_test_data() {
        let result = parse_stdf_sync(COORDLESS_LOT.to_string()).unwrap();
        let w03 = result.wafers.iter().find(|w| w.wafer_id == "W03").unwrap();
        assert!(!w03.results.is_empty());
        assert!(w03.results.iter().all(|d| d.x.is_none() && d.y.is_none()));
        // Real measured data must survive — this is the whole point of
        // keeping the die instead of dropping it.
        assert!(w03.results.iter().all(|d| d.hbin.is_some()));
        assert!(w03.results.iter().all(|d| !d.test_values.is_empty()));
    }

    #[test]
    fn coordless_lot_surfaces_a_position_warning_per_affected_wafer() {
        let result = parse_stdf_sync(COORDLESS_LOT.to_string()).unwrap();
        let w02_warning = result.warnings.iter()
            .any(|w| w.code == "unpositioned-dies" && w.message.contains("W02"));
        let w03_warning = result.warnings.iter()
            .any(|w| w.code == "unpositioned-dies" && w.message.contains("W03"));
        assert!(w02_warning, "expected a position warning for W02: {:?}", result.warnings);
        assert!(w03_warning, "expected a position warning for W03: {:?}", result.warnings);
    }

    #[test]
    fn multi_wafer_lot_meta() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        assert!(result.meta.get("lotId").is_some(), "expected lot_id");
        assert!(result.meta.get("partType").is_some(), "expected part_type");
    }

    #[test]
    fn multi_wafer_count() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        assert!(result.wafers.len() > 1, "expected multiple wafers, got {}", result.wafers.len());
    }

    #[test]
    fn all_wafers_have_dies() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        for w in &result.wafers {
            assert!(!w.results.is_empty(), "wafer {} has no dies", w.wafer_id);
        }
    }

    // ── Gzip on the bytes path ─────────────────────────────────────────────────
    // The native path unwraps .gz by file extension in read_bytes, but the
    // WASM/browser path only ever sees raw bytes with no filename to inspect.
    // Before maybe_gunzip was applied here, a gzipped STDF parsed fine on
    // desktop and failed in the browser for any caller that hadn't already
    // decompressed — which the file-filter scan hadn't.

    fn gzip_bytes(raw: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        enc.write_all(raw).unwrap();
        enc.finish().unwrap()
    }

    #[test]
    fn gzipped_bytes_parse_identically_to_raw() {
        let raw = std::fs::read(MULTI_WAFER).unwrap();
        let gz = gzip_bytes(&raw);
        assert_eq!(&gz[..2], &[0x1f, 0x8b], "fixture should really be gzipped");

        let from_raw = parse_stdf_from_bytes(&raw).unwrap();
        let from_gz = parse_stdf_from_bytes(&gz).unwrap();
        assert_eq!(from_raw.wafers.len(), from_gz.wafers.len());
        assert_eq!(from_raw.meta.get("lotId"), from_gz.meta.get("lotId"));
        assert_eq!(
            from_raw.wafers[0].results.len(),
            from_gz.wafers[0].results.len(),
        );
    }

    #[test]
    fn gzipped_bytes_work_for_the_scan_entry_points_too() {
        let raw = std::fs::read(MULTI_WAFER).unwrap();
        let gz = gzip_bytes(&raw);

        let names_raw = parse_stdf_test_names(&raw).unwrap();
        let names_gz = parse_stdf_test_names(&gz).unwrap();
        assert_eq!(names_raw.die_count, names_gz.die_count);
        assert_eq!(names_raw.test_defs.len(), names_gz.test_defs.len());

        let meta_raw = parse_stdf_file_meta(&raw).unwrap();
        let meta_gz = parse_stdf_file_meta(&gz).unwrap();
        assert_eq!(meta_raw.wafer_count, meta_gz.wafer_count);
        assert_eq!(meta_raw.lot_meta.get("lotId"), meta_gz.lot_meta.get("lotId"));
    }

    // ── File-meta fast scan: consistency against the full parse ────────────────
    // The whole point of parse_stdf_file_meta is to be cheap (MIR/SDR/WIR/WRR
    // only, no PTR/FTR/PIR/PRR decode) — these tests aren't about performance,
    // they assert the fields it DOES extract agree with what the full parse
    // already produces for the same bytes, so "cheap" never drifts into "wrong".

    #[test]
    fn file_meta_lot_fields_match_full_parse() {
        let bytes = std::fs::read(MULTI_WAFER).unwrap();
        let meta = parse_stdf_file_meta(&bytes).unwrap();
        let full = parse_stdf_from_bytes(&bytes).unwrap();
        assert_eq!(meta.lot_meta.get("lotId"), full.meta.get("lotId"));
        assert_eq!(meta.lot_meta.get("partType"), full.meta.get("partType"));
    }

    #[test]
    fn file_meta_wafer_count_matches_full_parse() {
        let bytes = std::fs::read(MULTI_WAFER).unwrap();
        let meta = parse_stdf_file_meta(&bytes).unwrap();
        let full = parse_stdf_from_bytes(&bytes).unwrap();
        assert_eq!(meta.wafer_count as usize, full.wafers.len());
    }

    #[test]
    fn file_meta_wafer_count_matches_full_parse_for_coordinate_less_lot() {
        // COORDLESS_LOT mixes fully-positioned/mixed/fully-coordinate-less
        // wafers — file_meta counts WIR/WRR pairs regardless of die position,
        // same as the full parse counts wafers regardless.
        let bytes = std::fs::read(COORDLESS_LOT).unwrap();
        let meta = parse_stdf_file_meta(&bytes).unwrap();
        let full = parse_stdf_from_bytes(&bytes).unwrap();
        assert_eq!(meta.wafer_count as usize, full.wafers.len());
        assert_eq!(meta.lot_meta.get("lotId"), full.meta.get("lotId"));
    }

    #[test]
    fn file_meta_single_wafer_has_no_lot_level_wafer_fields_missing() {
        let bytes = std::fs::read(SINGLE_WAFER).unwrap();
        let meta = parse_stdf_file_meta(&bytes).unwrap();
        assert_eq!(meta.wafer_count, 1);
        assert!(meta.lot_meta.get("lotId").is_some());
    }

    #[test]
    fn test_defs_populated() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        assert!(!result.test_defs.is_empty(), "expected test defs");
        for (_, def) in &result.test_defs {
            assert!(def.test_type == "P" || def.test_type == "F",
                "unexpected test_type: {}", def.test_type);
        }
    }

    #[test]
    fn part_good_fail_counts_consistent() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        for w in &result.wafers {
            if let (Some(p), Some(g), Some(f)) = (w.part_count, w.good_count, w.fail_count) {
                assert_eq!(p, g + f,
                    "wafer {}: part_count {} != good {} + fail {}", w.wafer_id, p, g, f);
            }
        }
    }

    #[test]
    fn die_coordinates_are_valid() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        for w in &result.wafers {
            for d in &w.results {
                assert!(d.x != Some(SENTINEL_I2 as i32) && d.y != Some(SENTINEL_I2 as i32),
                    "sentinel coordinate leaked into results");
            }
        }
    }

    #[test]
    fn sites_populated() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        assert!(!result.sites.is_empty(), "expected site info from SDR");
    }

    #[test]
    fn single_wafer_parsed() {
        let result = parse_stdf_sync(SINGLE_WAFER.to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
    }

    #[test]
    fn single_wafer_has_test_values() {
        let result = parse_stdf_sync(SINGLE_WAFER.to_string()).unwrap();
        let has_values = result.wafers[0].results.iter().any(|d| !d.test_values.is_empty());
        assert!(has_values, "expected at least some dies to have test values");
    }

    #[test]
    fn single_wafer_matches_multi_wafer_first_wafer_id() {
        let multi = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        let single = parse_stdf_sync(SINGLE_WAFER.to_string()).unwrap();
        assert_eq!(single.wafers[0].wafer_id, multi.wafers[0].wafer_id);
    }

    #[test]
    fn soft_bin_sentinel_falls_back_to_hard_bin() {
        let result = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        for w in &result.wafers {
            for d in &w.results {
                assert_ne!(d.sbin, Some(65535), "sbin sentinel leaked into die result");
            }
        }
    }

    #[test]
    fn test_flg_pass_semantics() {
        // bit 6 (0x40) = no pass/fail indication; bit 7 (0x80) = fail.
        assert_eq!(test_flg_pass(0x00), Some(true));
        assert_eq!(test_flg_pass(0x80), Some(false));
        assert_eq!(test_flg_pass(0x40), None);
        assert_eq!(test_flg_pass(0xC0), None); // invalid flag wins even with fail bit set
    }

    #[test]
    fn ptr_fast_captures_recorded_verdict() {
        // TEST_NUM=7 LE, head=1, site=2, TEST_FLG, PARM_FLG=0, RESULT=1.5f32 LE
        let mk = |flg: u8| {
            let mut b = vec![7, 0, 0, 0, 1, 2, flg, 0];
            b.extend_from_slice(&1.5f32.to_le_bytes());
            b
        };
        let p = parse_ptr_fast(&mk(0x00), ByteOrder::Little).unwrap();
        assert_eq!(p.pass, Some(true));
        let f = parse_ptr_fast(&mk(0x80), ByteOrder::Little).unwrap();
        assert_eq!(f.pass, Some(false));
        assert!(f.failed);
        let n = parse_ptr_fast(&mk(0x40), ByteOrder::Little).unwrap();
        assert_eq!(n.pass, None);
    }

    #[test]
    fn ptr_limits_flagged_invalid_are_not_read_as_limits() {
        // STDF V4 OPT_FLAG: bit 4/5 = LO/HI_LIMIT invalid in this record (use
        // the first PTR's default), bit 6/7 = the test has no low/high limit.
        // The parser used to honour only 6/7, reading the unused bytes of a
        // bit-4/5 record as a real limit.
        let mk = |opt: u8| {
            let mut b = vec![7, 0, 0, 0, 1, 2, 0, 0];          // TEST_NUM, HEAD, SITE, TEST_FLG, PARM_FLG
            b.extend_from_slice(&1.5f32.to_le_bytes());       // RESULT
            b.extend_from_slice(&[1, b'T', 0, opt, 0, 0, 0]); // TEST_TXT "T", ALARM_ID "", OPT_FLAG, 3 × scale
            b.extend_from_slice(&0.5f32.to_le_bytes());       // LO_LIMIT
            b.extend_from_slice(&5.5f32.to_le_bytes());       // HI_LIMIT
            b.extend_from_slice(&[2, b'n', b'A']);            // UNITS
            b
        };
        let lim = |opt| { let (_, lo, hi, _) = ptr_defs_from_raw(&mk(opt), ByteOrder::Little); (lo, hi) };
        assert_eq!(lim(0x00), (Some(0.5), Some(5.5)));
        assert_eq!(lim(0x10), (None, Some(5.5)), "bit 4: LO_LIMIT invalid in this record");
        assert_eq!(lim(0x20), (Some(0.5), None), "bit 5: HI_LIMIT invalid in this record");
        assert_eq!(lim(0x40), (None, Some(5.5)), "bit 6: no low limit");
        assert_eq!(lim(0x80), (Some(0.5), None), "bit 7: no high limit");
        assert!(!ptr_limits_explicitly_absent(&mk(0x30)), "invalid-here is not 'this test has no limit'");
        assert!(ptr_limits_explicitly_absent(&mk(0xC0)));
    }

    #[test]
    fn ftr_fast_returns_verdict_or_none() {
        let mk = |flg: u8| vec![9, 0, 0, 0, 1, 2, flg];
        assert_eq!(parse_ftr_fast(&mk(0x00), ByteOrder::Little).unwrap().3, Some(true));
        assert_eq!(parse_ftr_fast(&mk(0x80), ByteOrder::Little).unwrap().3, Some(false));
        assert_eq!(parse_ftr_fast(&mk(0x40), ByteOrder::Little).unwrap().3, None);
    }

    const SAMPLE_LOT: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/sample-lot.stdf.gz");

    #[test]
    fn functional_verdicts_live_in_test_pass_not_values() {
        let result = parse_stdf_sync(SAMPLE_LOT.to_string()).unwrap();
        let f_keys: Vec<&String> = result.test_defs.iter()
            .filter(|(_, d)| d.test_type == "F")
            .map(|(k, _)| k)
            .collect();
        assert!(!f_keys.is_empty(), "sample lot should contain a functional test");
        // Guards the FTR TEST_TXT walker against generator/spec drift — the name
        // silently degraded to "" once when the generators wrote a non-spec FTR.
        for k in &f_keys {
            assert!(!result.test_defs[*k].name.is_empty(), "FTR {} should have a name", k);
        }
        let mut verdicts = 0usize;
        for w in &result.wafers {
            for d in &w.results {
                for k in &f_keys {
                    assert!(!d.test_values.contains_key(k.as_str()),
                        "functional test {} must never appear as a value", k);
                    if d.test_pass.contains_key(k.as_str()) { verdicts += 1; }
                }
            }
        }
        assert!(verdicts > 0, "expected functional verdicts in test_pass");
    }

    #[test]
    fn parametric_verdicts_recorded_when_test_flg_valid() {
        let result = parse_stdf_sync(SAMPLE_LOT.to_string()).unwrap();
        let p_keys: Vec<&String> = result.test_defs.iter()
            .filter(|(_, d)| d.test_type == "P")
            .map(|(k, _)| k)
            .collect();
        // Every recorded parametric verdict must belong to a die that also has
        // (or legitimately lacks, for fail-with-zero-result) the test's value —
        // and pass verdicts must always accompany a value.
        for w in &result.wafers {
            for d in &w.results {
                for (k, pass) in &d.test_pass {
                    if p_keys.iter().any(|pk| pk.as_str() == &**k) && *pass {
                        assert!(d.test_values.contains_key(&**k),
                            "passing parametric test {} should carry its value", k);
                    }
                }
            }
        }
    }

    #[test]
    fn nonexistent_file_returns_error() {
        let err = parse_stdf_sync("/nonexistent/path/test.stdf".to_string());
        assert!(err.is_err());
    }

    fn gz_of(src: &str) -> std::path::PathBuf {
        use std::io::Write;
        let bytes = std::fs::read(src).unwrap();
        let mut f = tempfile::Builder::new().suffix(".stdf.gz").tempfile().unwrap();
        let mut enc = flate2::write::GzEncoder::new(&mut f, flate2::Compression::default());
        enc.write_all(&bytes).unwrap();
        enc.finish().unwrap();
        f.into_temp_path().keep().unwrap()
    }

    #[test]
    fn gz_multi_wafer_parsed_same_as_plain() {
        let plain   = parse_stdf_sync(MULTI_WAFER.to_string()).unwrap();
        let gz_path = gz_of(MULTI_WAFER);
        let gz      = parse_stdf_sync(gz_path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(gz.wafers.len(), plain.wafers.len());
        assert_eq!(gz.meta.get("lotId"), plain.meta.get("lotId"));
        let plain_dies: usize = plain.wafers.iter().map(|w| w.results.len()).sum();
        let gz_dies:    usize = gz.wafers.iter().map(|w| w.results.len()).sum();
        assert_eq!(gz_dies, plain_dies);
    }

    #[test]
    fn gz_single_wafer_parsed() {
        let gz_path = gz_of(SINGLE_WAFER);
        let result = parse_stdf_sync(gz_path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.wafers.len(), 1);
        assert!(!result.wafers[0].results.is_empty());
    }

    // ── Panic-safety on truncated / malformed input ──────────────────────────
    // A corrupt or partial file must return Err, never panic. In WASM a panic
    // aborts the whole module, so these guard against a dead page.

    #[test]
    fn truncated_at_every_length_never_panics() {
        let full = std::fs::read(SINGLE_WAFER).unwrap();
        // Step through prefixes of the real file; every cut point exercises a
        // partially-read header or record body.
        let mut len = 0;
        while len <= full.len() {
            // Returns Ok or Err — both fine; the assertion is "did not panic".
            let _ = parse_stdf_from_bytes(&full[..len]);
            len += if len < 512 { 1 } else { 257 }; // dense early, sparse later
        }
    }

    #[test]
    fn empty_and_tiny_inputs_return_err() {
        assert!(parse_stdf_from_bytes(&[]).is_err());
        assert!(parse_stdf_from_bytes(&[0]).is_err());
        assert!(parse_stdf_from_bytes(&[0, 0, 0, 0]).is_err());
    }

    #[test]
    fn truncated_record_bodies_never_panic() {
        let full = std::fs::read(MULTI_WAFER).unwrap();
        // Lop off the trailing bytes of an otherwise-valid file so the final
        // record's body is shorter than its declared length.
        for cut in [1usize, 2, 3, 5, 7, 9, 11, 13] {
            if cut >= full.len() { continue; }
            let _ = parse_stdf_from_bytes(&full[..full.len() - cut]);
        }
    }

    #[test]
    fn test_names_scan_truncated_never_panics() {
        let full = std::fs::read(SINGLE_WAFER).unwrap();
        let mut len = 0;
        while len <= full.len() {
            let _ = parse_stdf_test_names(&full[..len]);
            len += if len < 256 { 1 } else { 251 };
        }
    }

    // The bench-only dispatch in parse_stdf_from_bytes_timed is a fourth copy
    // of the record loop, and until this test existed nothing compiled it: the
    // `bench` feature is opt-in and no CI job passes --features, so when
    // afaffa9 moved lot metadata onto LotRecords the MIR arm there kept
    // assigning a bare `meta.fields` and every bench build broke for months.
    //
    // Scoped to the MIR lot fields on purpose. The timed path deliberately
    // skips HBR/SBR and WIR/WRR extraction (see its closing comment) because
    // it measures raw parse throughput, not metadata completeness — so a
    // blanket meta-equality assertion against the canonical parser would fail
    // by design. Lot identity is the one thing both must agree on, and it is
    // exactly what the broken arm produced.
    // The single-MIR test above cannot tell `lots.set_lot(..)` from
    // `lots.extend_file(..)`: finish() folds file_fields into the same output
    // vector, so on a one-lot file either spelling yields identical metadata.
    // They diverge only once a stream carries several MIRs — set_lot bumps the
    // lot count and attributes fields per wafer, while extend_file leaves the
    // count at zero and piles every lot's fields together at file level,
    // duplicating keys. sample_data has no multi-MIR fixture, so this builds
    // one the way real multi-lot responses arrive: two single-lot files
    // concatenated (see LotRecords' own doc comment).
    #[cfg(feature = "bench")]
    #[test]
    fn timed_dispatch_handles_multi_lot_streams() {
        let mut bytes = std::fs::read(SINGLE_WAFER).unwrap();
        bytes.extend_from_slice(&std::fs::read(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample_data/CLUST-LOT-03_W02.stdf"),
        ).unwrap());

        let (timed, _) = parse_stdf_from_bytes_timed(&bytes).unwrap();

        assert_eq!(timed.wafers.len(), 2, "concatenated stream should yield both wafers");

        // Piling both MIRs into file_fields duplicates every lot key; routing
        // them through set_lot collapses the shared ones back to one entry.
        let lot_ids = timed.meta.fields.iter().filter(|f| f.key == "lotId").count();
        assert_eq!(lot_ids, 1, "lotId appears {lot_ids} times — MIR fields are being accumulated, not set");

        let canonical = parse_stdf_from_bytes(&bytes).unwrap();
        assert_eq!(timed.meta.get("lotId"), canonical.meta.get("lotId"));
    }

    #[cfg(feature = "bench")]
    #[test]
    fn timed_dispatch_agrees_with_canonical_on_lot_meta() {
        let bytes = std::fs::read(SINGLE_WAFER).unwrap();
        let canonical = parse_stdf_from_bytes(&bytes).unwrap();
        let (timed, _) = parse_stdf_from_bytes_timed(&bytes).unwrap();

        // Guard against both sides being vacuously empty.
        assert!(
            canonical.meta.get("lotId").is_some(),
            "fixture has no MIR lotId — this test would prove nothing"
        );

        for key in ["lotId", "partType", "jobName", "testerType", "nodeName"] {
            assert_eq!(
                timed.meta.get(key),
                canonical.meta.get(key),
                "timed dispatch lost MIR field {key:?}"
            );
        }
    }

    // Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench -- --nocapture bench_parse_large
    #[cfg(feature = "bench")]
    #[test]
    fn bench_parse_large() {
        let path = crate::bench_fixtures::fixture("large.stdf");
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("SKIP: {} not found — run scripts/generate_stdf_large.py first", path.display());
                return;
            }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;

        // Warm run (populates OS page cache)
        let _ = parse_stdf_from_bytes_timed(&bytes).unwrap();

        // Measured run
        let (result, timing) = parse_stdf_from_bytes_timed(&bytes).unwrap();
        let total_ms = timing.p1_iter_ms + timing.p2_hashmap_ms;

        println!(
            "\n=== bench_parse_large ({file_mb:.0} MB) ===\n\
             wafers:         {wafers}\n\
             dies:           {dies}\n\
             tests:          {tests}\n\
             p1 iter:        {p1} ms\n\
             p2 hashmap:     {p2} ms  ({p2_pct:.0}% of total)\n\
             total:          {total} ms\n\
             throughput:     {tp:.0} MB/s",
            wafers   = result.wafers.len(),
            dies     = timing.die_count,
            tests    = timing.test_count,
            p1       = timing.p1_iter_ms,
            p2       = timing.p2_hashmap_ms,
            p2_pct   = timing.p2_hashmap_ms as f64 / total_ms.max(1) as f64 * 100.0,
            total    = total_ms,
            tp       = file_mb / (total_ms as f64 / 1000.0),
        );
    }

    // Run with: cargo test --manifest-path packages/parsers/Cargo.toml --features bench --release -- --nocapture bench_file_meta
    // Measures parse_stdf_file_meta (MIR/SDR/WIR/WRR only, PTR/FTR/PIR/PRR
    // skipped without decoding) on the same large fixture bench_parse_large
    // uses — the file-filter feature's "is walking every WIR/WRR worth it"
    // question from its own plan doc. See session memory perf-baselines file
    // for the recorded result.
    #[cfg(feature = "bench")]
    #[test]
    fn bench_file_meta() {
        let path = crate::bench_fixtures::fixture("large.stdf");
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("SKIP: {} not found — run scripts/generate_stdf_large.py first", path.display());
                return;
            }
        };
        let file_mb = bytes.len() as f64 / 1_048_576.0;

        let _ = parse_stdf_file_meta(&bytes).unwrap(); // warm

        let t = std::time::Instant::now();
        let meta = parse_stdf_file_meta(&bytes).unwrap();
        let elapsed_ms = t.elapsed().as_millis();

        println!(
            "\n=== bench_file_meta ({file_mb:.0} MB) ===\n\
             wafers:     {wafers}\n\
             total:      {total} ms\n\
             throughput: {tp:.0} MB/s",
            wafers = meta.wafer_count,
            total = elapsed_ms,
            tp = file_mb / (elapsed_ms as f64 / 1000.0).max(0.001),
        );
    }

    // ── Byte-order (big-endian) support ────────────────────────────────────────
    // Build a minimal STDF in-memory in a given byte order and assert LE and BE
    // produce identical parse output. A Teradyne/legacy big-endian file must read
    // the same as the little-endian equivalent.
    mod byte_order {
        use super::super::*;

        struct Builder { order: ByteOrder, buf: Vec<u8> }
        impl Builder {
            fn new(order: ByteOrder) -> Self { Self { order, buf: Vec::new() } }
            fn u4(&self, v: u32) -> [u8; 4] {
                match self.order { ByteOrder::Little => v.to_le_bytes(), ByteOrder::Big => v.to_be_bytes() }
            }
            fn u2(&self, v: u16) -> [u8; 2] {
                match self.order { ByteOrder::Little => v.to_le_bytes(), ByteOrder::Big => v.to_be_bytes() }
            }
            fn i2(&self, v: i16) -> [u8; 2] {
                match self.order { ByteOrder::Little => v.to_le_bytes(), ByteOrder::Big => v.to_be_bytes() }
            }
            fn f32(&self, v: f32) -> [u8; 4] { self.u4(v.to_bits()) }
            fn cn(&self, s: &str) -> Vec<u8> {
                let mut v = vec![s.len() as u8];
                v.extend_from_slice(s.as_bytes());
                v
            }
            // Append a record: header [REC_LEN u2][typ u1][sub u1] + body.
            fn rec(&mut self, typ: u8, sub: u8, body: &[u8]) {
                self.buf.extend_from_slice(&self.u2(body.len() as u16));
                self.buf.push(typ);
                self.buf.push(sub);
                self.buf.extend_from_slice(body);
            }
        }

        fn build(order: ByteOrder) -> Vec<u8> {
            let b = Builder::new(order);
            let cpu = match order { ByteOrder::Little => 2u8, ByteOrder::Big => 1u8 };
            let mut out = Builder::new(order);
            // FAR: CPU_TYPE, STDF_VER
            out.rec(0, 10, &[cpu, 4]);
            // MIR: 15-byte fixed prefix then Cn run. We only need LOT_ID populated.
            let mut mir = Vec::new();
            mir.extend_from_slice(&b.u4(0));   // SETUP_T
            mir.extend_from_slice(&b.u4(0));   // START_T
            mir.push(1);                        // STAT_NUM
            mir.extend_from_slice(b" \0\0");   // MODE/RTST/PROT C1
            mir.extend_from_slice(&b.u2(0));   // BURN_TIM
            mir.push(b' ');                     // CMOD_COD C1
            mir.extend_from_slice(&b.cn("LOT-BE"));   // LOT_ID
            mir.extend_from_slice(&b.cn("WIDGET"));   // PART_TYP
            out.rec(1, 10, &mir);
            // SDR: head=1, grp=1, cnt=2, sites [1,2]
            out.rec(1, 80, &[1, 1, 2, 1, 2]);
            // WIR: head, grp, START_T u4, WAFER_ID
            let mut wir = vec![1, 0];
            wir.extend_from_slice(&b.u4(0));
            wir.extend_from_slice(&b.cn("W01"));
            out.rec(2, 10, &wir);
            // PIR head=1 site=1
            out.rec(5, 10, &[1, 1]);
            // PTR: test_num u4, head, site, test_flg, parm_flg, result f32, then test_txt Cn
            let mut ptr = Vec::new();
            ptr.extend_from_slice(&b.u4(1000));
            ptr.extend_from_slice(&[1, 1, 0, 0]);
            ptr.extend_from_slice(&b.f32(1.25));
            ptr.extend_from_slice(&b.cn("VDD"));
            out.rec(15, 10, &ptr);
            // PRR: head, site, part_flg, num_test u2, hard_bin u2, soft_bin u2, x i2, y i2, test_t u4, part_id Cn
            let mut prr = vec![1, 1, 0];
            prr.extend_from_slice(&b.u2(1));   // num_test
            prr.extend_from_slice(&b.u2(1));   // hard_bin
            prr.extend_from_slice(&b.u2(1));   // soft_bin
            prr.extend_from_slice(&b.i2(3));   // x
            prr.extend_from_slice(&b.i2(7));   // y
            prr.extend_from_slice(&b.u4(0));   // test_t
            prr.extend_from_slice(&b.cn("1")); // part_id
            out.rec(5, 20, &prr);
            // WRR: head, grp, FINISH_T u4, PART_CNT u4, RTST u4, ABRT u4, GOOD_CNT u4, FUNC u4, WAFER_ID Cn
            let mut wrr = vec![1, 0];
            wrr.extend_from_slice(&b.u4(0));   // finish_t
            wrr.extend_from_slice(&b.u4(1));   // part_cnt
            wrr.extend_from_slice(&b.u4(0));   // rtst
            wrr.extend_from_slice(&b.u4(0));   // abrt
            wrr.extend_from_slice(&b.u4(1));   // good_cnt
            wrr.extend_from_slice(&b.u4(0));   // func
            wrr.extend_from_slice(&b.cn("W01"));
            out.rec(2, 20, &wrr);
            out.buf
        }

        #[test]
        fn le_and_be_parse_identically() {
            let le = parse_stdf_from_bytes(&build(ByteOrder::Little)).unwrap();
            let be = parse_stdf_from_bytes(&build(ByteOrder::Big)).unwrap();

            // Metadata
            assert_eq!(le.meta.get("lotId"), Some("LOT-BE"));
            assert_eq!(be.meta.get("lotId"), Some("LOT-BE"));
            assert_eq!(le.meta.get("partType"), be.meta.get("partType"));
            // Sites from SDR
            assert_eq!(le.sites.len(), 2);
            assert_eq!(be.sites.iter().map(|s| s.site_num).collect::<Vec<_>>(),
                       le.sites.iter().map(|s| s.site_num).collect::<Vec<_>>());
            // Wafer + die
            assert_eq!(le.wafers.len(), 1);
            assert_eq!(be.wafers.len(), 1);
            let ld = &le.wafers[0].results[0];
            let bd = &be.wafers[0].results[0];
            assert_eq!((ld.x, ld.y, ld.hbin, ld.sbin), (Some(3), Some(7), Some(1), Some(1)));
            assert_eq!((bd.x, bd.y, bd.hbin, bd.sbin), (Some(3), Some(7), Some(1), Some(1)));
            // Test value (the f32 result — the field most sensitive to byte order)
            assert_eq!(ld.test_values.get("1000"), Some(&1.25));
            assert_eq!(bd.test_values.get("1000"), Some(&1.25));
            assert_eq!(le.test_defs.get("1000").map(|d| d.name.as_str()), Some("VDD"));
            assert_eq!(be.test_defs.get("1000").map(|d| d.name.as_str()), Some("VDD"));
        }

        // ── Several lot records in one stream ───────────────────────────────────

        /// Two single-lot files concatenated — how some systems return a
        /// multi-lot selection. Each wafer must carry its own lot, not the last.
        fn two_lots() -> Vec<u8> {
            let a = build(ByteOrder::Little);
            let b: Vec<u8> = {
                let mut v = build(ByteOrder::Little);
                let at = v.windows(6).position(|w| w == b"LOT-BE").unwrap();
                v[at..at + 6].copy_from_slice(b"LOT-XX");
                v
            };
            [a, b].concat()
        }

        #[test]
        fn concatenated_lots_label_each_wafer_with_its_own_lot() {
            let bytes = two_lots();
            for r in [
                parse_stdf_from_bytes(&bytes).unwrap(),
                parse_stdf_from_bytes_filtered(&bytes, &std::collections::HashSet::new()).unwrap(),
            ] {
                assert_eq!(r.wafers.len(), 2);
                let lot = |i: usize| r.wafers[i].fields.iter()
                    .find(|f| f.key == "lotId").map(|f| f.value.clone());
                assert_eq!(lot(0).as_deref(), Some("LOT-BE"));
                assert_eq!(lot(1).as_deref(), Some("LOT-XX"));
                // Shared fields stay file-level; the differing one does not.
                assert_eq!(r.meta.get("partType"), Some("WIDGET"));
                assert_eq!(r.meta.get("lotId"), None);
                assert!(r.warnings.iter().any(|w| w.code == "multiple-lot-records"
                    && w.message.contains("2 lot records")));
            }
        }

        #[test]
        fn a_truncated_last_wafer_keeps_its_own_lot() {
            // Drop the final record — the second lot's WRR — so that wafer is
            // only added by the end-of-file flush. The filtered parser's flush
            // once skipped the lot bookkeeping, and every wafer then got the
            // last lot.
            let mut bytes = two_lots();
            let (mut pos, mut last) = (0, 0);
            while pos + 4 <= bytes.len() {
                last = pos;
                pos += 4 + u16::from_le_bytes([bytes[pos], bytes[pos + 1]]) as usize;
            }
            assert_eq!(&bytes[last + 2..last + 4], &[2, 20], "the final record should be the WRR");
            bytes.truncate(last);
            for r in [
                parse_stdf_from_bytes(&bytes).unwrap(),
                parse_stdf_from_bytes_filtered(&bytes, &std::collections::HashSet::new()).unwrap(),
            ] {
                assert_eq!(r.wafers.len(), 2);
                let lot = |i: usize| r.wafers[i].fields.iter()
                    .find(|f| f.key == "lotId").map(|f| f.value.clone());
                assert_eq!(lot(0).as_deref(), Some("LOT-BE"));
                assert_eq!(lot(1).as_deref(), Some("LOT-XX"));
            }
        }

        #[test]
        fn single_lot_file_keeps_lot_at_file_level() {
            let r = parse_stdf_from_bytes(&build(ByteOrder::Little)).unwrap();
            assert_eq!(r.meta.get("lotId"), Some("LOT-BE"));
            assert!(r.wafers[0].fields.iter().all(|f| f.key != "lotId"));
            assert!(!r.warnings.iter().any(|w| w.code == "multiple-lot-records"));
        }

        // ── WCR (wafer geometry) ────────────────────────────────────────────────

        /// Minimal FAR + MIR + WCR file — no dies needed, this only exercises
        /// lot-level metadata extraction.
        fn build_with_wcr(order: ByteOrder, wcr_body: &[u8]) -> Vec<u8> {
            let b = Builder::new(order);
            let mut out = Builder::new(order);
            let cpu = match order { ByteOrder::Little => 2u8, ByteOrder::Big => 1u8 };
            out.rec(0, 10, &[cpu, 4]); // FAR
            let mut mir = Vec::new();
            mir.extend_from_slice(&b.u4(0));
            mir.extend_from_slice(&b.u4(0));
            mir.push(1);
            mir.extend_from_slice(b" \0\0");
            mir.extend_from_slice(&b.u2(0));
            mir.push(b' ');
            mir.extend_from_slice(&b.cn("LOT-WCR"));
            out.rec(1, 10, &mir);
            out.rec(2, 30, wcr_body); // WCR
            out.buf
        }

        #[allow(clippy::too_many_arguments)]
        fn wcr_body(
            b: &Builder, wafr_siz: f32, die_ht: f32, die_wid: f32, wf_units: u8,
            wf_flat: u8, center_x: i16, center_y: i16, pos_x: u8, pos_y: u8,
        ) -> Vec<u8> {
            // STDF V4 WCR has no HEAD_NUM/SITE_GRP — it starts with WAFR_SIZ.
            let mut v = Vec::new();
            v.extend_from_slice(&b.f32(wafr_siz));
            v.extend_from_slice(&b.f32(die_ht));
            v.extend_from_slice(&b.f32(die_wid));
            v.push(wf_units);
            v.push(wf_flat);
            v.extend_from_slice(&b.i2(center_x));
            v.extend_from_slice(&b.i2(center_y));
            v.push(pos_x);
            v.push(pos_y);
            v
        }

        #[test]
        fn wcr_fields_are_extracted_into_lot_meta() {
            let b = Builder::new(ByteOrder::Little);
            let wcr = wcr_body(&b, 300.0, 17.6, 17.6, 3, b'D', 0, 0, b'R', b'U');
            let result = parse_stdf_from_bytes(&build_with_wcr(ByteOrder::Little, &wcr)).unwrap();
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
        fn wcr_missing_value_conventions_are_omitted_not_emitted() {
            let b = Builder::new(ByteOrder::Little);
            // WAFR_SIZ/DIE_HT/DIE_WID = 0 (R4 missing convention); WF_UNITS = 0
            // is itself a real "Unknown" enum value, so it's still emitted;
            // WF_FLAT/POS_X/POS_Y = blank (C1 missing convention);
            // CENTER_X/CENTER_Y = -32768 (I2 missing convention, SENTINEL_I2).
            let wcr = wcr_body(&b, 0.0, 0.0, 0.0, 0, 0, -32768, -32768, 0, 0);
            let result = parse_stdf_from_bytes(&build_with_wcr(ByteOrder::Little, &wcr)).unwrap();
            assert_eq!(result.meta.get("wafrSiz"), None);
            assert_eq!(result.meta.get("dieHt"), None);
            assert_eq!(result.meta.get("dieWid"), None);
            assert_eq!(result.meta.get("wfUnits"), Some("0"));
            assert_eq!(result.meta.get("wfFlat"), None);
            assert_eq!(result.meta.get("centerX"), None);
            assert_eq!(result.meta.get("centerY"), None);
            assert_eq!(result.meta.get("posX"), None);
            assert_eq!(result.meta.get("posY"), None);
        }

        // ── STDF V4-2007 ────────────────────────────────────────────────────────

        #[test]
        fn v4_2007_file_loads_and_reports_its_revision() {
            // FAR – VUR – MIR (a V4-2007 initial sequence), then two records only
            // V4-2007 defines (PSR 1·90, STR 15·30), which every dispatch skips.
            let b = Builder::new(ByteOrder::Little);
            let mut out = Builder::new(ByteOrder::Little);
            out.rec(0, 10, &[2, 4]);                  // FAR
            out.rec(0, 30, &b.cn("V4-2007"));         // VUR
            let mut mir = Vec::new();
            mir.extend_from_slice(&b.u4(0));
            mir.extend_from_slice(&b.u4(0));
            mir.push(1);
            mir.extend_from_slice(b" \0\0");
            mir.extend_from_slice(&b.u2(0));
            mir.push(b' ');
            mir.extend_from_slice(&b.cn("LOT-2007"));
            out.rec(1, 10, &mir);                     // MIR
            out.rec(1, 90, &[0, 0, 0, 0]);            // PSR (V4-2007 only)
            out.rec(15, 30, &[0; 12]);                // STR (V4-2007 only)

            let result = parse_stdf_from_bytes(&out.buf).unwrap();
            assert_eq!(result.meta.get("updNam"), Some("V4-2007"));
            assert_eq!(result.meta.get("lotId"), Some("LOT-2007"));

            let meta = parse_stdf_file_meta(&out.buf).unwrap();
            assert_eq!(meta.lot_meta.get("updNam"), Some("V4-2007"),
                "VUR precedes the MIR; the file-meta scan must not let the MIR overwrite it");
            assert_eq!(meta.lot_meta.get("lotId"), Some("LOT-2007"));
        }

        #[test]
        fn wcr_fields_decode_identically_in_big_endian() {
            let le_b = Builder::new(ByteOrder::Little);
            let be_b = Builder::new(ByteOrder::Big);
            let le_bytes = build_with_wcr(ByteOrder::Little, &wcr_body(&le_b, 300.0, 17.6, 17.6, 3, b'D', 1, -1, b'R', b'U'));
            let be_bytes = build_with_wcr(ByteOrder::Big, &wcr_body(&be_b, 300.0, 17.6, 17.6, 3, b'D', 1, -1, b'R', b'U'));
            let le = parse_stdf_from_bytes(&le_bytes).unwrap();
            let be = parse_stdf_from_bytes(&be_bytes).unwrap();
            assert_eq!(le.meta.get("wafrSiz"), be.meta.get("wafrSiz"));
            assert_eq!(le.meta.get("centerX"), be.meta.get("centerX"));
            assert_eq!(le.meta.get("centerY"), be.meta.get("centerY"));
        }

        #[test]
        fn wcr_fields_also_reach_the_filtered_parse_entry_point() {
            let b = Builder::new(ByteOrder::Little);
            let wcr = wcr_body(&b, 300.0, 17.6, 17.6, 3, b'D', 0, 0, b'R', b'U');
            let bytes = build_with_wcr(ByteOrder::Little, &wcr);
            let result = parse_stdf_from_bytes_filtered(&bytes, &std::collections::HashSet::new()).unwrap();
            assert_eq!(result.meta.get("wafrSiz"), Some("300"));
        }

        // ── HBR/SBR (bin names + pass bins) ─────────────────────────────────────

        /// Minimal FAR + MIR + HBR/SBR file, mirroring build_with_wcr above.
        fn build_with_bins(order: ByteOrder, hbrs: &[Vec<u8>], sbrs: &[Vec<u8>]) -> Vec<u8> {
            let b = Builder::new(order);
            let mut out = Builder::new(order);
            let cpu = match order { ByteOrder::Little => 2u8, ByteOrder::Big => 1u8 };
            out.rec(0, 10, &[cpu, 4]); // FAR
            let mut mir = Vec::new();
            mir.extend_from_slice(&b.u4(0));
            mir.extend_from_slice(&b.u4(0));
            mir.push(1);
            mir.extend_from_slice(b" \0\0");
            mir.extend_from_slice(&b.u2(0));
            mir.push(b' ');
            mir.extend_from_slice(&b.cn("LOT-BINS"));
            out.rec(1, 10, &mir);
            for hbr in hbrs { out.rec(1, 40, hbr); }
            for sbr in sbrs { out.rec(1, 50, sbr); }
            out.buf
        }

        fn bin_body(b: &Builder, bin_num: u16, bin_cnt: u32, pf: u8, name: &str) -> Vec<u8> {
            let mut v = vec![1u8, 255]; // HEAD_NUM, SITE_NUM (255 = lot-wide summary)
            v.extend_from_slice(&b.u2(bin_num));
            v.extend_from_slice(&b.u4(bin_cnt));
            v.push(pf);
            v.extend_from_slice(&b.cn(name));
            v
        }

        #[test]
        fn hbr_sbr_fields_are_extracted() {
            let b = Builder::new(ByteOrder::Little);
            let hbrs = vec![
                bin_body(&b, 1, 500, b'P', "Pass"),
                bin_body(&b, 2, 20, b'F', "Fail"),
            ];
            let sbrs = vec![bin_body(&b, 10, 5, b'F', "Leakage Fail")];
            let bytes = build_with_bins(ByteOrder::Little, &hbrs, &sbrs);
            let result = parse_stdf_from_bytes(&bytes).unwrap();

            assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 1).map(|d| d.name.as_str()), Some("Pass"));
            assert_eq!(result.hbin_defs.iter().find(|d| d.bin == 2).map(|d| d.name.as_str()), Some("Fail"));
            assert_eq!(result.sbin_defs.iter().find(|d| d.bin == 10).map(|d| d.name.as_str()), Some("Leakage Fail"));
            assert_eq!(result.pass_hbins, vec![1]);
        }

        #[test]
        fn hbr_with_no_name_is_omitted_but_still_counts_for_pass_hbins() {
            let b = Builder::new(ByteOrder::Little);
            let hbrs = vec![bin_body(&b, 1, 500, b'P', "")];
            let bytes = build_with_bins(ByteOrder::Little, &hbrs, &[]);
            let result = parse_stdf_from_bytes(&bytes).unwrap();
            assert!(result.hbin_defs.iter().find(|d| d.bin == 1).is_none());
            assert_eq!(result.pass_hbins, vec![1]);
        }

        #[test]
        fn hbin_defs_are_sorted_by_bin_number_regardless_of_record_order() {
            let b = Builder::new(ByteOrder::Little);
            let hbrs = vec![
                bin_body(&b, 3, 1, b' ', "Third"),
                bin_body(&b, 1, 1, b'P', "First"),
                bin_body(&b, 2, 1, b' ', "Second"),
            ];
            let bytes = build_with_bins(ByteOrder::Little, &hbrs, &[]);
            let result = parse_stdf_from_bytes(&bytes).unwrap();
            let bins: Vec<u32> = result.hbin_defs.iter().map(|d| d.bin).collect();
            assert_eq!(bins, vec![1, 2, 3]);
        }

        #[test]
        fn a_later_hbr_for_the_same_bin_overwrites_the_earlier_name() {
            // Real files commonly write one HBR per site plus a lot-wide
            // summary for the same bin number — last-wins, matching how WRR
            // already overwrites fields set by an earlier WIR.
            let b = Builder::new(ByteOrder::Little);
            let hbrs = vec![
                bin_body(&b, 1, 100, b'P', "Pass (site 1)"),
                bin_body(&b, 1, 400, b'P', "Pass"),
            ];
            let bytes = build_with_bins(ByteOrder::Little, &hbrs, &[]);
            let result = parse_stdf_from_bytes(&bytes).unwrap();
            assert_eq!(result.hbin_defs.len(), 1);
            assert_eq!(result.hbin_defs[0].name, "Pass");
        }

        #[test]
        fn hbr_sbr_fields_decode_identically_in_big_endian() {
            let le_b = Builder::new(ByteOrder::Little);
            let be_b = Builder::new(ByteOrder::Big);
            let le_bytes = build_with_bins(ByteOrder::Little, &[bin_body(&le_b, 1, 500, b'P', "Pass")], &[]);
            let be_bytes = build_with_bins(ByteOrder::Big, &[bin_body(&be_b, 1, 500, b'P', "Pass")], &[]);
            let le = parse_stdf_from_bytes(&le_bytes).unwrap();
            let be = parse_stdf_from_bytes(&be_bytes).unwrap();
            assert_eq!(le.hbin_defs.len(), be.hbin_defs.len());
            assert_eq!(le.hbin_defs[0].name, be.hbin_defs[0].name);
            assert_eq!(le.pass_hbins, be.pass_hbins);
        }

        #[test]
        fn hbr_sbr_fields_also_reach_the_filtered_parse_entry_point() {
            let b = Builder::new(ByteOrder::Little);
            let bytes = build_with_bins(ByteOrder::Little, &[bin_body(&b, 1, 500, b'P', "Pass")], &[]);
            let result = parse_stdf_from_bytes_filtered(&bytes, &std::collections::HashSet::new()).unwrap();
            assert_eq!(result.hbin_defs[0].name, "Pass");
            assert_eq!(result.pass_hbins, vec![1]);
        }

        #[test]
        fn rejects_unknown_cpu_type() {
            // CPU_TYPE 9 is neither big- nor little-endian.
            let mut bytes = build(ByteOrder::Little);
            bytes[4] = 9;
            assert!(parse_stdf_from_bytes(&bytes).is_err());
        }

        #[test]
        fn rejects_non_far_first_record() {
            let mut bytes = build(ByteOrder::Little);
            bytes[2] = 1; // change first record type away from FAR (0)
            assert!(parse_stdf_from_bytes(&bytes).is_err());
        }
    }
}
