#!/usr/bin/env python3
"""Synthetic CSV lot in which some dies were probed twice — a retest pass.

    sample_data/RETEST-LOT-07.csv     3 wafers, ~300 dies each

Every die is probed once. About a fifth fail that first probe; most of those
were probed a second time, in a retest pass written after the first pass, and
roughly two thirds of the retested dies recover. A few failing dies are not
retested, so the lot has all three kinds: passed first time, recovered on
retest, still failing.

Retested dies repeat their X/Y on a later row of the same wafer, which is how a
flat file records a retest. The sample exists so the retest handling can be seen
(the die tooltip's retest count, and the log's note about repeated dies) without
a customer file.

Deterministic: the seed is fixed, so rerunning rewrites the same file.

Usage:
    python3 scripts/generate_retest_csv.py
"""

import csv
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'sample_data' / 'RETEST-LOT-07.csv'
LOT = 'RETEST-LOT-07'
WAFERS = ['W01', 'W02', 'W03']
RADIUS = 10          # die-grid radius; ~314 dies inside the circle
FAIL_RATE = 0.22     # first-pass failures
RETEST_RATE = 0.85   # share of failing dies that are probed again
RECOVER_RATE = 0.65  # share of retested dies that pass the second time

VTH_LO, VTH_HI = 380.0, 520.0   # mV, the pass window

rng = random.Random(7)


def probe(fails: bool):
    """One probe: (hbin, sbin, vth_mV, leakage_nA)."""
    if fails:
        vth = rng.choice([rng.uniform(300, VTH_LO - 5), rng.uniform(VTH_HI + 5, 600)])
        return 2, 21, round(vth, 1), round(rng.uniform(1.5, 4.0), 2)
    return 1, 10, round(rng.gauss(450, 28), 1), round(rng.uniform(0.2, 1.2), 2)


def main():
    rows = []
    for wafer in WAFERS:
        first_pass, retests = [], []
        for x in range(-RADIUS, RADIUS + 1):
            for y in range(-RADIUS, RADIUS + 1):
                if x * x + y * y > RADIUS * RADIUS:
                    continue
                failed = rng.random() < FAIL_RATE
                first_pass.append((x, y, *probe(failed)))
                if failed and rng.random() < RETEST_RATE:
                    still_failing = rng.random() >= RECOVER_RATE
                    retests.append((x, y, *probe(still_failing)))
        for x, y, hbin, sbin, vth, leak in first_pass + retests:
            rows.append([LOT, wafer, x, y, hbin, sbin, vth, leak])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['lot', 'wafer', 'x', 'y', 'hbin', 'sbin', 'vth_mV', 'leakage_nA'])
        w.writerows(rows)
    print(f'{len(rows)} rows -> {OUT}')


if __name__ == '__main__':
    main()
