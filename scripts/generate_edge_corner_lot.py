#!/usr/bin/env python3
"""Generate the edge-corner-lot fixture for the scripted investigation scenario
(scripts/scenarios/edge-corner-lot.mjs) — a lot with a real, findable defect,
plus a haystack of unrelated decoy files so the scenario's "Filter files…"
beat has something genuine to narrow down.

Derived from generate_stdf_corner_lot.py (same STDF-record helpers, same
per-die latent-variable correlation structure, same four-corner design), but
engineered so the investigation's climax is actually true in the data, which
the corner-lot generator's data is NOT: there, the mild radial edge kick is
identical across every corner, so there is no per-corner spatial signature to
find. Here, one corner (SS) gets both a shifted `fmax_MHz` distribution AND a
strong, SS-only edge/ring penalty on that same test — so "one bad corner, one
bad test, one spatial pattern" is a real, three-times-over conclusion
supportable from the generated values, not staged.

Output layout (under --out, default testdata/edge-corner-lot/):
  LOT-A417_W01.stdf .. _W12.stdf   one wafer per file (12 files)
  LOT-A417_splits.csv              waferId,split — TT/FF/FS/SS, same
                                       "not recoverable from the STDF itself"
                                       rule as generate_stdf_corner_lot.py
  haystack/<lot>_<wafer>.stdf         decoy files (tiny, unrelated lots)

Prints a per-split yield table and an edge/non-edge failure breakdown for the
flagged test at the end — that printed output, not any number in this file's
comments, is what the scenario runner's assertions must be derived from (see
the "Rules for the implementer" section governing this work).

Usage:
  python3 scripts/generate_edge_corner_lot.py --seed 12345 --out testdata/edge-corner-lot
"""

import argparse
import math
import random
import struct
from pathlib import Path

# ── STDF record helpers (see generate_stdf.py for the annotated version;
# duplicated here rather than imported, matching this repo's established
# convention for these standalone generator scripts — see
# generate_stdf_corner_lot.py's own header note) ───────────────────────────

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
    return struct.pack('<HBB', len(body), rec_typ, rec_sub) + body

FAR = (0, 10)
MIR = (1, 10)
SDR = (1, 80)
WIR = (2, 10)
WRR = (2, 20)
PIR = (5, 10)
PRR = (5, 20)
PTR = (15, 10)
FTR = (15, 20)

def far() -> bytes:
    return record(*FAR, u1(2) + u1(4))

def mir(lot_id: str, part_type: str, job_name: str, node_name: str, tester_type: str) -> bytes:
    # Cn field order: lotId, partType, nodeName, testerType, jobName, jobRev,
    # then 18 more (unused here) — see mir_fields() in
    # packages/parsers/src/parse_stdf.rs for the exact field/column mapping
    # the file-filter table reads these into.
    body = (
        u4(0) + u4(0) + u1(1) + c1('P') + c1(' ') + c1(' ') +
        u2(0xFFFF) + c1(' ') +
        cn(lot_id) + cn(part_type) + cn(node_name) + cn(tester_type) +
        cn(job_name) + cn('1.0') +
        cn('') * 18
    )
    return record(*MIR, body)

def sdr(sites: list[int]) -> bytes:
    body = u1(1) + u1(1) + u1(len(sites)) + b''.join(u1(s) for s in sites) + cn('') * 14
    return record(*SDR, body)

def wir(wafer_id: str) -> bytes:
    return record(*WIR, u1(1) + u1(255) + u4(0) + cn(wafer_id))

def wrr(wafer_id: str, part_cnt: int, good_cnt: int) -> bytes:
    body = (
        u1(1) + u1(255) + u4(0) +
        u4(part_cnt) + u4(0xFFFFFFFF) + u4(0xFFFFFFFF) +
        u4(good_cnt) + u4(0xFFFFFFFF) +
        cn(wafer_id) + cn('') * 5
    )
    return record(*WRR, body)

def pir(site: int) -> bytes:
    return record(*PIR, u1(1) + u1(site))

def prr(site: int, x: int, y: int, hbin: int, sbin: int, part_id: int, passed: bool, num_tests: int) -> bytes:
    body = (
        u1(1) + u1(site) +
        b1(0x00 if passed else 0x08) +
        u2(num_tests) +
        u2(hbin) + u2(sbin) +
        i2(x) + i2(y) +
        u4(100) +
        cn(str(part_id)) + cn('') + b'\x00'
    )
    return record(*PRR, body)

