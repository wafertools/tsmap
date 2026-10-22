#!/usr/bin/env python3
"""Generate a bench-scale ATDF file for parser benchmarking.

Mirrors the CSV/JSON bench fixtures (scripts/generate_csv_json_bench.py) so the
four parsers compare on equivalent logical data: WAFERS × DIES_PER_WAFER dies,
each with N_TESTS parametric (PTR) results, plus PIR/PRR per die and WIR/WRR.

Writes bench.atdf to the fixture dir (see scripts/fixture_paths.py).

Usage:
    python3 scripts/generate_atdf_bench.py [wafers] [dies_per_wafer] [tests]
    (defaults: 10 wafers × 5000 dies × 50 tests = 50k dies)
"""

import random
import sys
from pathlib import Path
from fixture_paths import fixture_path
from fixture_testnums import test_numbers
import atdf_spec as a   # the one spec-conformant set of ATDF record builders

random.seed(42)

WAFERS = int(sys.argv[1]) if len(sys.argv) > 1 else 10
DIES_PER_WAFER = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
N_TESTS = int(sys.argv[3]) if len(sys.argv) > 3 else 50

TEST_NUMS = test_numbers(N_TESTS)
SITES = [1, 2, 3, 4]
side = max(1, int(DIES_PER_WAFER ** 0.5))


def generate(out: Path):
    lines = [
        a.far(),
        a.mir('LOT-BENCH-01', 'CHIP-X', 'test_program', 'node-01', 'UltraTester-9000'),
        a.sdr(1, 1, SITES),
    ]
    part_id = 1
    lot_good = 0
    for w in range(1, WAFERS + 1):
        wid = f"W{w:02d}"
        lines.append(a.wir(1, wid, site_grp=1))
        part_cnt = good_cnt = 0
        for i in range(DIES_PER_WAFER):
            x = i % side
            y = i // side
            site = SITES[i % len(SITES)]
            lines.append(a.pir(1, site))
            failed = 0
            for n in TEST_NUMS:
                value = random.gauss(1.0 + (n - 1000) * 0.01, 0.05)
                passed = 0.5 <= value <= 1.8
                if not passed:
                    failed += 1
                # First die of wafer emits the full PTR (name, units, limits); the rest stop after ALARM_ID.
                lines.append(a.ptr(n, 1, site, value, passed, f't{n}', 0.5, 1.8, 'V', first=(i == 0)))
            die_pass = failed == 0
            hbin = 1 if die_pass else 2
            lines.append(a.prr(1, site, x, y, hbin, hbin, part_id, die_pass, num_tests=N_TESTS))
            part_id += 1
            part_cnt += 1
            if die_pass:
                good_cnt += 1
                lot_good += 1
        lines.append(a.wrr(1, wid, part_cnt, good_cnt, site_grp=1))

    lines.append(a.file_end(part_id - 1, lot_good))
    out.write_text(''.join(lines))
    mb = out.stat().st_size / 1_048_576
    print(f"{out}: {WAFERS * DIES_PER_WAFER:,} dies, {N_TESTS} tests, {mb:.1f} MB "
          f"({WAFERS} wafers × {DIES_PER_WAFER} dies)")


if __name__ == "__main__":
    generate(Path(sys.argv[4]) if len(sys.argv) > 4 else fixture_path('bench.atdf'))
