#!/usr/bin/env python3
"""Synthetic long-format CSV lot in which a few readings are tester clamps.

    sample_data/VALID-LOT-09.csv     3 wafers, ~300 dies each, three tests

A tester that runs out of range records its rail instead of a reading. Here:

  idsat_uA    a few dies hit the 5000 uA compliance clamp
  vth_mV      a few dies read 0 mV when the probe does not make contact
  ioff_nA     a few dies overflow the ammeter and read its 9999999 nA rail

Each row carries the test limits (lo_limit/hi_limit) and the validity limits
(lvl/uvl: the range a real measurement lies in), so **Setup > Exclude values
outside limits...** has something to exclude with no further setup. The bins are
the die's recorded result and are not touched by the clamps, so yield is the same
whether the clamped values are used or not.

Deterministic: the seed is fixed, so rerunning rewrites the same file.

Usage:
    python3 scripts/generate_validity_csv.py
"""

import csv
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'sample_data' / 'VALID-LOT-09.csv'
LOT = 'VALID-LOT-09'
WAFERS = ['W01', 'W02', 'W03']
RADIUS = 10          # die-grid radius; ~314 dies inside the circle
FAIL_RATE = 0.12
CLAMP_RATE = 0.02    # per test, per die

# name, units, mean, sigma, (lo_limit, hi_limit), (lvl, uvl), clamp value
TESTS = [
    ('idsat_uA', 'uA', 1800.0, 140.0, (1400.0, 2300.0), (0.0, 4000.0), 5000.0),
    ('vth_mV',   'mV',  450.0,  28.0, (380.0,  520.0),  (100.0, 900.0), 0.0),
    ('ioff_nA',  'nA',   12.0,   3.0, (None,    40.0),  (0.0, 1000.0), 9999999.0),
]

rng = random.Random(9)


def main():
    rows = []
    for wafer in WAFERS:
        for x in range(-RADIUS, RADIUS + 1):
            for y in range(-RADIUS, RADIUS + 1):
                if x * x + y * y > RADIUS * RADIUS:
                    continue
                fails = rng.random() < FAIL_RATE
                hbin, sbin = (2, 21) if fails else (1, 10)
                for name, units, mean, sigma, (lo, hi), (lvl, uvl), clamp in TESTS:
                    value = rng.gauss(mean * (1.15 if fails else 1.0), sigma * (2.0 if fails else 1.0))
                    value = max(value, 0.01)
                    if rng.random() < CLAMP_RATE:
                        value = clamp
                    rows.append([LOT, wafer, x, y, hbin, sbin, name, round(value, 3), units,
                                 '' if lo is None else lo, '' if hi is None else hi, lvl, uvl])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['lot', 'wafer', 'x', 'y', 'hbin', 'sbin', 'test_name', 'test_val', 'units',
                    'lo_limit', 'hi_limit', 'lvl', 'uvl'])
        w.writerows(rows)
    print(f'{len(rows)} rows -> {OUT}')


if __name__ == '__main__':
    main()
