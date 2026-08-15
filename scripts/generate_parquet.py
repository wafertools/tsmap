#!/usr/bin/env python3
"""Generate a synthetic wide-format Parquet file for testing tsmap's Parquet
parser (packages/parsers/src/parse_parquet.rs).

Unlike STDF/ATDF, Parquet has no reasonable hand-rolled writer — real Parquet
files are produced by pandas/pyarrow/polars/duckdb, so this uses pyarrow
directly rather than reimplementing the format, which is the point: it
exercises the parser against the same library ecosystem real test-data
exports come from.

Requires: pip install pyarrow

Usage:
    python3 scripts/generate_parquet.py /tmp/test.parquet
    python3 scripts/generate_parquet.py /tmp/test.parquet --codec zstd
    python3 scripts/generate_parquet.py /tmp/large.parquet --large --codec snappy
    python3 scripts/generate_parquet.py /tmp/corr.parquet --correlated
    python3 scripts/generate_parquet.py /tmp/custom.parquet --wafers 3 --radius 13 --tests 20

--large matches generate_stdf_large.py's scale (25 wafers, 50 tests, ~10k
dies/wafer) for a rough native-vs-web perf comparison. --codec zstd is
native-only in tsmap (see CLAUDE.md's Parquet section) — use it to exercise
that path specifically; the default (snappy) and every other codec here work
on both native and web.

--correlated ports generate_stdf_correlated.py's test design (same latent
z1/z2/z3 variables, same per-group coefficients, same expected Pearson r
ranges — see that script's docstring) to Parquet, for exercising wmap's
correlation matrix/scatter charts against Parquet-sourced data specifically.
"""

import argparse
import math
import random
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

random.seed(42)

CODECS = ['snappy', 'gzip', 'lz4', 'zstd', 'none']


def wafer_dies(radius: int) -> list[tuple[int, int]]:
    """Same circular-grid shape as generate_stdf.py's wafer_dies, so fixtures
    from either generator look like the same kind of wafer."""
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x * x + y * y <= radius * radius * 1.1
    ]


def build_table(n_wafers: int, radius: int, n_tests: int) -> pa.Table:
    tests = [
        (1000 + i, f'test_{1000 + i}', 'V', 0.0, 5.0)
        for i in range(n_tests)
    ]
    dies = wafer_dies(radius)

    cols = {
        'lot': [], 'wafer': [], 'x': [], 'y': [],
        'hbin': [], 'sbin': [], 'site': [],
    }
    for _, name, _, _, _ in tests:
        cols[name] = []

    part_counter = 1
    for wi in range(n_wafers):
        wafer_id = f'W{wi + 1:02d}'
        for (x, y) in dies:
            edge = math.sqrt(x * x + y * y) > radius * 0.8
            failed = False
            values = []
            for _, _, _, lo, hi in tests:
                centre = (lo + hi) / 2
                spread = (hi - lo) * 0.15
                v = random.gauss(centre, spread)
                if edge and random.random() < 0.15:
                    v = hi * 1.1
                    failed = True
                values.append(v)

            hbin = 2 if failed else 1
            cols['lot'].append('LOT-PARQUET-01')
            cols['wafer'].append(wafer_id)
            cols['x'].append(x)
            cols['y'].append(y)
            cols['hbin'].append(hbin)
            cols['sbin'].append(hbin)
            cols['site'].append(((part_counter - 1) % 4) + 1)
            for (_, name, _, _, _), v in zip(tests, values):
                cols[name].append(v)
            part_counter += 1

    return pa.table(cols)


