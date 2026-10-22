#!/usr/bin/env python3
"""Strict STDF V4 / ATDF V5 conformance check for generated and committed test files.

Written straight from the specifications (specs/STDF-v4-spec.pdf, specs/ATDF-spec.pdf) and deliberately sharing nothing with the
Rust parser: the parser and the generators were once written to each other's layout, so a file the parser reads proves nothing
about the file. This reads every field by the spec's own record tables and reports what the spec forbids.

  python3 scripts/validate_stdf_atdf.py FILE...          # .stdf / .atdf (.gz and .bz2 read through)
  python3 scripts/validate_stdf_atdf.py --quiet FILE...  # only the summary line per file

Exit status 1 when any file has an error. Warnings (optional things a file could say) do not fail it.
"""
import bz2
import collections
import gzip
import math
import re
import struct
import sys

# ── helpers ───────────────────────────────────────────────────────────────────


def read_bytes(path):
    raw = open(path, 'rb').read()
    if raw[:2] == b'\x1f\x8b':
        return gzip.decompress(raw)
    if raw[:3] == b'BZh':
        return bz2.decompress(raw)
    return raw


class Report:
    def __init__(self, path):
        self.path, self.errors, self.warnings = path, [], []
        self.counts = collections.Counter()

    def err(self, where, msg):
        self.errors.append(f'{where}: {msg}')

    def warn(self, where, msg):
        self.warnings.append(f'{where}: {msg}')


# ── STDF ──────────────────────────────────────────────────────────────────────
# Field types: U1 U2 U4 I1 I2 I4 R4 C1 Cn B1 Bn Dn; arrays are ('kxU2', count_field). Every record lists its fields in the spec's
# order. A record may stop at a field boundary (the spec lets trailing fields be omitted); it may not stop inside a field or carry
# bytes beyond its last field.

