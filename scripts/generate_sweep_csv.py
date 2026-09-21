#!/usr/bin/env python3
"""Die-count sweep CSVs — the fixtures the web-path ceiling is measured against.

    sweep-25000.csv  sweep-50000.csv  sweep-100000.csv  sweep-150000.csv
    sweep-200000.csv  sweep-400000.csv  sweep-200000x100.csv

These existed in `~/.cache/wafertools/fixtures/` from 2026-09-19 with no
committed generator: they were produced ad hoc in a scratch session and could
not be rebuilt. `WEB_DIE_BUDGET` and the "hard ceiling at roughly 200k dies"
finding were both calibrated on them, so a number that ships to users rested on
files nothing could reproduce. This script closes that.

Same row shape as `generate_csv_json_bench.py` (one flat row per die, one column
per test), and the same test numbering via `fixture_testnums` — read that
module before changing the numbers, the choice is load-bearing.

Usage:
    python3 scripts/generate_sweep_csv.py                 # the standard set
    python3 scripts/generate_sweep_csv.py 400000 50       # one size, ad hoc
    WAFERTOOLS_TESTNUM_BASE=1000 WAFERTOOLS_TESTNUM_STEP=1 \
        python3 scripts/generate_sweep_csv.py             # the old, biased set
"""

import csv
import random
import sys

from fixture_paths import fixture_path
from fixture_testnums import test_numbers

# (total_dies, n_tests) — the sizes the ceiling work sweeps over. 200000x100
# is the one that shares a cell count with 400000x50 and behaves oppositely,
# which is why the budget thresholds on die count and not on dies x tests.
STANDARD = [
    (25_000, 50), (50_000, 50), (100_000, 50),
    (150_000, 50), (200_000, 50), (400_000, 50),
    (200_000, 100),
]

DIES_PER_WAFER = 8_000   # 50 wafers at 400k — the shape the gallery work uses


def write_sweep(total_dies: int, n_tests: int) -> None:
    name = (f'sweep-{total_dies}.csv' if n_tests == 50
            else f'sweep-{total_dies}x{n_tests}.csv')
    path = fixture_path(name)
    nums = test_numbers(n_tests)
    cols = ['wafer', 'lot', 'x', 'y', 'hbin', 'sbin', 'site'] + [f't{n}' for n in nums]

    # Seeded per file so a regenerated fixture is byte-identical to its predecessor.
    rng = random.Random(42)
    side = max(1, int(DIES_PER_WAFER ** 0.5))
    n_wafers = max(1, total_dies // DIES_PER_WAFER)

    with open(path, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        written = 0
        for wi in range(1, n_wafers + 1):
            wid = f'W{wi:02d}'
            for i in range(DIES_PER_WAFER):
                if written >= total_dies:
                    break
                hbin = 1 if rng.random() < 0.92 else rng.choice([2, 3, 4, 5])
                row = [wid, 'LOT-BENCH-01', i % side, i // side, hbin, hbin, i % 4]
                row += [round(rng.gauss(1.0 + j * 0.01, 0.05), 4) for j in range(n_tests)]
                w.writerow(row)
                written += 1

    mb = path.stat().st_size / 1048576
    print(f'{name:24s} {written:>7,} dies x {n_tests:>3} tests  '
          f'{mb:6.1f} MB  tests {nums[0]}..{nums[-1]}')


if __name__ == '__main__':
    if len(sys.argv) > 1:
        write_sweep(int(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 50)
    else:
        for total, tests in STANDARD:
            write_sweep(total, tests)