def ptr_rec(test_num: int, site: int, value: float, passed: bool, test_txt: str,
            lo: float | None, hi: float | None, units: str, first: bool) -> bytes:
    test_flg = 0x00 if passed else 0x80
    if first and (lo is not None or hi is not None):
        has_lo, has_hi = lo is not None, hi is not None
        opt_flag = 0x00
        if not has_lo: opt_flag |= 0x40
        if not has_hi: opt_flag |= 0x80
        optional = (
            b1(opt_flag) + b1(0) + b1(0) + b1(0) +
            r4(lo if has_lo else 0.0) +
            r4(hi if has_hi else 0.0) +
            cn(units) + cn('') + cn('') + cn('')
        )
    else:
        optional = b''
    body = (
        u4(test_num) + u1(1) + u1(site) +
        b1(test_flg) + b1(0x00) +
        r4(value) +
        cn(test_txt) + cn('') +
        optional
    )
    return record(*PTR, body)

def ftr_rec(test_num: int, site: int, passed: bool, test_txt: str) -> bytes:
    body = (
        u4(test_num) + u1(1) + u1(site) +
        b1(0x00 if passed else 0x80) + b1(0xFF) +
        u4(0) + u4(0) + u4(0) + u4(0) +
        i4(0) + i4(0) + i2(0) + u2(0) + u2(0) +
        u2(0) +
        cn('') + cn('') + cn('') +
        cn(test_txt) +
        cn('') + cn('') + cn('') +
        u1(0) + u2(0)
    )
    return record(*FTR, body)

# ── Wafer geometry ───────────────────────────────────────────────────────────

def wafer_dies(radius: int) -> list[tuple[int, int]]:
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x * x + y * y <= radius * radius * 1.1
    ]

EDGE_RADIUS = 6.5  # matches generate_stdf_corner_lot.py's threshold

def is_edge(x: int, y: int) -> bool:
    return math.sqrt(x * x + y * y) > EDGE_RADIUS

# ── Test definitions (identical to generate_stdf_corner_lot.py's TESTS) ─────
# (test_num, name, units, lsl, usl, drive, direction, signal, noise)
TESTS = [
    (1001, 'vth_n_mV',   'mV', 260.0,  380.0, 'n', -1.0, 12.0,  8.0),
    (1002, 'vth_p_mV',   'mV', 260.0,  380.0, 'p', -1.0, 12.0,  8.0),
    (1003, 'idsat_n_uA', 'uA', 500.0,  900.0, 'n', +1.0, 32.0, 20.0),
    (1004, 'idsat_p_uA', 'uA', 460.0,  840.0, 'p', +1.0, 32.0, 20.0),
    (1005, 'ioff_nA',    'nA',   0.0,   12.0, 'g', +1.0,  1.3,  0.7),
    (1006, 'fmax_MHz',   'MHz', 1600.0, 2200.0, 'g', +1.0, 48.0, 30.0),
]
NUM_TESTS = len(TESTS) + 1  # + the FTR scan test
FT_NUM, FT_NAME = 2001, 'scan_chain'

# The culprit test — the one the "Distributions" beat is expected to flag.
CULPRIT_TEST_NUM = 1006
CULPRIT_TEST_NAME = 'fmax_MHz'

# Four corners (TT/FF/FS/SS — SF dropped; the corner-lot generator's five
# corners aren't needed here and a fourth is enough to demonstrate grouping).
# SS's fmax_MHz centre is raised well above generate_stdf_corner_lot.py's SS
# (1638 -> 1700) specifically so its NON-edge dies mostly pass fmax — the
# anomaly needs to read as "SS's edge is bad", not "SS is uniformly bad".
# (Note fmax_MHz's total per-die spread is NOT noise*sigma_mult alone — the
# latent-variable signal term, std 48, dominates the independent noise term,
# std noise*sigma_mult=36; combined std is ~sqrt(48^2+36^2)=60. Tune against
# that combined figure, not the noise term in isolation — an earlier pass at
# this file got that wrong and produced a ~16% non-edge SS fail rate instead
# of the intended ~5%; see the printed yield table, not this comment, for
# what the current constants actually produce.)
CORNER_CENTRES: dict[str, dict[int, float]] = {
    'TT': {1001: 320.0, 1002: 320.0, 1003: 700.0, 1004: 650.0, 1005: 5.0, 1006: 1800.0},
    'FF': {1001: 280.0, 1002: 280.0, 1003: 826.0, 1004: 767.0, 1005: 9.0, 1006: 1980.0},
    'FS': {1001: 285.0, 1002: 355.0, 1003: 805.0, 1004: 552.0, 1005: 6.5, 1006: 1728.0},
    'SS': {1001: 360.0, 1002: 360.0, 1003: 574.0, 1004: 533.0, 1005: 1.5, 1006: 1700.0},
}
CORNER_SIGMA_MULT = {'TT': 1.0, 'FF': 1.2, 'FS': 1.25, 'SS': 1.2}
CORNER_FT_FAIL_P = {'TT': 0.01, 'FF': 0.02, 'FS': 0.05, 'SS': 0.03}

