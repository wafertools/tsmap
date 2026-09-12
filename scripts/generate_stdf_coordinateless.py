#!/usr/bin/env python3
"""Generate a synthetic STDF V4 file exercising dies/wafers with no reported
X/Y position (STDF's documented "no position" marker — SENTINEL_I2, -32768,
on the PRR's X_COORD/Y_COORD).

Produces a 3-wafer lot, same test program as generate_stdf.py (3 PTR + 1 FTR):
  W01 — fully positioned (baseline for comparison)
  W02 — mixed: ~15% of dies have no reported position
  W03 — fully coordinate-less: every die has no reported position

Use this to exercise: the wafer-map/gallery falling back to a die-list for
W03, the "+N dies without position data" expandable footer on W02's card,
and that ring/quadrant/cluster findings never reference a coordinate-less
die while yield/bin/per-test stats still count it. See WMAP_ISSUES.md #39.
"""

import struct
import math
import random
import sys
from pathlib import Path
from fixture_paths import fixture_path

random.seed(7)

SENTINEL_I2 = -32768

# ── STDF record helpers (mirrors generate_stdf.py) ─────────────────────────────

def cn(s: str) -> bytes:
    b = s.encode('ascii')
    return bytes([len(b)]) + b

def u1(v: int) -> bytes: return struct.pack('B', v & 0xFF)
def u2(v: int) -> bytes: return struct.pack('<H', v & 0xFFFF)
def u4(v: int) -> bytes: return struct.pack('<I', v & 0xFFFFFFFF)
def i2(v: int) -> bytes: return struct.pack('<h', v)
def i4(v: int) -> bytes: return struct.pack('<i', v)
def r4(v: float) -> bytes: return struct.pack('<f', v)
def b1(v: int) -> bytes: return bytes([v & 0xFF])
def c1(c: str) -> bytes: return c.encode('ascii')[:1]

def record(rec_typ: int, rec_sub: int, body: bytes) -> bytes:
    header = struct.pack('<HBB', len(body), rec_typ, rec_sub)
    return header + body

FAR = (0, 10); MIR = (1, 10); SDR = (1, 80)
WIR = (2, 10); WRR = (2, 20)
PIR = (5, 10); PRR = (5, 20)
PTR = (15, 10); FTR = (15, 20)

def far() -> bytes:
    return record(*FAR, u1(2) + u1(4))

def mir(lot_id: str, part_typ: str, job_nam: str, tstr_typ: str, node_nam: str) -> bytes:
    # STDF V4 field order, as generate_stdf.py writes it. This copy used to put
    # four stray C*1 and two U*4 between CMOD_COD and LOT_ID (fields that belong
    # to no MIR), and JOB_NAM in the 10th string slot instead of the 5th — so a
    # spec reader took a space (0x20) as LOT_ID's length and read 32 bytes of
    # padding as the lot, and the file-filter scan showed this lot as blank.
    body = (
        u4(0) + u4(0) +      # setup_t, start_t
        u1(1) +              # stat_num
        c1('P') +            # mode_cod
        c1(' ') +            # rtst_cod
        c1(' ') +            # prot_cod
        u2(0xFFFF) +         # burn_tim
        c1(' ') +            # cmod_cod
        cn(lot_id) + cn(part_typ) + cn(node_nam) + cn(tstr_typ) + cn(job_nam) +
        cn('') + cn('') + cn('') + cn('') + cn('') + cn('') + cn('') +   # job_rev … tst_temp
        cn('') + cn('') + cn('') + cn('')                                 # user_txt … famly_id
    )
    return record(*MIR, body)

def sdr(head: int, site_grp: int, sites: list[int]) -> bytes:
    body = (
        u1(head) + u1(site_grp) + u1(len(sites)) +
        b''.join(u1(s) for s in sites) +
        cn('') + cn('') + cn('') + cn('') + cn('') + cn('') + cn('') + cn('') + cn('')
    )
    return record(*SDR, body)

def wir(head: int, wafer_id: str) -> bytes:
    return record(*WIR, u1(head) + u1(255) + u4(0) + cn(wafer_id))

def wrr(head: int, wafer_id: str, part_cnt: int, good_cnt: int) -> bytes:
    body = (
        u1(head) + u1(255) + u4(0) + u4(part_cnt) + u4(0xFFFFFFFF) + u4(0xFFFFFFFF) +
        u4(good_cnt) + u4(0xFFFFFFFF) + cn(wafer_id) + cn('') + cn('') + cn('') + cn('') + cn('')
    )
    return record(*WRR, body)

def pir(head: int, site: int) -> bytes:
    return record(*PIR, u1(head) + u1(site))

def prr(head: int, site: int, x: int, y: int, hbin: int, sbin: int, part_id: int, passed: bool) -> bytes:
    part_flg = 0x00 if passed else 0x08
    body = (
        u1(head) + u1(site) + b1(part_flg) + u2(4) + u2(hbin) + u2(sbin) +
        i2(x) + i2(y) + u4(100) + cn(str(part_id)) + cn('') + b'\x00'
    )
    return record(*PRR, body)

