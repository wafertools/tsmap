#!/usr/bin/env python3
"""Generate matching CSV/JSON/Parquet fixtures that exercise real test-number
mapping (`testnumberCol` for long format, bare-numeric column headers for wide
format — see CLAUDE.md's "Test number (long format)" mapping support).

Every other CSV/JSON/Parquet fixture in this repo identifies tests by NAME
only (`test_name`/`test_000`-style columns) — none exercise a file that
carries the test's real number instead. These do, in both layouts:

  TESTNUM-LONG-01.{csv,json,parquet} — long/pivot format, NUMBER ONLY (no
    name column at all) — proves the no-name case is fully supported and the
    display name falls back to the number itself.
  TESTNUM-WIDE-01.{csv,json,parquet} — wide format, columns literally named
    by their bare test number ("2101", not "test_2101") — proves the wide
    mapping path uses that real number directly instead of hashing it away.

Requires: pip install pyarrow (only for the .parquet output)

Usage:
    python3 scripts/generate_testnumber_samples.py [output_dir]
"""

import csv
import json
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

WAFERS = ['W01', 'W02']
DIES = [(0, 0), (1, 0), (0, 1), (1, 1)]  # small and easy to eyeball by hand

# ── Long format, number only ─────────────────────────────────────────────────
# (test_num, base_value, step) — value = base + step * die_index, so every
# cell is distinct and easy to sanity-check against the source.
LONG_TESTS = [(2001, 100.0, 1.5), (2002, 200.0, -2.0), (2003, 300.0, 0.5)]


def build_long_rows() -> list[dict]:
    rows = []
    for w in WAFERS:
        for i, (x, y) in enumerate(DIES):
            hbin = 1 if i % 3 != 0 else 2
            for tnum, base, step in LONG_TESTS:
                rows.append({
                    'wafer': w, 'x': x, 'y': y, 'hbin': hbin, 'sbin': hbin,
                    'test_num': tnum, 'test_val': round(base + step * i, 3),
                })
    return rows


def write_long_csv(rows: list[dict], path: Path) -> None:
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['wafer', 'x', 'y', 'hbin', 'sbin', 'test_num', 'test_val'])
        w.writeheader()
        w.writerows(rows)


def write_long_json(rows: list[dict], path: Path) -> None:
    path.write_text(json.dumps(rows, indent=2))


def write_long_parquet(rows: list[dict], path: Path) -> None:
    cols = {k: [r[k] for r in rows] for k in rows[0]}
    pq.write_table(pa.table(cols), path, compression='snappy')


# ── Wide format, bare-numeric column headers ─────────────────────────────────
WIDE_TESTS = [(3001, 10.0, 0.25), (3002, 20.0, -0.5), (3003, 30.0, 0.1)]


def build_wide_rows() -> list[dict]:
    rows = []
    for w in WAFERS:
        for i, (x, y) in enumerate(DIES):
            hbin = 1 if i % 3 != 0 else 2
            row = {'wafer': w, 'x': x, 'y': y, 'hbin': hbin, 'sbin': hbin}
            for tnum, base, step in WIDE_TESTS:
                row[str(tnum)] = round(base + step * i, 3)
            rows.append(row)
    return rows


def write_wide_csv(rows: list[dict], path: Path) -> None:
    fieldnames = ['wafer', 'x', 'y', 'hbin', 'sbin'] + [str(t[0]) for t in WIDE_TESTS]
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def write_wide_json(rows: list[dict], path: Path) -> None:
    path.write_text(json.dumps(rows, indent=2))


def write_wide_parquet(rows: list[dict], path: Path) -> None:
    cols = {k: [r[k] for r in rows] for k in rows[0]}
    pq.write_table(pa.table(cols), path, compression='snappy')


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('sample_data')
    out_dir.mkdir(parents=True, exist_ok=True)

    long_rows = build_long_rows()
    write_long_csv(long_rows, out_dir / 'TESTNUM-LONG-01.csv')
    write_long_json(long_rows, out_dir / 'TESTNUM-LONG-01.json')
    write_long_parquet(long_rows, out_dir / 'TESTNUM-LONG-01.parquet')

    wide_rows = build_wide_rows()
    write_wide_csv(wide_rows, out_dir / 'TESTNUM-WIDE-01.csv')
    write_wide_json(wide_rows, out_dir / 'TESTNUM-WIDE-01.json')
    write_wide_parquet(wide_rows, out_dir / 'TESTNUM-WIDE-01.parquet')

    print(f"Written 6 files to {out_dir}/:")
    print(f"  TESTNUM-LONG-01.{{csv,json,parquet}} — long format, number only ({len(WAFERS)} wafers x {len(DIES)} dies x {len(LONG_TESTS)} tests)")
    print(f"  TESTNUM-WIDE-01.{{csv,json,parquet}}  — wide format, bare-numeric column headers")


if __name__ == '__main__':
    sys.exit(main())
