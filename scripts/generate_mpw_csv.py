#!/usr/bin/env python3
"""Synthetic multi-project-wafer CSV lot, for the compact layout.

    sample_data/MPW-LOT-08.csv     3 wafers

A multi-project wafer carries several designs, so each reticle holds only a few
of one design's dies and the map is mostly empty. Here a reticle repeats every
7 columns and 6 rows, and this design occupies a small L-shaped cluster of
dies at the same place in every reticle. The occupied columns and rows
therefore repeat at a regular pitch, which is what makes the compact layout
available (Overlays ▾ → Compact layout).

Each wafer has its own bin pattern: W01 is clean, W02 loses one die position in
every cluster, W03 loses its outer reticles. A map stack across the three
therefore shows structure that a single wafer does not.

Deterministic: the seed is fixed, so rerunning rewrites the same file.

Usage:
    python3 scripts/generate_mpw_csv.py
"""

import csv
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'sample_data' / 'MPW-LOT-08.csv'
LOT = 'MPW-LOT-08'
WAFERS = ['W01', 'W02', 'W03']

PERIOD_X, PERIOD_Y = 7, 6          # reticle pitch in dies
# Offsets within a reticle at which this design has a die: a 3x2 block plus one more.
CLUSTER = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (0, 2)]
RETICLES_X, RETICLES_Y = 9, 9      # reticles across and down, centred on the wafer
WAFER_RADIUS = 31.0                # in dies; reticles outside it are dropped

rng = random.Random(11)


def dies():
    """All die positions of the design: (x, y, reticle column, reticle row, offset)."""
    out = []
    for rx in range(RETICLES_X):
        for ry in range(RETICLES_Y):
            for dx, dy in CLUSTER:
                x = (rx - RETICLES_X // 2) * PERIOD_X + dx - 1
                y = (ry - RETICLES_Y // 2) * PERIOD_Y + dy - 1
                if x * x + y * y > WAFER_RADIUS * WAFER_RADIUS:
                    continue
                out.append((x, y, rx, ry, (dx, dy)))
    return out


def bin_for(wafer, rx, ry, offset):
    outer = max(abs(rx - RETICLES_X // 2), abs(ry - RETICLES_Y // 2)) >= 3
    if wafer == 'W02' and offset == (1, 1):
        return 3, 31
    if wafer == 'W03' and outer:
        return 2, 21
    if rng.random() < 0.05:
        return 2, 22
    return 1, 10


def main():
    rows = []
    for wafer in WAFERS:
        for x, y, rx, ry, offset in dies():
            hbin, sbin = bin_for(wafer, rx, ry, offset)
            rows.append([LOT, wafer, x, y, hbin, sbin])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['lot', 'wafer', 'x', 'y', 'hbin', 'sbin'])
        w.writerows(rows)
    print(f'{len(rows)} rows -> {OUT}')


if __name__ == '__main__':
    main()