def ptr_rec(test_num: int, head: int, site: int, value: float, passed: bool, test_txt: str,
            lo: float | None = None, hi: float | None = None, units: str = '', first: bool = False) -> bytes:
    test_flg = 0x00 if passed else 0x80
    if first and (lo is not None or hi is not None):
        has_lo, has_hi = lo is not None, hi is not None
        opt_flag = 0x00
        if not has_lo: opt_flag |= 0x40
        if not has_hi: opt_flag |= 0x80
        optional = (
            b1(opt_flag) + b1(0) + b1(0) + b1(0) +
            r4(lo if has_lo else 0.0) + r4(hi if has_hi else 0.0) +
            cn(units) + cn('') + cn('') + cn('')
        )
    else:
        optional = b''
    body = u4(test_num) + u1(head) + u1(site) + b1(test_flg) + b1(0x00) + r4(value) + cn(test_txt) + cn('') + optional
    return record(*PTR, body)

def ftr_rec(test_num: int, head: int, site: int, passed: bool, test_txt: str) -> bytes:
    test_flg = 0x00 if passed else 0x80
    body = (
        u4(test_num) + u1(head) + u1(site) + b1(test_flg) + b1(0xFF) +
        u4(0) + u4(0) + u4(0) + u4(0) + i4(0) + i4(0) + i2(0) + u2(0) + u2(0) + u2(0) +
        cn('') + cn('') + cn('') + cn(test_txt) + cn('') + cn('') + cn('') + u1(0) + u2(0)
    )
    return record(*FTR, body)

# ── Wafer geometry ─────────────────────────────────────────────────────────────

def wafer_dies(radius: int = 8) -> list[tuple[int, int]]:
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x * x + y * y <= radius * radius * 1.1
    ]

TESTS = [
    (1001, 'leakage_nA', 'nA', 0.0, 5.0),
    (1002, 'vth_mV', 'mV', 180.0, 380.0),
    (1003, 'freq_MHz', 'MHz', 1800.0, 2200.0),
]
FT_NUM, FT_NAME = 2001, 'scan_chain'
SITES = [1, 2, 3, 4]

# wafer_id -> fraction of dies with no reported position (SENTINEL_I2)
WAFERS = [('W01', 0.0), ('W02', 0.15), ('W03', 1.0)]

def generate(output_path: Path) -> None:
    buf = bytearray()
    buf += far()
    buf += mir('LOT-COORDLESS-01', 'CHIP-X', 'test_program', 'UltraTester-9000', 'node-01')
    buf += sdr(1, 1, SITES)

    dies = wafer_dies(8)
    part_counter = 1

    for wafer_id, unpositioned_frac in WAFERS:
        buf += wir(1, wafer_id)
        part_cnt = 0
        good_cnt = 0

        for batch_start in range(0, len(dies), len(SITES)):
            batch = dies[batch_start: batch_start + len(SITES)]
            for site_idx in range(len(batch)):
                buf += pir(1, SITES[site_idx])

            for site_idx, (x, y) in enumerate(batch):
                site = SITES[site_idx]
                edge = math.sqrt(x * x + y * y) > 6.5
                failed_tests = []

                for i, (tnum, tname, units, lo, hi) in enumerate(TESTS):
                    centre = (lo + hi) / 2
                    spread = (hi - lo) * 0.15
                    value = random.gauss(centre, spread)
                    if edge and random.random() < 0.15:
                        value = hi * 1.1
                    passed = lo <= value <= hi
                    if not passed:
                        failed_tests.append(tnum)
                    buf += ptr_rec(tnum, 1, site, value, passed, tname,
                                   lo, hi, units, first=(batch_start == 0 and site_idx == 0))

                ft_passed = not (edge and random.random() < 0.05)
                if not ft_passed:
                    failed_tests.append(FT_NUM)
                buf += ftr_rec(FT_NUM, 1, site, ft_passed, FT_NAME)

                die_passed = len(failed_tests) == 0
                hbin = 1 if die_passed else (2 if len(failed_tests) == 1 else 3)
                sbin = hbin

                # Deterministic (seeded) choice of which dies lose their
                # position — spread evenly through the wafer rather than
                # clustered, so it's visibly not itself a spatial pattern.
                unpositioned = random.random() < unpositioned_frac
                prr_x = SENTINEL_I2 if unpositioned else x
                prr_y = SENTINEL_I2 if unpositioned else y

                buf += prr(1, site, prr_x, prr_y, hbin, sbin, part_counter, die_passed)
                part_counter += 1
                part_cnt += 1
                if die_passed:
                    good_cnt += 1

        buf += wrr(1, wafer_id, part_cnt, good_cnt)

    output_path.write_bytes(buf)
    n_unpositioned = sum(1 for _, f in WAFERS if f > 0)
    print(f"Written {len(buf):,} bytes → {output_path}")
    print(f"  {len(WAFERS)} wafers × ~{len(dies)} dies: "
          f"{WAFERS[0][0]} fully positioned, {WAFERS[1][0]} ~{int(WAFERS[1][1]*100)}% coordinate-less, "
          f"{WAFERS[2][0]} 100% coordinate-less")

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else fixture_path('coordinateless.stdf')
    generate(out)
