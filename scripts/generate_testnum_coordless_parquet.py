#!/usr/bin/env python3
"""Generate sample_data/TESTNUM-COORDLESS-01.parquet — the Parquet twin of the
already-committed TESTNUM-COORDLESS-01.{csv,json} fixtures (same 11 rows: W01
fully positioned, W02 mixed, W03 fully coordinate-less). Kept as its own
one-off script, matching this repo's convention of standalone generators
rather than a shared module (see generate_stdf_coordinateless.py).

Requires: pip install pyarrow

Usage:
    python3 scripts/generate_testnum_coordless_parquet.py [output_dir]
"""

import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

ROWS = [
    {'wafer': 'W01', 'x': 0, 'y': 0, 'hbin': 2, 'sbin': 2, '3001': 10.0, '3002': 20.0, '3003': 30.0},
    {'wafer': 'W01', 'x': 1, 'y': 0, 'hbin': 1, 'sbin': 1, '3001': 10.25, '3002': 19.5, '3003': 30.1},
    {'wafer': 'W01', 'x': 0, 'y': 1, 'hbin': 1, 'sbin': 1, '3001': 10.5, '3002': 19.0, '3003': 30.2},
    {'wafer': 'W01', 'x': 1, 'y': 1, 'hbin': 2, 'sbin': 2, '3001': 10.75, '3002': 18.5, '3003': 30.3},
    {'wafer': 'W02', 'x': 0, 'y': 0, 'hbin': 1, 'sbin': 1, '3001': 11.0, '3002': 20.5, '3003': 29.5},
    {'wafer': 'W02', 'x': 1, 'y': 0, 'hbin': 1, 'sbin': 1, '3001': 11.1, '3002': 20.4, '3003': 29.6},
    {'wafer': 'W02', 'x': None, 'y': None, 'hbin': 2, 'sbin': 2, '3001': 11.2, '3002': 20.3, '3003': 29.7},
    {'wafer': 'W02', 'x': None, 'y': None, 'hbin': 1, 'sbin': 1, '3001': 11.3, '3002': 20.2, '3003': 29.8},
    {'wafer': 'W03', 'x': None, 'y': None, 'hbin': 1, 'sbin': 1, '3001': 12.0, '3002': 21.0, '3003': 28.0},
    {'wafer': 'W03', 'x': None, 'y': None, 'hbin': 2, 'sbin': 2, '3001': 12.1, '3002': 21.1, '3003': 28.1},
    {'wafer': 'W03', 'x': None, 'y': None, 'hbin': 1, 'sbin': 1, '3001': 12.2, '3002': 21.2, '3003': 28.2},
]


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('sample_data')
    out_dir.mkdir(parents=True, exist_ok=True)
    cols = {k: [r[k] for r in ROWS] for k in ROWS[0]}
    schema = pa.schema([
        ('wafer', pa.string()), ('x', pa.int32()), ('y', pa.int32()),
        ('hbin', pa.int32()), ('sbin', pa.int32()),
        ('3001', pa.float64()), ('3002', pa.float64()), ('3003', pa.float64()),
    ])
    table = pa.table(cols, schema=schema)
    out_path = out_dir / 'TESTNUM-COORDLESS-01.parquet'
    pq.write_table(table, out_path, compression='snappy')
    print(f"Written {out_path} ({len(ROWS)} rows)")


if __name__ == '__main__':
    sys.exit(main())
