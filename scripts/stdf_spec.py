"""Spec-conformant STDF V4 record builders for the fixture generators.

One copy of every record layout, written from specs/STDF-v4-spec.pdf (not from the parser). Each generator used to carry its own
copy of these, which is how they drifted from the specification together with the parser. `scripts/validate_stdf_atdf.py` checks
the files these produce against the spec's tables.

Little-endian (CPU_TYPE 2). Times are U4 seconds since the epoch; `TS_BASE` is a fixed instant so generated files are reproducible.
"""
import struct

TS_BASE = 1_700_000_000          # 2023-11-14 22:13:20 UTC: setup of the first lot
MISSING_U4 = 0xFFFFFFFF          # WRR/PCR count not given
MISSING_U2 = 0xFFFF              # SOFT_BIN / BURN_TIM not given
MISSING_I2 = -32768              # X_COORD / Y_COORD / CENTER_X / CENTER_Y not given

FAR = (0, 10)
MIR = (1, 10)
MRR = (1, 20)
PCR = (1, 30)
HBR = (1, 40)
SBR = (1, 50)
SDR = (1, 80)
WIR = (2, 10)
WRR = (2, 20)
WCR = (2, 30)
PIR = (5, 10)
PRR = (5, 20)
TSR = (10, 30)
PTR = (15, 10)
FTR = (15, 20)


# ── primitives ────────────────────────────────────────────────────────────────

def cn(s: str) -> bytes:
    """Cn: one length byte, then the text (7-bit ASCII, at most 255 bytes)."""
    b = s.encode('ascii')
    if len(b) > 255:
        raise ValueError(f'Cn longer than 255 bytes: {s[:20]!r}…')
    return bytes([len(b)]) + b


def u1(v: int) -> bytes: return struct.pack('<B', v)
def u2(v: int) -> bytes: return struct.pack('<H', v)
def u4(v: int) -> bytes: return struct.pack('<I', v)
def i1(v: int) -> bytes: return struct.pack('<b', v)
def i2(v: int) -> bytes: return struct.pack('<h', v)
def i4(v: int) -> bytes: return struct.pack('<i', v)
def r4(v: float) -> bytes: return struct.pack('<f', v)
def b1(v: int) -> bytes: return struct.pack('<B', v)


def c1(c: str) -> bytes:
    """C1: exactly one character; a space is STDF's "not given"."""
    return (c or ' ').encode('ascii')[:1]


def record(typ_sub, body: bytes) -> bytes:
    typ, sub = typ_sub
    return struct.pack('<HBB', len(body), typ, sub) + body


# ── records ───────────────────────────────────────────────────────────────────

def far() -> bytes:
    return record(FAR, u1(2) + u1(4))        # CPU_TYPE 2 (PC, little-endian), STDF_VER 4


def mir(lot_id: str = 'LOT-001', part_typ: str = 'PART', job_nam: str = 'job', tstr_typ: str = 'tester', node_nam: str = 'node',
        *, setup_t: int = TS_BASE, start_t: int = TS_BASE + 300, stat_num: int = 1, mode_cod: str = 'P', rtst_cod: str = ' ',
        prot_cod: str = ' ', burn_tim: int = MISSING_U2, cmod_cod: str = ' ', job_rev: str = '1.0', sblot_id: str = '',
        oper_nam: str = 'operator', exec_typ: str = '', exec_ver: str = '', test_cod: str = 'WS', tst_temp: str = '25C',
        user_txt: str = '', aux_file: str = '', pkg_typ: str = '', famly_id: str = '', date_cod: str = '', facil_id: str = '',
        floor_id: str = '', proc_id: str = '', oper_frq: str = '', spec_nam: str = '', spec_ver: str = '', flow_id: str = '',
        setup_id: str = '', dsgn_rev: str = '', eng_id: str = '', rom_cod: str = '', serl_num: str = '',
        supr_nam: str = '') -> bytes:
    body = (u4(setup_t) + u4(start_t) + u1(stat_num) + c1(mode_cod) + c1(rtst_cod) + c1(prot_cod) + u2(burn_tim) + c1(cmod_cod)
            + b''.join(cn(s) for s in (
                lot_id, part_typ, node_nam, tstr_typ, job_nam, job_rev, sblot_id, oper_nam, exec_typ, exec_ver, test_cod,
                tst_temp, user_txt, aux_file, pkg_typ, famly_id, date_cod, facil_id, floor_id, proc_id, oper_frq, spec_nam,
                spec_ver, flow_id, setup_id, dsgn_rev, eng_id, rom_cod, serl_num, supr_nam)))
    return record(MIR, body)


