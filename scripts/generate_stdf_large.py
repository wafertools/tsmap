#!/usr/bin/env python3
"""Generate a synthetic STDF V4 file for testing the tsmap parser.

Produces: 25 wafers, ~10k dies each, 4-site parallel test,
50 parametric tests (PTR) + 1 functional test (FTR).
"""

import math
import random
import sys
from pathlib import Path
from fixture_paths import fixture_path
from fixture_testnums import test_numbers

random.seed(42)

# ── STDF records ──────────────────────────────────────────────────────────────
# The one spec-conformant set of record builders: stdf_spec.py.
from stdf_spec import far, mir, sdr, wir, wrr, pir, prr, ptr as ptr_rec, ftr as ftr_rec, file_end

# ── Wafer geometry ─────────────────────────────────────────────────────────────

def wafer_dies(radius: int = 8) -> list[tuple[int, int]]:
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x*x + y*y <= radius*radius * 1.1
    ]

# ── Main ───────────────────────────────────────────────────────────────────────

TESTS = [
    (tn, f'test_{i:02d}',  'mV',  100.0 * i,  100.0 * i + 50.0)
    for i, tn in enumerate(test_numbers(50), start=1)
]
FT_NUM  = 2001
FT_NAME = 'scan_chain'

SITES = [1, 2, 3, 4]
WAFERS = [f'W{i:02d}' for i in range(1, 26)]

def generate(output_path: Path) -> None:
    buf = bytearray()
    buf += far()
    buf += mir('LOT-LARGE', 'CHIP-Y', 'test_program_large', 'UltraTester-9000', 'node-01')
    buf += sdr(1, 1, SITES)

    dies = wafer_dies(56)
    part_counter = 1
    lot_good = 0

    for wafer_id in WAFERS:
        buf += wir(1, wafer_id)
        part_cnt = 0
        good_cnt = 0

        # Process in groups of SITES dies (parallel test)
        for batch_start in range(0, len(dies), len(SITES)):
            batch = dies[batch_start: batch_start + len(SITES)]
            for site_idx, (x, y) in enumerate(batch):
                site = SITES[site_idx]
                buf += pir(1, site)

            for site_idx, (x, y) in enumerate(batch):
                site = SITES[site_idx]
                # Slight edge-ring yield loss
                edge = math.sqrt(x*x + y*y) > 48.0
                failed_tests = []

                for i, (tnum, tname, units, lo, hi) in enumerate(TESTS):
                    centre = (lo + hi) / 2
                    spread = (hi - lo) * 0.15
                    value = random.gauss(centre, spread)
                    if edge and random.random() < 0.15:
                        value = hi * 1.1   # push out of spec
                    passed = lo <= value <= hi
                    if not passed:
                        failed_tests.append(tnum)
                    buf += ptr_rec(tnum, 1, site, value, passed, tname,
                                   lo, hi, units, first=(batch_start == 0 and site_idx == 0))

                # FTR — occasional functional failure
                ft_passed = not (edge and random.random() < 0.05)
                if not ft_passed:
                    failed_tests.append(FT_NUM)
                buf += ftr_rec(FT_NUM, 1, site, ft_passed, FT_NAME)

                die_passed = len(failed_tests) == 0
                hbin = 1 if die_passed else (2 if len(failed_tests) == 1 else 3)
                sbin = hbin
                buf += prr(1, site, x, y, hbin, sbin, part_counter, die_passed)
                part_counter += 1
                part_cnt += 1
                if die_passed:
                    good_cnt += 1
                    lot_good += 1

        buf += wrr(1, wafer_id, part_cnt, good_cnt)

    buf += file_end(part_counter - 1, lot_good)
    output_path.write_bytes(buf)
    mb = len(buf) / 1_048_576
    print(f"Written {len(buf):,} bytes ({mb:.1f} MB) → {output_path}")
    print(f"  {len(WAFERS)} wafers × {len(dies)} dies × {len(TESTS)} PTR + 1 FTR tests")

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else fixture_path('large.stdf')
    generate(out)
