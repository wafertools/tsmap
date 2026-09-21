#!/usr/bin/env python3
"""Generate a wide-format Parquet bench fixture for `bench_parse_parquet`.

Deliberately the same logical data as `generate_csv_json_bench.py` — same wafers,
dies and tests — so the four flat formats are comparable per die. Per-MB
throughput is misleading here: Parquet is columnar and compressed, so the same
content is a fraction of the CSV's size and MB/s flatters it.

Requires: pip install pyarrow

Usage:
    python3 scripts/generate_parquet_bench.py [wafers] [dies_per_wafer] [tests]
    (defaults: 10 wafers x 5000 dies x 50 tests = 50k dies)
"""

import os
import random
import sys

import pyarrow as pa
import pyarrow.parquet as pq

from fixture_paths import fixture_path

random.seed(42)

WAFERS = int(sys.argv[1]) if len(sys.argv) > 1 else 10
DIES_PER_WAFER = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
N_TESTS = int(sys.argv[3]) if len(sys.argv) > 3 else 50

n = WAFERS * DIES_PER_WAFER
cols = {
    "lot": pa.array(["LOT1"] * n),
    "wafer": pa.array([f"W{w + 1:02d}" for w in range(WAFERS) for _ in range(DIES_PER_WAFER)]),
    "x": pa.array([i % 100 for i in range(n)], pa.int32()),
    "y": pa.array([(i // 100) % 100 for i in range(n)], pa.int32()),
    "hbin": pa.array([1 if random.random() < 0.9 else 4 for _ in range(n)], pa.int32()),
    "sbin": pa.array([1 if random.random() < 0.9 else 41 for _ in range(n)], pa.int32()),
}
for t in range(N_TESTS):
    cols[f"T{t + 1}"] = pa.array([random.gauss(1.0, 0.1) for _ in range(n)], pa.float64())

path = fixture_path("bench.parquet")
# snappy, not zstd: zstd is native-only in this crate's WASM build, and a bench
# fixture the web build cannot read would be a trap rather than a benchmark.
pq.write_table(pa.table(cols), path, compression="snappy")
print(f"{path}: {n:,} dies, {N_TESTS} tests, {os.path.getsize(path) / 1048576:.1f} MB "
      f"({WAFERS} wafers x {DIES_PER_WAFER} dies)")
