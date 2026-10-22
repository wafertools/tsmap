"""Spec-conformant ATDF record builders for the fixture generators.

One copy of every record layout, written from specs/ATDF-spec.pdf (V5.00.00_flx; field tables 2-2 to 2-24). ATDF has its own field
order for each record: it is NOT the STDF binary order. `scripts/validate_stdf_atdf.py` checks the files these produce against the
spec's tables. Times are `hh:mm:ss DD-MMM-YYYY` (UTC); `TS_BASE` is a fixed instant so generated files are reproducible.
"""
import time

TS_BASE = 1_700_000_000
_MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')


def ts(epoch: int = TS_BASE) -> str:
    t = time.gmtime(epoch)
    return f'{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d} {t.tm_mday:02d}-{_MONTHS[t.tm_mon - 1]}-{t.tm_year}'


def rec(name: str, *fields) -> str:
    """One record line. Trailing empty fields are dropped (the spec lets a record end early); `|` inside a value is not allowed."""
    out = ['' if f is None else str(f) for f in fields]
    if any('|' in f or '\n' in f for f in out):
        raise ValueError(f'{name}: a field holds the separator or a newline')
    while out and out[-1] == '':
        out.pop()
    return f'{name}:' + '|'.join(out) + '\n'


def far(scaling: str = 'S') -> str:
    """FAR:A|4|2|S : ATDF file, STDF 4, ATDF 2; S = results and limits are in whole (unscaled-prefix) units."""
    return rec('FAR', 'A', 4, 2, scaling)


def mir(lot_id: str = 'LOT-001', part_typ: str = 'PART', job_nam: str = 'job', node_nam: str = 'node', tstr_typ: str = 'tester',
        *, setup_t: int = TS_BASE, start_t: int = TS_BASE + 300, oper_nam: str = 'operator', mode_cod: str = 'P', stat_num: int = 1,
        sblot_id: str = '', test_cod: str = 'WS', rtst_cod: str = '', job_rev: str = '1.0', exec_typ: str = '', exec_ver: str = '',
        prot_cod: str = '', cmod_cod: str = '', burn_tim='', tst_temp: str = '25C', **rest) -> str:
    # ATDF MIR order (table 2-4): LOT_ID PART_TYP JOB_NAM NODE_NAM TSTR_TYP SETUP_T START_T OPER_NAM MODE_COD STAT_NUM SBLOT_ID
    # TEST_COD RTST_COD JOB_REV EXEC_TYP EXEC_VER PROT_COD CMOD_COD BURN_TIM TST_TEMP USER_TXT AUX_FILE PKG_TYP FAMLY_ID DATE_COD
    # FACIL_ID FLOOR_ID PROC_ID OPER_FRQ SPEC_NAM SPEC_VER FLOW_ID SETUP_ID DSGN_REV ENG_ID ROM_COD SERL_NUM SUPR_NAM
    tail = [rest.pop(k, '') for k in ('user_txt', 'aux_file', 'pkg_typ', 'famly_id', 'date_cod', 'facil_id', 'floor_id', 'proc_id',
                                      'oper_frq', 'spec_nam', 'spec_ver', 'flow_id', 'setup_id', 'dsgn_rev', 'eng_id', 'rom_cod',
                                      'serl_num', 'supr_nam')]
    if rest:
        raise TypeError(f'unknown MIR field(s): {sorted(rest)}')
    return rec('MIR', lot_id, part_typ, job_nam, node_nam, tstr_typ, ts(setup_t), ts(start_t), oper_nam, mode_cod, stat_num,
               sblot_id, test_cod, rtst_cod, job_rev, exec_typ, exec_ver, prot_cod, cmod_cod, burn_tim, tst_temp, *tail)


def mrr(finish_t: int, disp_cod: str = '', usr_desc: str = '', exc_desc: str = '') -> str:
    return rec('MRR', ts(finish_t), disp_cod, usr_desc, exc_desc)


def pcr(head, site, part_cnt: int, good_cnt: int) -> str:
    """Part counts for one head/site; head and site both empty is the summary over every site. Order: HEAD SITE PART RTST ABRT GOOD FUNC."""
    return rec('PCR', head, site, part_cnt, '', '', good_cnt)