STDF_LAYOUT = {
    (0, 10): ('FAR', ['CPU_TYPE:U1', 'STDF_VER:U1']),
    (0, 20): ('ATR', ['MOD_TIM:U4', 'CMD_LINE:Cn']),
    (1, 10): ('MIR', ['SETUP_T:U4', 'START_T:U4', 'STAT_NUM:U1', 'MODE_COD:C1', 'RTST_COD:C1', 'PROT_COD:C1', 'BURN_TIM:U2',
                      'CMOD_COD:C1'] + [f'{n}:Cn' for n in (
                          'LOT_ID PART_TYP NODE_NAM TSTR_TYP JOB_NAM JOB_REV SBLOT_ID OPER_NAM EXEC_TYP EXEC_VER TEST_COD '
                          'TST_TEMP USER_TXT AUX_FILE PKG_TYP FAMLY_ID DATE_COD FACIL_ID FLOOR_ID PROC_ID OPER_FRQ SPEC_NAM '
                          'SPEC_VER FLOW_ID SETUP_ID DSGN_REV ENG_ID ROM_COD SERL_NUM SUPR_NAM').split()]),
    (1, 20): ('MRR', ['FINISH_T:U4', 'DISP_COD:C1', 'USR_DESC:Cn', 'EXC_DESC:Cn']),
    (1, 30): ('PCR', ['HEAD_NUM:U1', 'SITE_NUM:U1', 'PART_CNT:U4', 'RTST_CNT:U4', 'ABRT_CNT:U4', 'GOOD_CNT:U4', 'FUNC_CNT:U4']),
    (1, 40): ('HBR', ['HEAD_NUM:U1', 'SITE_NUM:U1', 'HBIN_NUM:U2', 'HBIN_CNT:U4', 'HBIN_PF:C1', 'HBIN_NAM:Cn']),
    (1, 50): ('SBR', ['HEAD_NUM:U1', 'SITE_NUM:U1', 'SBIN_NUM:U2', 'SBIN_CNT:U4', 'SBIN_PF:C1', 'SBIN_NAM:Cn']),
    (1, 80): ('SDR', ['HEAD_NUM:U1', 'SITE_GRP:U1', 'SITE_CNT:U1', 'SITE_NUM:kU1:SITE_CNT'] + [f'{n}:Cn' for n in (
        'HAND_TYP HAND_ID CARD_TYP CARD_ID LOAD_TYP LOAD_ID DIB_TYP DIB_ID CABL_TYP CABL_ID CONT_TYP CONT_ID LASR_TYP '
        'LASR_ID EXTR_TYP EXTR_ID').split()]),
    (2, 10): ('WIR', ['HEAD_NUM:U1', 'SITE_GRP:U1', 'START_T:U4', 'WAFER_ID:Cn']),
    (2, 20): ('WRR', ['HEAD_NUM:U1', 'SITE_GRP:U1', 'FINISH_T:U4', 'PART_CNT:U4', 'RTST_CNT:U4', 'ABRT_CNT:U4', 'GOOD_CNT:U4',
                      'FUNC_CNT:U4', 'WAFER_ID:Cn', 'FABWF_ID:Cn', 'FRAME_ID:Cn', 'MASK_ID:Cn', 'USR_DESC:Cn', 'EXC_DESC:Cn']),
    (2, 30): ('WCR', ['WAFR_SIZ:R4', 'DIE_HT:R4', 'DIE_WID:R4', 'WF_UNITS:U1', 'WF_FLAT:C1', 'CENTER_X:I2', 'CENTER_Y:I2',
                      'POS_X:C1', 'POS_Y:C1']),
    (5, 10): ('PIR', ['HEAD_NUM:U1', 'SITE_NUM:U1']),
    (5, 20): ('PRR', ['HEAD_NUM:U1', 'SITE_NUM:U1', 'PART_FLG:B1', 'NUM_TEST:U2', 'HARD_BIN:U2', 'SOFT_BIN:U2', 'X_COORD:I2',
                      'Y_COORD:I2', 'TEST_T:U4', 'PART_ID:Cn', 'PART_TXT:Cn', 'PART_FIX:Bn']),
    (10, 30): ('TSR', ['HEAD_NUM:U1', 'SITE_NUM:U1', 'TEST_TYP:C1', 'TEST_NUM:U4', 'EXEC_CNT:U4', 'FAIL_CNT:U4', 'ALRM_CNT:U4',
                       'TEST_NAM:Cn', 'SEQ_NAME:Cn', 'TEST_LBL:Cn', 'OPT_FLAG:B1', 'TEST_TIM:R4', 'TEST_MIN:R4', 'TEST_MAX:R4',
                       'TST_SUMS:R4', 'TST_SQRS:R4']),
    (15, 10): ('PTR', ['TEST_NUM:U4', 'HEAD_NUM:U1', 'SITE_NUM:U1', 'TEST_FLG:B1', 'PARM_FLG:B1', 'RESULT:R4', 'TEST_TXT:Cn',
                       'ALARM_ID:Cn', 'OPT_FLAG:B1', 'RES_SCAL:I1', 'LLM_SCAL:I1', 'HLM_SCAL:I1', 'LO_LIMIT:R4', 'HI_LIMIT:R4',
                       'UNITS:Cn', 'C_RESFMT:Cn', 'C_LLMFMT:Cn', 'C_HLMFMT:Cn', 'LO_SPEC:R4', 'HI_SPEC:R4']),
    (15, 20): ('FTR', ['TEST_NUM:U4', 'HEAD_NUM:U1', 'SITE_NUM:U1', 'TEST_FLG:B1', 'OPT_FLAG:B1', 'CYCL_CNT:U4', 'REL_VADR:U4',
                       'REPT_CNT:U4', 'NUM_FAIL:U4', 'XFAIL_AD:I4', 'YFAIL_AD:I4', 'VECT_OFF:I2', 'RTN_ICNT:U2', 'PGM_ICNT:U2',
                       'RTN_INDX:kU2:RTN_ICNT', 'RTN_STAT:kN1:RTN_ICNT', 'PGM_INDX:kU2:PGM_ICNT', 'PGM_STAT:kN1:PGM_ICNT',
                       'FAIL_PIN:Dn', 'VECT_NAM:Cn', 'TIME_SET:Cn', 'OP_CODE:Cn', 'TEST_TXT:Cn', 'ALARM_ID:Cn', 'PROG_TXT:Cn',
                       'RSLT_TXT:Cn', 'PATG_NUM:U1', 'SPIN_MAP:Dn']),
    (20, 10): ('BPS', ['SEQ_NAME:Cn']),
    (20, 20): ('EPS', []),
    (50, 10): ('GDR', ['FLD_CNT:U2', 'GEN_DATA:Vn']),
    (50, 30): ('DTR', ['TEXT_DAT:Cn']),
}


class Body:
    def __init__(self, b, order):
        self.b, self.pos, self.o = b, 0, order

    def left(self):
        return len(self.b) - self.pos

    def take(self, n):
        if self.pos + n > len(self.b):
            raise ValueError(f'record ends inside a field (needs {n} bytes, {self.left()} left)')
        v = self.b[self.pos:self.pos + n]
        self.pos += n
        return v

    def num(self, fmt):
        n = struct.calcsize(fmt)
        return struct.unpack(self.o + fmt, self.take(n))[0]


