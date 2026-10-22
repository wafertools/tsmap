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
die while yield/bin/per-test stats still count it.
"""

import math
import random
import sys
from pathlib import Path
from fixture_paths import fixture_path

random.seed(7)

SENTINEL_I2 = -32768

# ── STDF records ──────────────────────────────────────────────────────────────
# The one spec-conformant set of record builders: stdf_spec.py.
from stdf_spec import far, mir, sdr, wir, wrr, pir, prr, ptr as ptr_rec, ftr as ftr_rec, file_end

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
    lot_good = 0

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
                    lot_good += 1

        buf += wrr(1, wafer_id, part_cnt, good_cnt)

    buf += file_end(part_counter - 1, lot_good)
    output_path.write_bytes(buf)
    n_unpositioned = sum(1 for _, f in WAFERS if f > 0)
    print(f"Written {len(buf):,} bytes → {output_path}")
    print(f"  {len(WAFERS)} wafers × ~{len(dies)} dies: "
          f"{WAFERS[0][0]} fully positioned, {WAFERS[1][0]} ~{int(WAFERS[1][1]*100)}% coordinate-less, "
          f"{WAFERS[2][0]} 100% coordinate-less")

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else fixture_path('coordinateless.stdf')
    generate(out)