# The spatial signature: an SS-only, unconditional (not probabilistic) fmax
# penalty for every edge die. Combined with SS's centre/sigma above this
# pushes most SS edge dies below the 1600 MHz LSL while leaving SS's
# non-edge dies mostly passing — a ring that exists on SS wafers only, on
# this test only. See the module docstring: the corner-lot generator this is
# derived from has no equivalent, which is exactly the gap this fixture
# closes.
SS_EDGE_FMAX_PENALTY = 140.0

SITES = [1, 2, 3, 4]
WAFER_RADIUS = 8

# Wafer → corner. IDs are plain/sequential (W01..W12) — corner membership is
# deliberately not recoverable from the STDF, only from the splits CSV, same
# rule as generate_stdf_corner_lot.py. 5 TT / 2 FF / 2 FS / 3 SS = 12.
BASE_ASSIGNMENT = (
    ['TT'] * 5 + ['FF'] * 2 + ['FS'] * 2 + ['SS'] * 3
)

LOT_ID = 'LOT-A417'
PART_TYPE = 'CHIP-A417'
JOB_NAME = 'freq_screen'
NODE_NAME = 'node-07'
TESTER_TYPE = 'UltraTester-9000'

# ── Value generation ─────────────────────────────────────────────────────────

def gen_die_values(rng: random.Random, corner: str, edge: bool) -> dict[int, tuple[float, bool]]:
    centres = CORNER_CENTRES[corner]
    sigma_mult = CORNER_SIGMA_MULT[corner]

    z_g = rng.gauss(0, 1)
    z_n = z_g + rng.gauss(0, 0.3)
    z_p = z_g + rng.gauss(0, 0.3)
    z_by_drive = {'g': z_g, 'n': z_n, 'p': z_p}

    result = {}
    for tnum, name, units, lsl, usl, drive, direction, signal, noise in TESTS:
        z = z_by_drive[drive]
        centre = centres[tnum]
        val = centre + direction * signal * z + rng.gauss(0, noise * sigma_mult)
        # Mild radial edge degradation, same shape for every corner — kept
        # from generate_stdf_corner_lot.py for realism/continuity. This is
        # NOT the anomaly; it's generic background noise every corner shares.
        if edge and rng.random() < 0.12:
            val += (usl - lsl) * rng.choice([-1, 1]) * 0.35
        # The anomaly: SS-only, deterministic, fmax-only.
        if corner == 'SS' and tnum == CULPRIT_TEST_NUM and edge:
            val -= SS_EDGE_FMAX_PENALTY
        passed = lsl <= val <= usl
        result[tnum] = (val, passed)
    return result

# ── Lot wafers ───────────────────────────────────────────────────────