# ── Correlated design (ports generate_stdf_correlated.py) ───────────────────
# (test_num, name, units, lsl, usl, centre, scale, coeff_z1, coeff_z2, coeff_z3, noise_sigma)
# value = centre + scale*(coeff_z1*z1 + coeff_z2*z2) + site_contrib + N(0, noise_sigma)
# See generate_stdf_correlated.py's docstring for the expected r ranges per group.
CORRELATED_TESTS = [
    (1001, 'leakage_nA',    'nA',    0.0,    8.0,    3.0,   1.5,   1.0,  0.0,  0.0,  1.0),
    (1002, 'ron_ohm',       'ohm',  80.0,  200.0,  130.0,  20.0,   1.0,  0.0,  0.0, 13.0),
    (1003, 'idsat_uA',      'uA',  400.0,  900.0,  650.0,  80.0,   1.0,  0.0,  0.0, 50.0),
    (1004, 'vds_sat_mV',    'mV',  100.0,  400.0,  240.0,  50.0,   1.0,  0.0,  0.0, 32.0),
    (1005, 'gm_uS',         'uS',  500.0, 1200.0,  850.0, 120.0,   1.0,  0.0,  0.0, 77.0),
    (1011, 'freq_MHz',      'MHz', 1600.0, 2400.0, 2000.0, 120.0,  -1.0,  0.0,  0.0, 77.0),
    (1012, 'vth_mV',        'mV',  220.0,  420.0,  320.0,  40.0,  -1.0,  0.0,  0.0, 26.0),
    (1013, 'ion_ratio',     '',      0.5,    2.5,    1.5,   0.3,   -1.0,  0.0,  0.0,  0.19),
    (1014, 'ioff_pA',       'pA',    0.0,   50.0,   15.0,   8.0,  -1.0,  0.0,  0.0,  5.1),
    (1021, 'cap_fF',        'fF',   80.0,  160.0,  120.0,  15.0,   0.0,  1.0,  0.0, 15.0),
    (1022, 'res_kohm',      'kohm',  5.0,   25.0,   15.0,   3.0,   0.0,  1.0,  0.0,  3.0),
    (1023, 'delay_ps',      'ps',   50.0,  200.0,  120.0,  25.0,   0.0,  1.0,  0.0, 25.0),
    (1024, 'swing_mV',      'mV',  400.0,  900.0,  650.0,  80.0,   0.0,  1.0,  0.0, 80.0),
    (1025, 'rise_ps',       'ps',   20.0,  100.0,   55.0,  12.0,   0.0,  1.0,  0.0, 12.0),
    (1031, 'vnoise_uV',     'uV',    0.0,   50.0,   20.0,   6.0,   0.35, 0.35, 0.0,  7.5),
    (1032, 'inoise_pA',     'pA',    0.0,   30.0,   12.0,   4.0,   0.35, 0.35, 0.0,  5.0),
    (1033, 'offset_mV',     'mV',  -20.0,   20.0,    0.0,   5.0,   0.35, 0.35, 0.0,  6.2),
    (1034, 'gain_dB',       'dB',   15.0,   35.0,   25.0,   3.0,   0.35, 0.35, 0.0,  3.7),
    (1035, 'bw_MHz',        'MHz',  50.0,  200.0,  120.0,  20.0,   0.35, 0.35, 0.0, 25.0),
    (1041, 'random_1',      '',      0.0,  100.0,   50.0,  15.0,   0.0,  0.0,  0.0, 15.0),
    (1042, 'random_2',      '',      0.0,  100.0,   50.0,  15.0,   0.0,  0.0,  0.0, 15.0),
    (1043, 'random_3',      'mV',    0.0,   10.0,    5.0,   1.5,   0.0,  0.0,  0.0,  1.5),
    (1044, 'random_4',      'nA',    0.0,    5.0,    2.5,   0.8,   0.0,  0.0,  0.0,  0.8),
    (1045, 'random_5',      'ohm',   0.0,  500.0,  250.0,  70.0,   0.0,  0.0,  0.0, 70.0),
    (1051, 'site_vdd_mV',   'mV',  990.0, 1010.0, 1000.0,  0.5,   0.0,  0.0,  0.0,  2.5),
    (1052, 'site_vss_mV',   'mV',   -5.0,    5.0,    0.0,   0.5,   0.0,  0.0,  0.0,  2.5),
    (1053, 'site_temp_K',   'K',   295.0,  305.0,  300.0,   0.5,   0.0,  0.0,  0.0,  2.5),
    (1054, 'contact_res',   'ohm',   0.0,   10.0,    2.0,   1.0,   0.0,  0.0,  0.0,  2.5),
    (1055, 'probe_leak_nA', 'nA',    0.0,    5.0,    0.5,   0.3,   0.0,  0.0,  0.0,  0.3),
    (1061, 'vref_mV',       'mV',  490.0,  510.0,  500.0,   3.0,   1.0,  0.0,  0.0,  0.35),
]

CORRELATED_SITE_OFFSETS = {
    1: {'vdd': +2.1, 'vss': +0.3, 'temp': +1.2, 'contact': +0.8},
    2: {'vdd': -1.4, 'vss': -0.5, 'temp': -0.9, 'contact': +1.5},
    3: {'vdd': +0.7, 'vss': +0.8, 'temp': +0.3, 'contact': +0.2},
    4: {'vdd': -1.4, 'vss': -0.6, 'temp': -0.6, 'contact': +2.1},
}