def mrr(finish_t: int, disp_cod: str = ' ', usr_desc: str = '', exc_desc: str = '') -> bytes:
    return record(MRR, u4(finish_t) + c1(disp_cod) + cn(usr_desc) + cn(exc_desc))


def pcr(head: int, site: int, part_cnt: int, good_cnt: int, rtst_cnt: int = MISSING_U4, abrt_cnt: int = MISSING_U4,
        func_cnt: int = MISSING_U4) -> bytes:
    """Part count for one head/site, or for every site with head = site = 255."""
    return record(PCR, u1(head) + u1(site) + u4(part_cnt) + u4(rtst_cnt) + u4(abrt_cnt) + u4(good_cnt) + u4(func_cnt))


def sdr(head: int, site_grp: int, sites, *, hand_typ: str = '', hand_id: str = '', card_typ: str = '', card_id: str = '',
        load_typ: str = '', load_id: str = '', dib_typ: str = '', dib_id: str = '', cabl_typ: str = '', cabl_id: str = '',
        cont_typ: str = '', cont_id: str = '', lasr_typ: str = '', lasr_id: str = '', extr_typ: str = '',
        extr_id: str = '') -> bytes:
    sites = list(sites)
    return record(SDR, u1(head) + u1(site_grp) + u1(len(sites)) + b''.join(u1(s) for s in sites)
                  + b''.join(cn(s) for s in (hand_typ, hand_id, card_typ, card_id, load_typ, load_id, dib_typ, dib_id, cabl_typ,
                                             cabl_id, cont_typ, cont_id, lasr_typ, lasr_id, extr_typ, extr_id)))


def wir(head: int, wafer_id: str, *, site_grp: int = 255, start_t: int = TS_BASE + 300) -> bytes:
    return record(WIR, u1(head) + u1(site_grp) + u4(start_t) + cn(wafer_id))


def wrr(head: int, wafer_id: str, part_cnt: int, good_cnt: int, *, site_grp: int = 255, finish_t: int = TS_BASE + 3600,
        rtst_cnt: int = MISSING_U4, abrt_cnt: int = MISSING_U4, func_cnt: int = MISSING_U4, fabwf_id: str = '',
        frame_id: str = '', mask_id: str = '', usr_desc: str = '', exc_desc: str = '') -> bytes:
    return record(WRR, u1(head) + u1(site_grp) + u4(finish_t) + u4(part_cnt) + u4(rtst_cnt) + u4(abrt_cnt) + u4(good_cnt)
                  + u4(func_cnt) + cn(wafer_id) + cn(fabwf_id) + cn(frame_id) + cn(mask_id) + cn(usr_desc) + cn(exc_desc))


def wcr(wafr_siz: float, die_ht: float, die_wid: float, wf_units: int, wf_flat: str, center_x: int, center_y: int,
        pos_x: str, pos_y: str) -> bytes:
    return record(WCR, r4(wafr_siz) + r4(die_ht) + r4(die_wid) + u1(wf_units) + c1(wf_flat) + i2(center_x) + i2(center_y)
                  + c1(pos_x) + c1(pos_y))


def _bin_record(typ_sub, head: int, site: int, bin_num: int, cnt: int, pf: str, name: str) -> bytes:
    return record(typ_sub, u1(head) + u1(site) + u2(bin_num) + u4(cnt) + c1(pf) + cn(name))


def hbr(bin_num: int, cnt: int, pf: str, name: str, head: int = 255, site: int = 255) -> bytes:
    """A hardware bin count; head = site = 255 is the summary over every site."""
    return _bin_record(HBR, head, site, bin_num, cnt, pf, name)


def sbr(bin_num: int, cnt: int, pf: str, name: str, head: int = 255, site: int = 255) -> bytes:
    return _bin_record(SBR, head, site, bin_num, cnt, pf, name)