def generate_lot_wafers(out_dir: Path, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    assignment = BASE_ASSIGNMENT[:]
    rng.shuffle(assignment)
    wafer_corners = [(f'W{i+1:02d}', corner) for i, corner in enumerate(assignment)]

    dies = wafer_dies(WAFER_RADIUS)
    part_counter = 1

    # Stats, keyed by corner / edge-vs-not / test — printed at the end so the
    # scenario runner's thresholds are derived from what actually got
    # written, not guessed.
    stats = {c: {'dies': 0, 'good': 0, 'culprit_fail': 0, 'culprit_fail_edge': 0,
                  'culprit_fail_nonedge': 0, 'edge_dies': 0, 'nonedge_dies': 0}
             for c in CORNER_CENTRES}

    for wafer_id, corner in wafer_corners:
        buf = bytearray()
        buf += far()
        buf += mir(LOT_ID, PART_TYPE, JOB_NAME, NODE_NAME, TESTER_TYPE)
        buf += sdr(SITES)
        buf += wir(wafer_id)
        part_cnt = good_cnt = 0

        for batch_start in range(0, len(dies), len(SITES)):
            batch = dies[batch_start: batch_start + len(SITES)]
            for site_idx, _ in enumerate(batch):
                buf += pir(SITES[site_idx])

            for site_idx, (x, y) in enumerate(batch):
                site = SITES[site_idx]
                edge = is_edge(x, y)
                is_first = (batch_start == 0 and site_idx == 0)

                values = gen_die_values(rng, corner, edge)
                failed_tests = [t for t, (_, p) in values.items() if not p]

                for tnum, tname, units, lsl, usl, _drive, _dir, _sig, _noise in TESTS:
                    val, passed = values[tnum]
                    buf += ptr_rec(tnum, site, val, passed, tname, lsl, usl, units, first=is_first)

                ft_passed = rng.random() >= CORNER_FT_FAIL_P[corner]
                if not ft_passed:
                    failed_tests.append(FT_NUM)
                buf += ftr_rec(FT_NUM, site, ft_passed, FT_NAME)

                die_passed = len(failed_tests) == 0
                hbin = 1 if die_passed else (2 if len(failed_tests) <= 1 else 3)
                buf += prr(site, x, y, hbin, hbin, part_counter, die_passed, NUM_TESTS)
                part_counter += 1
                part_cnt += 1
                if die_passed:
                    good_cnt += 1

                s = stats[corner]
                s['dies'] += 1
                if die_passed: s['good'] += 1
                if edge: s['edge_dies'] += 1
                else: s['nonedge_dies'] += 1
                culprit_val, culprit_passed = values[CULPRIT_TEST_NUM]
                if not culprit_passed:
                    s['culprit_fail'] += 1
                    if edge: s['culprit_fail_edge'] += 1
                    else: s['culprit_fail_nonedge'] += 1

        buf += wrr(wafer_id, part_cnt, good_cnt)
        out_path = out_dir / f'{LOT_ID}_{wafer_id}.stdf'
        out_path.write_bytes(buf)

    # Each wafer is its own file (12 files, one wafer each) rather than
    # generate_stdf_corner_lot.py's one-file-13-wafers — deliberately, so
    # this fixture also exercises the multi-file load + rename overlay (a
    # real beat in the investigation: haystack -> filter -> 12 files ->
    # rename-and-open). That has a real consequence for the splits key: a
    # generic "W01"-style wafer ID loaded from >1 file is rewritten by
    # resolveWaferId() (src/multiFileUI.ts) to "{lotId} · {waferId}" before
    # it ever reaches the gallery, because a plain "W01" can't stay unique
    # once wafers from different files are merged. Verified empirically
    # (2026-08): a splits CSV keyed on bare "W01" silently matched nothing —
    # matched=0, no error — after this exact 12-file rename flow. The keys
    # below use the same resolved form, which is also exactly what a real
    # user's own "Save splits…" would produce after loading this lot, so
    # this file round-trips correctly through the app, not just into it.
    splits_path = out_dir / f'{LOT_ID}_splits.csv'
    lines = [
        '# tsmap wafer splits',
        f'# Process-corner assignment for {LOT_ID}',
        '# Keys use the "{lotId} · {waferId}" form multiFileUI.ts\'s',
        '# resolveWaferId() assigns to a generic "W01"-style ID loaded from',
        '# more than one file (see the rename overlay) — NOT the bare wafer ID.',
        'waferId,split',
        *[f'{LOT_ID} · {wid},{corner}' for wid, corner in wafer_corners],
    ]
    splits_path.write_text('\n'.join(lines) + '\n')

    print(f'\n{LOT_ID}: {len(wafer_corners)} wafers written to {out_dir}/')
    print(f'  splits -> {splits_path}')
    print(f'\n  {"corner":6} {"wafers":>6} {"dies":>6} {"yield":>8}   '
          f'{"culprit fails":>14} {"  of which edge":>16} {"  of which non-edge":>19}')
    for c in ['TT', 'FF', 'FS', 'SS']:
        s = stats[c]
        n_wafers = sum(1 for _, cc in wafer_corners if cc == c)
        yield_pct = 100.0 * s['good'] / s['dies'] if s['dies'] else 0.0
        edge_fail_pct = 100.0 * s['culprit_fail_edge'] / s['edge_dies'] if s['edge_dies'] else 0.0
        nonedge_fail_pct = 100.0 * s['culprit_fail_nonedge'] / s['nonedge_dies'] if s['nonedge_dies'] else 0.0
        print(f'  {c:6} {n_wafers:>6} {s["dies"]:>6} {yield_pct:>7.1f}%   '
              f'{s["culprit_fail"]:>14} {edge_fail_pct:>14.1f}% {nonedge_fail_pct:>18.1f}%')
    print(f'\n  Culprit test: {CULPRIT_TEST_NUM} {CULPRIT_TEST_NAME}')
    print('  (edge %/non-edge % above is the fail rate WITHIN that test, for that corner —')
    print('   a real per-corner, per-test, spatially-concentrated signature, or not, read it off above.)')

    return wafer_corners

# ── Haystack (decoy files) ───────────────────────────────────────────────────

DECOY_PART_TYPES = ['CHIP-A', 'CHIP-B', 'CHIP-C', 'CHIP-D']
DECOY_JOB_NAMES = ['wafer_sort', 'burn_in', 'final_test', 'qual_run']
DECOY_TESTER_TYPES = ['Tester-1', 'Tester-2', 'Tester-3']
DECOY_TESTS = [
    (9001, 'test_a', 'V', 0.0, 5.0),
    (9002, 'test_b', 'mA', 0.0, 100.0),
    (9003, 'test_c', 'ns', 0.0, 50.0),
]
DECOY_RADIUS = 4  # ~50 dies — decoys only need to differ in scannable metadata

def generate_haystack(out_dir: Path, seed: int, count: int) -> int:
    rng = random.Random(seed + 1)  # independent stream from the edge-corner lot
    haystack_dir = out_dir / 'haystack'
    haystack_dir.mkdir(parents=True, exist_ok=True)

    dies = wafer_dies(DECOY_RADIUS)
    n_lots = max(1, count // 8)  # ~8 wafers per decoy lot, like a real fab dump
    written = 0
    lot_idx = 0
    while written < count:
        lot_idx += 1
        lot_id = f'RUN-LOT-{lot_idx:03d}'
        part_type = rng.choice(DECOY_PART_TYPES)
        job_name = rng.choice(DECOY_JOB_NAMES)
        tester_type = rng.choice(DECOY_TESTER_TYPES)
        wafers_this_lot = min(8, count - written)
        for w in range(1, wafers_this_lot + 1):
            wafer_id = f'W{w:02d}'
            buf = bytearray()
            buf += far()
            buf += mir(lot_id, part_type, job_name, f'node-{lot_idx % 5:02d}', tester_type)
            buf += sdr([1])
            buf += wir(wafer_id)
            part_cnt = good_cnt = 0
            part_counter = 1
            for (x, y) in dies:
                buf += pir(1)
                failed = []
                for tnum, tname, units, lsl, usl in DECOY_TESTS:
                    val = rng.uniform(lsl, usl)
                    passed = lsl <= val <= usl
                    if not passed: failed.append(tnum)
                    buf += ptr_rec(tnum, 1, val, passed, tname, lsl, usl, units, first=(part_counter == 1))
                die_passed = len(failed) == 0
                hbin = 1 if die_passed else 2
                buf += prr(1, x, y, hbin, hbin, part_counter, die_passed, len(DECOY_TESTS))
                part_counter += 1
                part_cnt += 1
                if die_passed: good_cnt += 1
            buf += wrr(wafer_id, part_cnt, good_cnt)
            (haystack_dir / f'{lot_id}_{wafer_id}.stdf').write_bytes(buf)
            written += 1
            if written >= count:
                break

    print(f'\nHaystack: {written} decoy files written to {haystack_dir}/ ({lot_idx} lots)')
    return written

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--seed', type=int, default=12345)
    p.add_argument('--out', type=Path, default=Path('testdata/edge-corner-lot'))
    p.add_argument('--haystack-count', type=int, default=190)
    p.add_argument('--no-haystack', action='store_true', help='Skip decoy generation for fast iteration')
    args = p.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    generate_lot_wafers(args.out, args.seed)
    if not args.no_haystack:
        generate_haystack(args.out, args.seed, args.haystack_count)
    print()


if __name__ == '__main__':
    main()