def build_correlated_table(n_wafers: int = 5, radius: int = 8) -> pa.Table:
    dies = wafer_dies(radius)
    sites = [1, 2, 3, 4]

    cols = {'lot': [], 'wafer': [], 'x': [], 'y': [], 'hbin': [], 'sbin': [], 'site': []}
    for _, name, *_ in CORRELATED_TESTS:
        cols[name] = []

    part_counter = 1
    for wi in range(n_wafers):
        wafer_id = f'W{wi + 1:02d}'
        for i, (x, y) in enumerate(dies):
            site = sites[i % len(sites)]
            edge = math.sqrt(x * x + y * y) > radius * 0.8125  # matches STDF version's 6.5/8 ratio

            z1 = random.gauss(0, 1)
            z2 = random.gauss(0, 1)
            if edge:
                z1 += random.gauss(1.5, 0.5)

            so = CORRELATED_SITE_OFFSETS[site]
            failed_count = 0
            for tnum, name, _, lsl, usl, centre, scale, c1_, c2, _c3, noise in CORRELATED_TESTS:
                site_contrib = 0.0
                if tnum == 1051: site_contrib = so['vdd']
                elif tnum == 1052: site_contrib = so['vss']
                elif tnum == 1053: site_contrib = so['temp']
                elif tnum == 1054: site_contrib = so['contact']

                meas_noise = random.gauss(0, noise) if noise > 0 else 0.0
                val = centre + scale * (c1_ * z1 + c2 * z2) + site_contrib + meas_noise
                if not (lsl <= val <= usl):
                    failed_count += 1
                cols[name].append(val)

            hbin = 1 if failed_count == 0 else (2 if failed_count <= 2 else 3)
            cols['lot'].append('LOT-CORR-01')
            cols['wafer'].append(wafer_id)
            cols['x'].append(x)
            cols['y'].append(y)
            cols['hbin'].append(hbin)
            cols['sbin'].append(hbin)
            cols['site'].append(site)
            part_counter += 1

    return pa.table(cols)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('output', nargs='?', default='/tmp/test.parquet', type=Path)
    ap.add_argument('--codec', choices=CODECS, default='snappy')
    ap.add_argument('--large', action='store_true', help='25 wafers, 50 tests, ~10k dies/wafer (matches generate_stdf_large.py)')
    ap.add_argument('--correlated', action='store_true', help='5 wafers, 30 tests with designed Pearson r ranges (ports generate_stdf_correlated.py)')
    ap.add_argument('--wafers', type=int, default=None, help='override wafer count')
    ap.add_argument('--radius', type=int, default=None, help='override wafer die-grid radius (dies/wafer ~ pi*r^2*1.1)')
    ap.add_argument('--tests', type=int, default=None, help='override test count (wide format only, not with --correlated)')
    args = ap.parse_args()
    if args.large and args.correlated:
        ap.error('--large and --correlated are mutually exclusive')
    if args.correlated and args.tests is not None:
        ap.error('--tests has no effect with --correlated — its 30 tests are a fixed, designed set')

    if args.correlated:
        n_wafers, radius = 5, 8
        n_wafers = args.wafers if args.wafers is not None else n_wafers
        radius = args.radius if args.radius is not None else radius
        table = build_correlated_table(n_wafers, radius)
        n_tests = len(CORRELATED_TESTS)
    else:
        if args.large:
            n_wafers, radius, n_tests = 25, 56, 50  # radius 56 -> ~10k dies in the circle
        else:
            n_wafers, radius, n_tests = 3, 8, 10
        n_wafers = args.wafers if args.wafers is not None else n_wafers
        radius = args.radius if args.radius is not None else radius
        n_tests = args.tests if args.tests is not None else n_tests
        table = build_table(n_wafers, radius, n_tests)

    compression = None if args.codec == 'none' else args.codec
    pq.write_table(table, args.output, compression=compression)

    size = args.output.stat().st_size
    print(f"Written {size:,} bytes ({args.codec}) → {args.output}")
    print(f"  {n_wafers} wafers × {len(table) // n_wafers:,} dies, {n_tests} tests, {table.num_columns} columns")


if __name__ == '__main__':
    sys.exit(main())