def pir(head: int, site: int) -> bytes:
    return record(PIR, u1(head) + u1(site))


def prr(head: int, site: int, x: int, y: int, hbin: int, sbin: int, part_id: str | int, passed: bool, *, num_test: int = 4,
        test_t: int = 100, part_txt: str = '', supersedes_part_id: bool = False, supersedes_xy: bool = False) -> bytes:
    flg = 0x00 if passed else 0x08            # bit 3: part failed (bit 4 clear: the flag is valid)
    if supersedes_part_id:
        flg |= 0x01
    if supersedes_xy:
        flg |= 0x02
    return record(PRR, u1(head) + u1(site) + b1(flg) + u2(num_test) + u2(hbin) + u2(sbin) + i2(x) + i2(y) + u4(test_t)
                  + cn(str(part_id)) + cn(part_txt) + b'\x00')      # PART_FIX: length byte 0


def ptr(test_num: int, head: int, site: int, value: float, passed: bool, test_txt: str, lo: float | None = None,
        hi: float | None = None, units: str = '', first: bool = False, lo_spec: float | None = None,
        hi_spec: float | None = None) -> bytes:
    """One execution of a parametric test. The first PTR of a test carries its defaults (limits, units, spec limits); later ones
    stop after ALARM_ID, which the spec allows. OPT_FLAG's reserved bit 1 is always set."""
    test_flg = 0x00 if passed else 0x80       # bit 7: test failed (bit 6 clear: pass/fail is valid)
    body = u4(test_num) + u1(head) + u1(site) + b1(test_flg) + b1(0) + r4(value) + cn(test_txt) + cn('')
    if first:
        opt = 0x02                              # bit 1 reserved, must be 1
        if lo_spec is None: opt |= 0x04
        if hi_spec is None: opt |= 0x08
        if lo is None: opt |= 0x40
        if hi is None: opt |= 0x80
        body += (b1(opt) + i1(0) + i1(0) + i1(0) + r4(lo if lo is not None else 0.0) + r4(hi if hi is not None else 0.0)
                 + cn(units) + cn('') + cn('') + cn('')
                 + r4(lo_spec if lo_spec is not None else 0.0) + r4(hi_spec if hi_spec is not None else 0.0))
    return record(PTR, body)


def ftr(test_num: int, head: int, site: int, passed: bool, test_txt: str) -> bytes:
    """A functional test result with no vector detail: OPT_FLAG marks every optional field invalid."""
    test_flg = 0x00 if passed else 0x80
    return record(FTR, u4(test_num) + u1(head) + u1(site) + b1(test_flg) + b1(0xFF)
                  + u4(0) + u4(0) + u4(0) + u4(0) + i4(0) + i4(0) + i2(0)          # CYCL_CNT REL_VADR REPT_CNT NUM_FAIL X/YFAIL VECT_OFF
                  + u2(0) + u2(0)                                                   # RTN_ICNT PGM_ICNT (the four arrays are then empty)
                  + u2(0)                                                           # FAIL_PIN: a Dn of 0 bits
                  + cn('') + cn('') + cn('') + cn(test_txt) + cn('') + cn('') + cn('')   # VECT_NAM TIME_SET OP_CODE TEST_TXT ALARM_ID PROG_TXT RSLT_TXT
                  + u1(255)                                                         # PATG_NUM: 255 is "not given"
                  + u2(0))                                                          # SPIN_MAP: a Dn of 0 bits


def tsr(head: int, site: int, test_typ: str, test_num: int, exec_cnt: int, fail_cnt: int, test_nam: str,
        alrm_cnt: int = MISSING_U4) -> bytes:
    return record(TSR, u1(head) + u1(site) + c1(test_typ) + u4(test_num) + u4(exec_cnt) + u4(fail_cnt) + u4(alrm_cnt)
                  + cn(test_nam))


def file_end(part_cnt: int, good_cnt: int, *, finish_t: int = TS_BASE + 7200) -> bytes:
    """What closes a data stream: a summary PCR for every site (head = site = 255), then the MRR, which must be last."""
    return pcr(255, 255, part_cnt, good_cnt) + mrr(finish_t)