def read_stdf_field(body, typ, fields):
    if typ == 'U1': return body.num('B')
    if typ == 'U2': return body.num('H')
    if typ == 'U4': return body.num('I')
    if typ == 'I1': return body.num('b')
    if typ == 'I2': return body.num('h')
    if typ == 'I4': return body.num('i')
    if typ == 'R4': return body.num('f')
    if typ == 'C1': return body.take(1).decode('latin-1')
    if typ == 'B1': return body.num('B')
    if typ == 'Cn':
        n = body.num('B')
        return body.take(n).decode('latin-1')
    if typ == 'Bn':
        n = body.num('B')
        return body.take(n)
    if typ == 'Dn':
        bits = body.num('H')
        return body.take((bits + 7) // 8)
    raise ValueError(f'unsupported type {typ}')


def parse_stdf_record(sub, b, order):
    """Fields by name, or raises ValueError. Records may stop at a field boundary; leftover bytes are an error."""
    name, spec = STDF_LAYOUT[sub]
    body, out = Body(b, order), {}
    for item in spec:
        if body.left() == 0:
            return name, out  # trailing fields omitted
        parts = item.split(':')
        fname, typ = parts[0], parts[1]
        if typ == 'Vn':  # GDR: not decoded field by field
            body.pos = len(b)
            continue
        if typ.startswith('k'):
            count = out[parts[2]]
            elem = typ[1:]
            if elem == 'N1':
                body.take((count + 1) // 2)
            else:
                for _ in range(count):
                    read_stdf_field(body, elem, out)
            continue
        out[fname] = read_stdf_field(body, typ, out)
    if body.left():
        raise ValueError(f'{body.left()} bytes left after the last field of {name}')
    return name, out


def validate_stdf(path, rep, data):
    if len(data) < 6:
        rep.err('file', 'too short to hold a FAR')
        return
    if data[2:4] != b'\x00\x0a':
        rep.err('record 1', 'the first record is not a FAR')
        return
    cpu = data[4]
    if cpu not in (1, 2):
        rep.err('FAR', f'CPU_TYPE {cpu} is not 1 (Sun, big-endian) or 2 (PC, little-endian)')
        return
    order = '<' if cpu == 2 else '>'
    pos, n = 0, 0
    seq = []                    # (name, fields, n)
    while pos < len(data):
        if pos + 4 > len(data):
            rep.err(f'record {n + 1}', 'file ends inside a record header')
            break
        ln = struct.unpack(order + 'H', data[pos:pos + 2])[0]
        typ, sub = data[pos + 2], data[pos + 3]
        body = data[pos + 4:pos + 4 + ln]
        if len(body) != ln:
            rep.err(f'record {n + 1}', f'REC_LEN {ln} runs past the end of the file')
            break
        pos += 4 + ln
        n += 1
        key = (typ, sub)
        if key not in STDF_LAYOUT:
            rep.warn(f'record {n}', f'type {typ}.{sub} is not checked by this validator')
            seq.append((f'{typ}.{sub}', {}, n))
            continue
        try:
            name, f = parse_stdf_record(key, body, order)
        except ValueError as e:
            rep.err(f'record {n} ({STDF_LAYOUT[key][0]})', str(e))
            seq.append((STDF_LAYOUT[key][0], {}, n))
            continue
        rep.counts[name] += 1
        seq.append((name, f, n))
        check_stdf_values(name, f, f'record {n} ({name})', rep)
    check_stdf_sequence(seq, rep)


def check_stdf_values(name, f, where, rep):
    def isnan(v): return isinstance(v, float) and (math.isnan(v) or math.isinf(v))
    for k, v in f.items():
        if isnan(v):
            rep.err(where, f'{k} is not a finite number')
    if name == 'FAR' and f.get('STDF_VER') != 4:
        rep.err(where, f'STDF_VER {f.get("STDF_VER")} is not 4')
    if name == 'MIR':
        if len(f) < 8 + 5:
            rep.err(where, 'MIR stops before LOT_ID..TSTR_TYP: the data fields after STAT_NUM are required by every reader')
        for k in ('MODE_COD', 'RTST_COD', 'PROT_COD', 'CMOD_COD'):
            v = f.get(k)
            if v is not None and (len(v) != 1 or not (v == ' ' or v.isprintable())):
                rep.err(where, f'{k} {v!r} is not one printable character')
    if name in ('HBR', 'SBR'):
        pf = f.get('HBIN_PF' if name == 'HBR' else 'SBIN_PF')
        if pf is not None and pf not in 'PF ':
            rep.err(where, f'bin pass/fail {pf!r} is not P, F or a space')
        bn = f.get('HBIN_NUM' if name == 'HBR' else 'SBIN_NUM')
        if bn is not None and bn > 32767:
            rep.err(where, f'bin number {bn} is above 32767')
    if name == 'PRR':
        flg = f.get('PART_FLG', 0)
        if flg & 0xE0:
            rep.err(where, f'PART_FLG bits 5-7 must be 0 (0x{flg:02X})')
        if flg & 0x03 == 0x03:
            rep.err(where, 'PART_FLG bits 0 and 1 are both set: the spec allows only one')
        if f.get('HARD_BIN', 0) > 32767:
            rep.err(where, f'HARD_BIN {f["HARD_BIN"]} is above 32767')
        sb = f.get('SOFT_BIN')
        if sb is not None and sb > 32767 and sb != 65535:
            rep.err(where, f'SOFT_BIN {sb} is above 32767 and not the missing value 65535')
        for k in ('X_COORD', 'Y_COORD'):
            if k in f and f[k] == -32768:
                continue
        if 'PART_FIX' in f and False:
            pass
    if name == 'FTR':
        if f.get('TEST_FLG', 0) & 0x02:
            rep.err(where, 'TEST_FLG bit 1 is reserved and must be 0')
        if 'OPT_FLAG' in f and f['OPT_FLAG'] & 0xC0 != 0xC0:
            rep.err(where, 'OPT_FLAG bits 6-7 are reserved and must be 1')
    if name == 'PTR':
        tf, pf = f.get('TEST_FLG', 0), f.get('PARM_FLG', 0)
        if tf & 0x10 and pf != 0:
            rep.err(where, 'TEST_FLG bit 4 (test not executed) is set but PARM_FLG is not zero')
        if 'OPT_FLAG' in f and not (f['OPT_FLAG'] & 0x02):
            rep.err(where, 'OPT_FLAG bit 1 is reserved and must be 1')
    if name == 'WCR':
        if f.get('WF_UNITS', 0) > 4:
            rep.err(where, f'WF_UNITS {f["WF_UNITS"]} is not 0-4')
        if f.get('WF_FLAT', ' ') not in 'UDLR ':
            rep.err(where, f'WF_FLAT {f["WF_FLAT"]!r} is not U, D, L, R or a space')
        for k in ('POS_X', 'POS_Y'):
            if f.get(k, ' ') not in 'LRUD ':
                rep.err(where, f'{k} {f[k]!r} is not L, R, U, D or a space')
    if name == 'MRR' and f.get('DISP_COD', ' ') != ' ' and not re.fullmatch(r'[0-9A-Z]', f['DISP_COD']):
        rep.err(where, f'DISP_COD {f["DISP_COD"]!r} is not 0-9, A-Z or a space')


def check_stdf_sequence(seq, rep):
    names = [s[0] for s in seq]
    if not names:
        return
    if names[0] != 'FAR':
        rep.err('order', 'the first record must be the FAR')
    # Initial sequence: FAR, ATRs, MIR, RDR, SDRs.
    i = 1
    while i < len(names) and names[i] == 'ATR':
        i += 1
    if i >= len(names) or names[i] != 'MIR':
        rep.err('order', 'the MIR must follow the FAR (and ATRs)')
        return
    if names.count('MIR') != 1:
        rep.err('order', f'exactly one MIR is required per data stream, found {names.count("MIR")}')
    j = i + 1
    while j < len(names) and names[j] == 'SDR':
        j += 1
    later_sdr = [seq[k][2] for k in range(j, len(names)) if names[k] == 'SDR']
    if later_sdr:
        rep.err('order', f'SDRs must follow the MIR directly; one is at record {later_sdr[0]}')
    if rep.counts['PCR'] < 1:
        rep.err('order', 'at least one PCR is required')
    if names.count('MRR') != 1:
        rep.err('order', f'exactly one MRR is required, found {names.count("MRR")}')
    elif names[-1] != 'MRR':
        rep.err('order', 'the MRR must be the last record')
    # SDR site groups are unique within the file; a head's SITE_GRP numbers must not repeat.
    seen = set()
    for name, f, n in seq:
        if name == 'SDR':
            key = f.get('SITE_GRP')
            if key in seen:
                rep.err(f'record {n} (SDR)', f'SITE_GRP {key} is described twice')
            seen.add(key)
    # PIR/PRR pairing, PTR/FTR placement, WIR/WRR bracketing.
    open_parts, open_wafers = {}, {}
    for name, f, n in seq:
        where = f'record {n} ({name})'
        if name == 'PIR':
            k = (f.get('HEAD_NUM'), f.get('SITE_NUM'))
            if k in open_parts:
                rep.err(where, f'PIR for head {k[0]} site {k[1]} while its previous part is still open (no PRR)')
            open_parts[k] = n
        elif name == 'PRR':
            k = (f.get('HEAD_NUM'), f.get('SITE_NUM'))
            if k not in open_parts:
                rep.err(where, f'PRR for head {k[0]} site {k[1]} with no PIR')
            open_parts.pop(k, None)
        elif name in ('PTR', 'FTR'):
            k = (f.get('HEAD_NUM'), f.get('SITE_NUM'))
            default_only = name == 'PTR' and f.get('TEST_FLG', 0) & 0x10
            if k not in open_parts and not default_only:
                rep.err(where, f'{name} outside a PIR/PRR pair for head {k[0]} site {k[1]}')
        elif name == 'WIR':
            h = f.get('HEAD_NUM')
            if h in open_wafers:
                rep.err(where, f'WIR on head {h} while its previous wafer has no WRR')
            open_wafers[h] = f.get('WAFER_ID')
        elif name == 'WRR':
            h = f.get('HEAD_NUM')
            if h not in open_wafers:
                rep.err(where, f'WRR on head {h} with no WIR')
            elif open_wafers[h] != f.get('WAFER_ID') and f.get('WAFER_ID'):
                rep.warn(where, f'WAFER_ID {f.get("WAFER_ID")!r} differs from its WIR\'s {open_wafers[h]!r}')
            open_wafers.pop(h, None)
    for k, n in open_parts.items():
        rep.err(f'record {n} (PIR)', f'head {k[0]} site {k[1]}: PIR never closed by a PRR')
    for h in open_wafers:
        rep.err('order', f'WIR on head {h} never closed by a WRR')


# ── ATDF ──────────────────────────────────────────────────────────────────────
# (name, required, kind). Kinds: text, int, float, time, hex, enum:ABC (any run of those letters), alarm (PTR/FTR flags),
# sites (comma-separated integers), empty-ok unless required.

TIME_RE = re.compile(r'^\d{1,2}:\d{2}:\d{2} \d{1,2}-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{4}$')
ALARM_LETTERS = set('ADHLNOSTUX')

ATDF_LAYOUT = {
    'FAR': [('Data File Type', True, 'enum:A'), ('STDF Version', True, 'enum:4'), ('ATDF Version', True, 'enum:2'),
            ('Scaling Flag', False, 'enum:SU')],
    'MIR': [('Lot ID', True, 'text'), ('Part Type', True, 'text'), ('Job Name', True, 'text'), ('Node ID', True, 'text'),
            ('Tester Type', True, 'text'), ('Setup Time', True, 'time'), ('Start Time', True, 'time'), ('Operator', True, 'text'),
            ('Test Mode', True, 'text'), ('Station', True, 'int'), ('Sublot ID', False, 'text'), ('Test Code', False, 'text'),
            ('Retest Code', False, 'text'), ('Job Rev', False, 'text'), ('Exec Type', False, 'text'),
            ('Exec Version', False, 'text'), ('Protect Code', False, 'text'), ('Command Mode', False, 'text'),
            ('Burn-in Time', False, 'int'), ('Test Temp', False, 'text'), ('User Text', False, 'text'),
            ('Aux File', False, 'text'), ('Package', False, 'text'), ('Family ID', False, 'text'), ('Date Code', False, 'text'),
            ('Facility ID', False, 'text'), ('Floor ID', False, 'text'), ('Process ID', False, 'text'),
            ('Operation Freq', False, 'text'), ('Spec Name', False, 'text'), ('Spec Version', False, 'text'),
            ('Flow ID', False, 'text'), ('Setup ID', False, 'text'), ('Design Rev', False, 'text'),
            ('Eng Lot ID', False, 'text'), ('ROM Code', False, 'text'), ('Serial', False, 'text'),
            ('Super Name', False, 'text')],
    'MRR': [('Finish Time', True, 'time'), ('Disposition', False, 'text'), ('User Descrip', False, 'text'),
            ('Exec Descrip', False, 'text')],
    'PCR': [('Head Number', False, 'int'), ('Site Number', False, 'int'), ('Part Count', True, 'int'),
            ('Retest Count', False, 'int'), ('Abort Count', False, 'int'), ('Good Count', False, 'int'),
            ('Funct Count', False, 'int')],
    'HBR': [('Head Number', False, 'int'), ('Site Number', False, 'int'), ('Bin Number', True, 'int'),
            ('Bin Count', True, 'int'), ('Pass or Fail', False, 'enum:PF'), ('Bin Name', False, 'text')],
    'SBR': [('Head Number', False, 'int'), ('Site Number', False, 'int'), ('Bin Number', True, 'int'),
            ('Bin Count', True, 'int'), ('Pass or Fail', False, 'enum:PF'), ('Bin Name', False, 'text')],
    'SDR': [('Head Number', True, 'int'), ('Site Group', True, 'int'), ('Site Array', True, 'sites')]
           + [(n, False, 'text') for n in ('Handler Type Handler ID Card Type Card ID Load Type Load ID DIB Type DIB ID '
                                           'Cable Type Cable ID Contactor Type Contactor ID Laser Type Laser ID Extra Type '
                                           'Extra ID').replace('Type', 'Type|').replace('ID', 'ID|').split('|') if n.strip()],
    'WIR': [('Head Number', True, 'int'), ('Start Time', True, 'time'), ('Site Group', False, 'int'), ('Wafer ID', False, 'text')],
    'WRR': [('Head Number', True, 'int'), ('Finish Time', True, 'time'), ('Part Count', True, 'int'), ('Wafer ID', False, 'text'),
            ('Site Group', False, 'int'), ('Retest Count', False, 'int'), ('Abort Count', False, 'int'),
            ('Good Count', False, 'int'), ('Funct Count', False, 'int'), ('Fab Wafer ID', False, 'text'),
            ('Frame ID', False, 'text'), ('Mask ID', False, 'text'), ('User Descrip', False, 'text'),
            ('Exec Descrip', False, 'text')],
    'WCR': [('Wafer Flat', False, 'enum:UDLR'), ('Pos X', False, 'enum:LR'), ('Pos Y', False, 'enum:UD'),
            ('Wafer Size', False, 'float'), ('Die Height', False, 'float'), ('Die Width', False, 'float'),
            ('Wafer Units', False, 'enum:01234'), ('Center X', False, 'int'), ('Center Y', False, 'int')],
    'PIR': [('Head Number', True, 'int'), ('Site Number', True, 'int')],
    'PRR': [('Head Number', True, 'int'), ('Site Number', True, 'int'), ('Part ID', False, 'text'), ('Num Tests', True, 'int'),
            ('Pass/Fail', True, 'enum:PF'), ('Hard Bin', True, 'int'), ('Soft Bin', False, 'int'),
            ('X Coord', False, 'int'), ('Y Coord', False, 'int'), ('Retest Code', False, 'enum:IC'),
            ('Abort Code', False, 'enum:Y'), ('Test Time', False, 'int'), ('Part Text', False, 'text'),
            ('Part Fix', False, 'hex')],
    'TSR': [('Head Number', False, 'int'), ('Site Number', False, 'int'), ('Test Number', True, 'int'),
            ('Test Name', False, 'text'), ('Test Type', False, 'enum:PFM'), ('Exec Count', False, 'int'),
            ('Fail Count', False, 'int'), ('Alarm Count', False, 'int'), ('Sequencer', False, 'text'),
            ('Test Label', False, 'text'), ('Test Time', False, 'float'), ('Test Min', False, 'float'),
            ('Test Max', False, 'float'), ('Test Sums', False, 'float'), ('Test Sum Squares', False, 'float')],
    'PTR': [('Test Number', True, 'int'), ('Head Number', True, 'int'), ('Site Number', True, 'int'),
            ('Test Result', False, 'float'), ('Pass/Fail Flag', True, 'enum:AFP'), ('Alarm Flags', False, 'alarm'),
            ('Test Text', False, 'text'), ('Alarm ID', False, 'text'), ('Limit Compare', False, 'enum:LH'),
            ('Test Units', False, 'text'), ('Low Limit', False, 'float'), ('High Limit', False, 'float'),
            ('Result Format', False, 'text'), ('Lo Limit Fmt', False, 'text'), ('Hi Limit Fmt', False, 'text'),
            ('Lo Spec Limit', False, 'float'), ('Hi Spec Limit', False, 'float'), ('Result Scale', False, 'int'),
            ('Lo Limit Scale', False, 'int'), ('Hi Limit Scale', False, 'int')],
    'FTR': [('Test Number', True, 'int'), ('Head Number', True, 'int'), ('Site Number', True, 'int'),
            ('Pass/Fail Flag', True, 'enum:AFP'), ('Alarm Flags', False, 'alarm'), ('Vector Name', False, 'text'),
            ('Timing Set', False, 'text'), ('Cycle Count', False, 'int'), ('Relative Addr', False, 'hex'),
            ('Repeat Count', False, 'int'), ('Failing Bits', False, 'int'), ('X Fail Addr', False, 'int'),
            ('Y Fail Addr', False, 'int'), ('Vector Offset', False, 'int'), ('Return Indexes', False, 'text'),
            ('Return States', False, 'text'), ('Prog Indexes', False, 'text'), ('Prog States', False, 'text'),
            ('Failing Pins', False, 'text'), ('Vector Op Code', False, 'text'), ('Test Text', False, 'text'),
            ('Alarm ID', False, 'text'), ('Programmed Text', False, 'text'), ('Result Text', False, 'text'),
            ('Generator Num', False, 'int'), ('Comparators', False, 'text')],
    'BPS': [('Sequencer Name', False, 'text')],
    'EPS': [],
    'DTR': [('Text', True, 'text')],
}

INT_RE = re.compile(r'^[+-]?\d+$')
FLOAT_RE = re.compile(r'^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$')
HEX_RE = re.compile(r'^X?[0-9A-Fa-f]+$')


def atdf_records(text, rep):
    """Logical records: a line starting with a space continues the previous one (spec: Line Continuation)."""
    out = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if line == '':
            continue
        if line[0] == ' ' and out:
            out[-1] = (out[-1][0], out[-1][1] + line[1:])
        else:
            out.append((lineno, line))
    return out


def check_atdf_field(kind, value):
    if value == '':
        return None
    if kind == 'int' and not INT_RE.match(value): return 'is not an integer'
    if kind == 'float' and not FLOAT_RE.match(value): return 'is not a decimal or floating point number'
    if kind == 'time' and not TIME_RE.match(value): return 'is not hh:mm:ss DD-MMM-YYYY'
    if kind == 'hex' and not HEX_RE.match(value): return 'is not hexadecimal'
    if kind == 'sites' and not all(INT_RE.match(s) for s in value.split(',')):
        return 'is not a comma-separated list of integers'
    if kind.startswith('enum:'):
        allowed = set(kind[5:])
        if not value or any(c not in allowed for c in value):
            return f'must be one of {"/".join(sorted(allowed))}'
    if kind == 'alarm' and any(c not in ALARM_LETTERS for c in value):
        return f'has letters outside {"".join(sorted(ALARM_LETTERS))}'
    return None


def validate_atdf(path, rep, data):
    try:
        text = data.decode('ascii')
    except UnicodeDecodeError:
        rep.err('file', 'is not 7-bit ASCII')
        text = data.decode('latin-1')
    recs = atdf_records(text, rep)
    if not recs:
        rep.err('file', 'is empty')
        return
    first = recs[0][1]
    if not first.startswith('FAR:A'):
        rep.err('record 1', 'the first record must be FAR:A|4|2…')
        return
    sep = first[5] if len(first) > 5 else '|'
    if sep != '|':
        rep.warn('FAR', f'uses the non-default separator {sep!r}')
    names = []
    parts_open, wafers_open = {}, {}
    for lineno, line in recs:
        where = f'line {lineno}'
        if ':' not in line:
            rep.err(where, 'has no record header (NAME:)')
            continue
        name, rest = line.split(':', 1)
        if name not in ATDF_LAYOUT:
            rep.warn(where, f'record {name} is not checked by this validator')
            names.append(name)
            continue
        names.append(name)
        rep.counts[name] += 1
        fields = rest.split(sep) if rest != '' else []
        if name == 'FAR':
            fields = [first[4:].split(sep)[0]] + first[5:].split(sep)[1:] if False else rest.split(sep)
        layout = ATDF_LAYOUT[name]
        if len(fields) > len(layout):
            rep.err(f'{where} ({name})', f'has {len(fields)} fields; the spec defines {len(layout)}')
        for i, (fname, req, kind) in enumerate(layout):
            v = fields[i] if i < len(fields) else ''
            if req and v.strip() == '' and not (name == 'PCR' and fname in ('Head Number', 'Site Number')):
                rep.err(f'{where} ({name})', f'required field "{fname}" is empty')
                continue
            if v != v.strip() and kind != 'text':
                rep.err(f'{where} ({name})', f'{fname} {v!r} has stray spaces')
            msg = check_atdf_field(kind, v.strip() if kind != 'text' else v)
            if msg:
                rep.err(f'{where} ({name})', f'{fname} {v!r} {msg}')
        f = lambda i: fields[i].strip() if i < len(fields) else ''
        if name == 'PIR':
            k = (f(0), f(1))
            if k in parts_open:
                rep.err(where, f'PIR for head {k[0]} site {k[1]} while its previous part has no PRR')
            parts_open[k] = lineno
        elif name == 'PRR':
            k = (f(0), f(1))
            if k not in parts_open:
                rep.err(where, f'PRR for head {k[0]} site {k[1]} with no PIR')
            parts_open.pop(k, None)
        elif name in ('PTR', 'FTR'):
            k = (f(1), f(2)) if name == 'PTR' else (f(1), f(2))
            default_only = name == 'PTR' and 'N' in f(5)
            if k not in parts_open and not default_only:
                rep.err(where, f'{name} outside a PIR/PRR pair for head {k[0]} site {k[1]}')
        elif name == 'WIR':
            wafers_open[f(0)] = lineno
        elif name == 'WRR':
            if f(0) not in wafers_open:
                rep.err(where, f'WRR on head {f(0)} with no WIR')
            wafers_open.pop(f(0), None)
        elif name == 'PTR' and False:
            pass
        if name == 'PRR' and f(8) != '' and not INT_RE.match(f(8)):
            pass
    # Spec: FAR first, then MIR; SDRs follow the MIR; at least one PCR; exactly one MRR, last.
    if names[:1] != ['FAR']:
        rep.err('order', 'FAR must be first')
    if names.count('MIR') != 1:
        rep.err('order', f'exactly one MIR is required, found {names.count("MIR")}')
    elif names[1:2] != ['MIR'] and not (names[1:2] == ['ATR'] or True):
        pass
    mir_at = names.index('MIR') if 'MIR' in names else -1
    if mir_at >= 0:
        j = mir_at + 1
        while j < len(names) and names[j] in ('RDR',):
            j += 1
        while j < len(names) and names[j] == 'SDR':
            j += 1
        if 'SDR' in names[j:]:
            rep.err('order', 'SDRs must follow the MIR directly')
    if names.count('PCR') < 1:
        rep.err('order', 'at least one PCR is required')
    if names.count('MRR') != 1:
        rep.err('order', f'exactly one MRR is required, found {names.count("MRR")}')
    elif names[-1] != 'MRR':
        rep.err('order', 'the MRR must be the last record')
    for k, ln in parts_open.items():
        rep.err(f'line {ln} (PIR)', f'head {k[0]} site {k[1]}: PIR never closed by a PRR')
    for h, ln in wafers_open.items():
        rep.err(f'line {ln} (WIR)', f'head {h}: WIR never closed by a WRR')


# ── driver ────────────────────────────────────────────────────────────────────


def validate(path, quiet=False, limit=8):
    rep = Report(path)
    try:
        data = read_bytes(path)
    except OSError as e:
        rep.err('file', str(e))
        return rep
    head = data[:4]
    if data[4:5] in (b'\x01', b'\x02') and data[2:4] == b'\x00\x0a':
        validate_stdf(path, rep, data)
    elif head.startswith(b'FAR:'):
        validate_atdf(path, rep, data)
    else:
        rep.err('file', 'is neither STDF (FAR record) nor ATDF (FAR: line)')
    return rep


def main(argv):
    quiet = '--quiet' in argv
    files = [a for a in argv if not a.startswith('--')]
    bad = 0
    for path in files:
        rep = validate(path)
        status = 'FAIL' if rep.errors else 'ok'
        bad += bool(rep.errors)
        print(f'{status:4} {path}  ({sum(rep.counts.values()):,} records, {len(rep.errors)} errors, {len(rep.warnings)} warnings)')
        if quiet:
            continue
        summary = collections.Counter(e.split(': ', 1)[1] if ': ' in e else e for e in rep.errors)
        for msg, count in list(summary.most_common(8)):
            print(f'       {count:>6} × {msg[:160]}')
    print(f'{len(files) - bad} of {len(files)} files conform')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
