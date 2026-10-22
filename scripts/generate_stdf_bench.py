#!/usr/bin/env python3
"""Parametric STDF V4 generator for benchmark test matrix.

Usage:
    python3 scripts/generate_stdf_bench.py --tests 1000 --radius 40 --wafers 3
    (no path → bench.stdf in the fixture dir; see scripts/fixture_paths.py.
     An explicit path is taken as given, so a bare name lands in the CWD.)

Die count by radius (approximate):
    radius 13 → ~530 dies
    radius 18 → ~1000 dies
    radius 40 → ~5000 dies
    radius 56 → ~10500 dies
"""

import argparse
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

def wafer_dies(radius: int) -> list[tuple[int, int]]:
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x * x + y * y <= radius * radius * 1.1
    ]

# ── Generator ─────────────────────────────────────────────────────────────────

def generate(output_path: Path, n_tests: int, radius: int, n_wafers: int) -> None:
    tests = [
        (tn, f'test_{i:04d}', 'mV', 100.0 * i, 100.0 * i + 50.0)
        for i, tn in enumerate(test_numbers(n_tests), start=1)
    ]
    ft_num, ft_name = 9001, 'scan_chain'
    sites = [1, 2, 3, 4]
    wafers = [f'W{i:02d}' for i in range(1, n_wafers + 1)]
    dies = wafer_dies(radius)
    edge_threshold = radius * 0.85

    buf = bytearray()
    buf += far()
    buf += mir('LOT-BENCH', 'CHIP-B', 'bench_program', 'BenchTester', 'node-01')
    buf += sdr(1, 1, sites)

    part_counter = 1
    lot_good = 0
    for wafer_id in wafers:
        buf += wir(1, wafer_id)
        part_cnt = good_cnt = 0

        for batch_start in range(0, len(dies), len(sites)):
            batch = dies[batch_start: batch_start + len(sites)]
            for site_idx, (x, y) in enumerate(batch):
                buf += pir(1, sites[site_idx])

            for site_idx, (x, y) in enumerate(batch):
                site = sites[site_idx]
                edge = math.sqrt(x * x + y * y) > edge_threshold
                failed = []

                for i, (tnum, tname, units, lo, hi) in enumerate(tests):
                    centre = (lo + hi) / 2
                    spread = (hi - lo) * 0.15
                    value = random.gauss(centre, spread)
                    if edge and random.random() < 0.15:
                        value = hi * 1.1
                    passed = lo <= value <= hi
                    if not passed:
                        failed.append(tnum)
                    buf += ptr_rec(tnum, 1, site, value, passed, tname,
                                   lo, hi, units, first=(batch_start == 0 and site_idx == 0))

                ft_passed = not (edge and random.random() < 0.05)
                if not ft_passed:
                    failed.append(ft_num)
                buf += ftr_rec(ft_num, 1, site, ft_passed, ft_name)

                die_passed = len(failed) == 0
                hbin = 1 if die_passed else (2 if len(failed) == 1 else 3)
                buf += prr(1, site, x, y, hbin, hbin, part_counter, die_passed)
                part_counter += 1
                part_cnt += 1
                if die_passed:
                    good_cnt += 1
                    lot_good += 1

        buf += wrr(1, wafer_id, part_cnt, good_cnt)

    buf += file_end(part_counter - 1, lot_good)
    output_path.write_bytes(buf)
    mb = len(buf) / 1_048_576
    total_dies = n_wafers * len(dies)
    print(f"Written {len(buf):,} bytes ({mb:.1f} MB) → {output_path}")
    print(f"  {n_wafers} wafers × {len(dies)} dies × {n_tests} PTR + 1 FTR  ({total_dies:,} total dies)")

# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate a parametric STDF benchmark file')
    parser.add_argument('output', nargs='?', default=fixture_path('bench.stdf'), help='Output path')
    parser.add_argument('--tests',  type=int, default=50,  help='Number of PTR tests per die')
    parser.add_argument('--radius', type=int, default=13,  help='Wafer radius (dies ≈ π·r²)')
    parser.add_argument('--wafers', type=int, default=3,   help='Number of wafers')
    args = parser.parse_args()
    generate(Path(args.output), args.tests, args.radius, args.wafers)
