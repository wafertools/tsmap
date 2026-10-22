#!/usr/bin/env python3
"""Generate a synthetic ATDF file for testing the tsmap parser.
3 wafers, ~200 dies, 4-site parallel test, 3 PTR + 1 FTR tests.
"""
import math, random, sys
from pathlib import Path
from fixture_paths import fixture_path
import atdf_spec as a   # the one spec-conformant set of ATDF record builders

random.seed(42)

TESTS = [
    (1001, 'leakage_nA',  'nA',  0.0,   5.0),
    (1002, 'vth_mV',      'mV',  180.0, 380.0),
    (1003, 'freq_MHz',    'MHz', 1800.0, 2200.0),
]
FT_NUM, FT_NAME = 2001, 'scan_chain'
SITES  = [1, 2, 3, 4]
WAFERS = ['W01', 'W02', 'W03']

def wafer_dies(radius=8):
    return [(x, y) for y in range(-radius, radius+1)
                   for x in range(-radius, radius+1)
                   if x*x + y*y <= radius*radius * 1.1]

def generate(out: Path):
    lines = [a.far(), a.mir('LOT-001', 'CHIP-X', 'test_program', 'node-01', 'UltraTester-9000'), a.sdr(1, 1, SITES)]

    dies = wafer_dies(8)
    part_id = 1
    lot_good = 0

    for wafer_id in WAFERS:
        lines.append(a.wir(1, wafer_id, site_grp=1))
        part_cnt = good_cnt = 0

        for batch_start in range(0, len(dies), len(SITES)):
            batch = dies[batch_start:batch_start+len(SITES)]
            for si, (x, y) in enumerate(batch):
                lines.append(a.pir(1, SITES[si]))

            for si, (x, y) in enumerate(batch):
                site = SITES[si]
                edge = math.sqrt(x*x + y*y) > 6.5
                failed = []

                for tnum, tname, units, lo, hi in TESTS:
                    centre = (lo+hi)/2
                    value  = random.gauss(centre, (hi-lo)*0.15)
                    if edge and random.random() < 0.15:
                        value = hi * 1.1
                    passed = lo <= value <= hi
                    if not passed: failed.append(tnum)
                    # The first PTR of a test carries its name, units and limits; the rest stop after ALARM_ID.
                    lines.append(a.ptr(tnum, 1, site, value, passed, tname, lo, hi, units, first=(batch_start == 0 and si == 0)))

                ft_pass = not (edge and random.random() < 0.05)
                if not ft_pass: failed.append(FT_NUM)
                lines.append(a.ftr(FT_NUM, 1, site, ft_pass, FT_NAME))

                die_pass = len(failed) == 0
                hbin = 1 if die_pass else (2 if len(failed)==1 else 3)
                lines.append(a.prr(1, site, x, y, hbin, hbin, part_id, die_pass))
                part_id += 1
                part_cnt += 1
                if die_pass:
                    good_cnt += 1
                    lot_good += 1

        lines.append(a.wrr(1, wafer_id, part_cnt, good_cnt, site_grp=1))

    lines.append(a.file_end(part_id - 1, lot_good))
    out.write_text(''.join(lines))
    print(f"Written {out} — {len(WAFERS)} wafers × ~{len(dies)} dies")

if __name__ == '__main__':
    generate(Path(sys.argv[1]) if len(sys.argv) > 1 else fixture_path('test.atdf'))