def sdr(head: int, site_grp: int, sites, *equipment) -> str:
    """HEAD_NUM|SITE_GRP|SITE_NUM (one comma-separated array)|HAND_TYP|HAND_ID|CARD_TYP|CARD_ID|LOAD_TYP|LOAD_ID|DIB_TYP|DIB_ID|CABL_TYP|
    CABL_ID|CONT_TYP|CONT_ID|LASR_TYP|LASR_ID|EXTR_TYP|EXTR_ID, e.g. the spec's `SDR:2|4|5,6,7,8|Delta Flex|D511||B101|17`."""
    return rec('SDR', head, site_grp, ','.join(str(s) for s in sites), *equipment)


def wir(head: int, wafer_id: str, *, start_t: int = TS_BASE + 300, site_grp='') -> str:
    return rec('WIR', head, ts(start_t), site_grp, wafer_id)          # HEAD_NUM START_T SITE_GRP WAFER_ID


def wrr(head: int, wafer_id: str, part_cnt: int, good_cnt: int, *, finish_t: int = TS_BASE + 3600, site_grp='') -> str:
    # HEAD_NUM FINISH_T PART_CNT WAFER_ID SITE_GRP RTST_CNT ABRT_CNT GOOD_CNT FUNC_CNT FABWF_ID FRAME_ID MASK_ID USR_DESC EXC_DESC
    return rec('WRR', head, ts(finish_t), part_cnt, wafer_id, site_grp, '', '', good_cnt)


def wcr(wafr_siz, die_ht, die_wid, wf_units: int, wf_flat: str, center_x, center_y, pos_x: str, pos_y: str) -> str:
    # WF_FLAT POS_X POS_Y WAFR_SIZ DIE_HT DIE_WID WF_UNITS CENTER_X CENTER_Y
    return rec('WCR', wf_flat, pos_x, pos_y, wafr_siz, die_ht, die_wid, wf_units, center_x, center_y)


def hbr(bin_num: int, cnt: int, pf: str, name: str, head='', site='') -> str:
    return rec('HBR', head, site, bin_num, cnt, pf, name)


def sbr(bin_num: int, cnt: int, pf: str, name: str, head='', site='') -> str:
    return rec('SBR', head, site, bin_num, cnt, pf, name)


def pir(head: int, site: int) -> str:
    return rec('PIR', head, site)


def prr(head: int, site: int, x, y, hbin: int, sbin: int, part_id, passed: bool, *, num_tests: int = 4, test_t: int = 100,
        part_txt: str = '') -> str:
    # HEAD SITE PART_ID NUM_TEST PF HARD_BIN SOFT_BIN X Y RETEST ABORT TEST_T PART_TXT PART_FIX
    return rec('PRR', head, site, part_id, num_tests, 'P' if passed else 'F', hbin, sbin, '' if x is None else x,
               '' if y is None else y, '', '', test_t, part_txt)


def ptr(test_num: int, head: int, site: int, value: float, passed: bool, test_txt: str = '', lo=None, hi=None, units: str = '',
        first: bool = False, lo_spec=None, hi_spec=None, alarm: str = '', compare: str = '') -> str:
    """TEST_NUM HEAD SITE RESULT PF ALARM_FLAGS TEST_TXT ALARM_ID LIMIT_COMPARE UNITS LO_LIMIT HI_LIMIT C_RESFMT C_LLMFMT C_HLMFMT
    LO_SPEC HI_SPEC RES_SCAL LLM_SCAL HLM_SCAL. The first PTR of a test sets its defaults; later ones stop at ALARM_ID."""
    fields = [test_num, head, site, f'{float(value):.6g}', 'P' if passed else 'F', alarm, test_txt, '']
    if first:
        fields += [compare, units, '' if lo is None else lo, '' if hi is None else hi, '', '', '',
                   '' if lo_spec is None else lo_spec, '' if hi_spec is None else hi_spec]
    return rec('PTR', *fields)


def ftr(test_num: int, head: int, site: int, passed: bool, test_txt: str = '') -> str:
    # TEST_NUM HEAD SITE PF ALARM_FLAGS VECT_NAM TIME_SET CYCL_CNT REL_VADR REPT_CNT NUM_FAIL XFAIL_AD YFAIL_AD VECT_OFF RTN_INDX
    # RTN_STAT PGM_INDX PGM_STAT FAIL_PIN OP_CODE TEST_TXT: TEST_TXT is the 21st field.
    return rec('FTR', test_num, head, site, 'P' if passed else 'F', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
               test_txt)


def file_end(part_cnt: int, good_cnt: int, *, finish_t: int = TS_BASE + 7200) -> str:
    """What closes a data stream: a summary PCR (head and site empty), then the MRR, which must be last."""
    return pcr('', '', part_cnt, good_cnt) + mrr(finish_t)
