#!/usr/bin/env python3
"""Write docs/samples/tsmap-few-tests.csv: three wafers of the sample lot (PVT-LOT-05) with four of its tests.

The file is a short wide-format CSV for the column-mapping lesson, so it carries the lot's own wafer IDs, positions, bins
and test names and values rather than invented columns. Run from the repository root:

    python3 scripts/generate_few_tests_csv.py
"""
import csv
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'sample_data' / 'PVT-LOT-05.stdf'
OUT = ROOT / 'docs' / 'samples' / 'tsmap-few-tests.csv'
WAFERS = ('W01', 'W02', 'W03')            # TT, FF, TT: two corners, so the map shows a difference
TESTS = ('vth_n_mV', 'vth_p_mV', 'idsat_n_uA', 'idsat_p_uA')


def cn(b, i):
    n = b[i]
    return b[i + 1:i + 1 + n].decode(), i + 1 + n


def main():
    data = SOURCE.read_bytes()
    rows, wafer, current = [], None, {}
    i = 0
    while i < len(data):
        length, typ, sub = struct.unpack('<HBB', data[i:i + 4])
        body = data[i + 4:i + 4 + length]
        i += 4 + length
        if (typ, sub) == (2, 10):                                   # WIR
            wafer, _ = cn(body, 6)
        elif (typ, sub) == (5, 10):                                 # PIR
            current = {}
        elif (typ, sub) == (15, 10):                                # PTR
            result = struct.unpack('<f', body[8:12])[0]
            name, _ = cn(body, 12)
            if name in TESTS:
                current[name] = round(result, 3)
        elif (typ, sub) == (5, 20) and wafer in WAFERS:             # PRR
            hbin, sbin, x, y = struct.unpack('<HHhh', body[5:13])
            rows.append([wafer, x, y, hbin, sbin, *[current.get(t, '') for t in TESTS]])
    with OUT.open('w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['wafer_id', 'x', 'y', 'hbin', 'sbin', *TESTS])
        w.writerows(rows)
    print(f'{OUT.relative_to(ROOT)}: {len(rows)} dies, {len(WAFERS)} wafers')


if __name__ == '__main__':
    main()
