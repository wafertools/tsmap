#!/usr/bin/env python3
"""Generate sample STDF and ATDF files from the wmap demo CSV data.

Cuts the four scenario lots with wafermap's demo generator (../wafermap/docs/examples/data/generate-demos.js, run for each lot's
own wafer size, see GEOMETRY) and reads their CSVs and `.meta.json` (wafer geometry, bin names, test definitions). Produces:
  - One multi-wafer STDF and ATDF per scenario (all wafers in one file)
  - One single-wafer STDF and ATDF per wafer (named <LOT>_<WAFER>.stdf/.atdf)

Every file is built with the one spec-conformant set of record builders (stdf_spec.py, atdf_spec.py): a complete initial sequence
(FAR, MIR, SDR), the wafer geometry (WCR), the wafers, bin names and counts (HBR/SBR), and the closing PCR and MRR.
`scripts/validate_stdf_atdf.py` checks the output against the specifications.

Output directory defaults to ./sample_data/ (created if needed).

Usage:
  python3 scripts/generate_sample_files.py [output_dir]
"""

import csv
import json
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

import random

import atdf_spec as A
import stdf_spec as S

GENERATOR = Path(__file__).parent.parent.parent / 'wafermap' / 'docs' / 'examples' / 'data' / 'generate-demos.js'

# Each lot's wafer: diameter and die pitch in mm (PITCH, or PITCHXxPITCHY for a rectangular die). A spread of common sizes and
# die counts, so the sample lots exercise a sparse wafer and a dense one: 150 mm at 10 mm (145 dies), 200 mm at 8x6 (581),
# 300 mm at 10x8 (799), 300 mm at 5 mm (2,709).
GEOMETRY = {
    'edge-ring':  '300:10x8',
    'high-yield': '150:10',
    'cluster':    '200:8x6',
    'parametric': '300:5',
}


def cut_scenarios(out_dir: Path) -> None:
    """Write the four scenario CSVs and their .meta.json files to out_dir, each lot at its own wafer size."""
    args = ['node', str(GENERATOR), '--out', str(out_dir)]
    for name, geometry in GEOMETRY.items():
        args += ['--geometry', f'{name}={geometry}']
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


# ── Scenario data ─────────────────────────────────────────────────────────────


def ascii_text(s: str) -> str:
    """STDF and ATDF text is 7-bit ASCII: a micro sign becomes u (µA → uA)."""
    return s.replace('µ', 'u').replace('Ω', 'ohm').encode('ascii', 'replace').decode('ascii')


class Scenario:
    """One lot's wafers (rows by wafer, in file order) and what its `.meta.json` says about them."""

    def __init__(self, data_dir: Path, csv_name: str):
        path = data_dir / csv_name
        meta = json.loads(path.with_suffix('.meta.json').read_text())
        self.wafers = defaultdict(list)
        with open(path) as f:
            for row in csv.DictReader(f):
                self.wafers[row['wafer']].append(row)
        self.pass_bins = set(meta.get('passBins', [1]))
        self.hbin_names = {b['bin']: ascii_text(b['name']) for b in meta.get('hbinDefs', [])}
        self.sbin_names = {b['bin']: ascii_text(b['name']) for b in meta.get('sbinDefs', [])}
        wc, dc = meta.get('waferConfig', {}), meta.get('dieConfig', {})
        self.diameter_mm, self.die_w, self.die_h = wc.get('diameter'), dc.get('width'), dc.get('height')
        self.flat = {'top': 'U', 'bottom': 'D', 'left': 'L', 'right': 'R'}.get((wc.get('notch') or {}).get('type'), '')
        # (number, name, units, lo, hi, csv column): the column is the test's name in lower case.
        self.tests = [(t['testNumber'], ascii_text(t['name']), ascii_text(t.get('unit', '')), t.get('limitLow'), t.get('limitHigh'),
                       t['name'].lower()) for t in meta['testDefs']]

    def hbin_passes(self, hbin: int) -> bool:
        return hbin in self.pass_bins

    def sbin_passes(self, sbin: int, rows) -> bool:
        """A soft bin passes when every die in it is in a passing hard bin."""
        return all(self.hbin_passes(int(r['hbin'])) for r in rows if int(r['sbin']) == sbin)


# The functional tests every die runs after its parametric ones: (number, name, chance it fails on a die that fails the bin).
# A die in a pass bin passes them all; of the failing dies, each of these is what failed on some share, so the functional
# pass-rate and "Fails together" charts have something to rank. The draw is seeded by the die, so the STDF, the ATDF and the
# single-wafer files agree on every result.
FUNCTIONAL = [(2001, 'scan_chain', 0.30), (2002, 'bist_mem', 0.18), (2003, 'io_loopback', 0.10), (2004, 'pll_lock', 0.10),
              (2005, 'jtag_idcode', 0.03)]
# A lot's own weak spot: the bin story each lot tells makes one of these more likely.
FUNCTIONAL_BIAS = {'cluster': {2002: 2.5}, 'edge-ring': {2003: 2.5}, 'parametric': {2004: 2.5}}


def functional_results(lot_id, wafer_id, x, y, passed):
    rng = random.Random(f'{lot_id}/{wafer_id}/{x}/{y}')
    bias = FUNCTIONAL_BIAS.get(LOT_META[lot_id]['scenario'], {})
    return [(num, name, passed or rng.random() >= min(0.95, p * bias.get(num, 1.0))) for num, name, p in FUNCTIONAL]


def touchdown_site(x, y):
    """The site of a die on a 2 x 2 probe card: neighbouring dies are probed together, so the site follows the die's position."""
    return 1 + (x & 1) + 2 * (y & 1)


SITES = [1, 2, 3, 4]


def within(value: float, lo, hi) -> bool:
    return (lo is None or value >= lo) and (hi is None or value <= hi)


# Per-lot MIR metadata so the faceting demo has fields that actually VARY across lots: program, temperature, test date (epoch),
# operator, tester, node, and the equipment an SDR names (handler, probe card). Dates are days apart so "group by date" buckets
# distinctly.
DAY = 86_400
BASE_EPOCH = 1_750_000_000  # ~2025-06-15
LOT_META = {
    'EDGE-LOT-01':  dict(scenario='edge-ring', program='EDGE_v2',  temp='25',  start_t=BASE_EPOCH,           oper='alice', tstr='Tester-1', node='node-01',
                         handler='PRB-200', handler_id='P-100', card='PC-A', card_id='C-1001'),
    'HY-LOT-04':    dict(scenario='high-yield', program='HY_v3',    temp='25',  start_t=BASE_EPOCH + 1 * DAY, oper='bob',   tstr='Tester-1', node='node-02',
                         handler='PRB-200', handler_id='P-100', card='PC-A', card_id='C-1002'),
    'CLUST-LOT-03': dict(scenario='cluster', program='CLUST_v1', temp='-40', start_t=BASE_EPOCH + 5 * DAY, oper='alice', tstr='Tester-2', node='node-02',
                         handler='PRB-300', handler_id='P-200', card='PC-B', card_id='C-2001'),
    'PARAM-LOT-02': dict(scenario='parametric', program='PARAM_v5', temp='85',  start_t=BASE_EPOCH + 5 * DAY, oper='carol', tstr='Tester-2', node='node-03',
                         handler='PRB-300', handler_id='P-200', card='PC-B', card_id='C-2002'),
}

SCENARIOS = [
    ('edge-ring.csv',  'EDGE-LOT-01', 'CHIP-A'),
    ('high-yield.csv', 'HY-LOT-04',   'CHIP-A'),
    ('cluster.csv',    'CLUST-LOT-03', 'CHIP-B'),
    ('parametric.csv', 'PARAM-LOT-02', 'CHIP-B'),
]

WAFER_MINUTES = 40  # probe slot per wafer; wafers run back to back from the lot start


def wafer_times(lot_id, wafer_id, index):
    """(start_t, finish_t) epochs for one wafer: its slot after the lot's MIR start, so the file-filter dialog's Tested column has
    real wafer times to show. The slot comes from the wafer number (W03 → third), not the position in this file, so a single-wafer
    file carries the same time as that wafer in the whole-lot file."""
    start = LOT_META[lot_id]['start_t']
    digits = ''.join(ch for ch in wafer_id if ch.isdigit())
    slot = int(digits) - 1 if digits else index
    t = start + slot * WAFER_MINUTES * 60
    return t, t + (WAFER_MINUTES - 5) * 60


def mir_args(lot_id):
    m = LOT_META[lot_id]
    return dict(setup_t=m['start_t'] - 600, start_t=m['start_t'], oper_nam=m['oper'], tst_temp=m['temp'])


def equipment(lot_id):
    m = LOT_META[lot_id]
    return (m['handler'], m['handler_id'], m['card'], m['card_id'])


# ── Files ─────────────────────────────────────────────────────────────────────


def build_stdf(sc: Scenario, lot_id, part_typ, wafers: dict) -> bytes:
    m = LOT_META[lot_id]
    h_typ, h_id, c_typ, c_id = equipment(lot_id)
    buf = bytearray()
    buf += S.far()
    buf += S.mir(lot_id, part_typ, m['program'], m['tstr'], m['node'], **mir_args(lot_id))
    buf += S.sdr(1, 1, SITES, hand_typ=h_typ, hand_id=h_id, card_typ=c_typ, card_id=c_id)
    if sc.diameter_mm:
        buf += S.wcr(sc.diameter_mm, sc.die_h or 0, sc.die_w or 0, 3, sc.flat or ' ', S.MISSING_I2, S.MISSING_I2, ' ', ' ')
    part_id, first, last_finish = 1, True, S.TS_BASE
    hbins, sbins, all_rows = Counter(), Counter(), []
    for index, (wafer_id, rows) in enumerate(wafers.items()):
        start_t, finish_t = wafer_times(lot_id, wafer_id, index)
        last_finish = max(last_finish, finish_t)
        buf += S.wir(1, wafer_id, site_grp=1, start_t=start_t)
        good = 0
        for row in rows:
            x, y, hbin, sbin = int(row['x']), int(row['y']), int(row['hbin']), int(row['sbin'])
            passed = sc.hbin_passes(hbin)
            site = touchdown_site(x, y)
            buf += S.pir(1, site)
            for tnum, tname, units, lo, hi, col in sc.tests:
                v = float(row[col])
                buf += S.ptr(tnum, 1, site, v, within(v, lo, hi), tname, lo, hi, units, first=first)
            first = False
            for fnum, fname, fok in functional_results(lot_id, wafer_id, x, y, passed):
                buf += S.ftr(fnum, 1, site, fok, fname)
            buf += S.prr(1, site, x, y, hbin, sbin, part_id, passed, num_test=len(sc.tests) + len(FUNCTIONAL))
            part_id += 1
            good += passed
            hbins[hbin] += 1
            sbins[sbin] += 1
        all_rows += rows
        buf += S.wrr(1, wafer_id, len(rows), good, site_grp=1, finish_t=finish_t)
    for b in sorted(hbins):
        buf += S.hbr(b, hbins[b], 'P' if sc.hbin_passes(b) else 'F', sc.hbin_names.get(b, f'Bin {b}'))
    for b in sorted(sbins):
        buf += S.sbr(b, sbins[b], 'P' if sc.sbin_passes(b, all_rows) else 'F', sc.sbin_names.get(b, f'Bin {b}'))
    buf += S.file_end(part_id - 1, sum(n for b, n in hbins.items() if sc.hbin_passes(b)), finish_t=last_finish)
    return bytes(buf)


def build_atdf(sc: Scenario, lot_id, part_typ, wafers: dict) -> str:
    m = LOT_META[lot_id]
    lines = [A.far(), A.mir(lot_id, part_typ, m['program'], m['node'], m['tstr'], **mir_args(lot_id)),
             A.sdr(1, 1, SITES, *equipment(lot_id))]
    if sc.diameter_mm:
        lines.append(A.wcr(sc.diameter_mm, sc.die_h or '', sc.die_w or '', 3, sc.flat, '', '', '', ''))
    part_id, first, last_finish = 1, True, S.TS_BASE
    hbins, sbins, all_rows = Counter(), Counter(), []
    for index, (wafer_id, rows) in enumerate(wafers.items()):
        start_t, finish_t = wafer_times(lot_id, wafer_id, index)
        last_finish = max(last_finish, finish_t)
        lines.append(A.wir(1, wafer_id, start_t=start_t, site_grp=1))
        good = 0
        for row in rows:
            x, y, hbin, sbin = int(row['x']), int(row['y']), int(row['hbin']), int(row['sbin'])
            passed = sc.hbin_passes(hbin)
            site = touchdown_site(x, y)
            lines.append(A.pir(1, site))
            for tnum, tname, units, lo, hi, col in sc.tests:
                v = float(row[col])
                lines.append(A.ptr(tnum, 1, site, v, within(v, lo, hi), tname, lo, hi, units, first=first))
            first = False
            for fnum, fname, fok in functional_results(lot_id, wafer_id, x, y, passed):
                lines.append(A.ftr(fnum, 1, site, fok, fname))
            lines.append(A.prr(1, site, x, y, hbin, sbin, part_id, passed, num_tests=len(sc.tests) + len(FUNCTIONAL)))
            part_id += 1
            good += passed
            hbins[hbin] += 1
            sbins[sbin] += 1
        all_rows += rows
        lines.append(A.wrr(1, wafer_id, len(rows), good, finish_t=finish_t, site_grp=1))
    for b in sorted(hbins):
        lines.append(A.hbr(b, hbins[b], 'P' if sc.hbin_passes(b) else 'F', sc.hbin_names.get(b, f'Bin {b}')))
    for b in sorted(sbins):
        lines.append(A.sbr(b, sbins[b], 'P' if sc.sbin_passes(b, all_rows) else 'F', sc.sbin_names.get(b, f'Bin {b}')))
    lines.append(A.file_end(part_id - 1, sum(n for b, n in hbins.items() if sc.hbin_passes(b)), finish_t=last_finish))
    return ''.join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / 'sample_data'
    out_dir.mkdir(parents=True, exist_ok=True)

    total_files = 0
    with tempfile.TemporaryDirectory() as tmp:
        cut_scenarios(Path(tmp))
        for csv_name, lot_id, part_typ in SCENARIOS:
            sc = Scenario(Path(tmp), csv_name)
            wafer_ids = list(sc.wafers)
            print(f'\n{lot_id} ({len(wafer_ids)} wafers from {csv_name}, {GEOMETRY[csv_name[:-4]]})')

            # Multi-wafer file, then one file per wafer.
            sets = [(lot_id, sc.wafers)] + [(f'{lot_id}_{w}', {w: sc.wafers[w]}) for w in wafer_ids]
            for stem, wafers in sets:
                (out_dir / f'{stem}.stdf').write_bytes(build_stdf(sc, lot_id, part_typ, wafers))
                (out_dir / f'{stem}.atdf').write_text(build_atdf(sc, lot_id, part_typ, wafers))
                total_files += 2
                print(f'  {stem}.stdf/.atdf  ({sum(len(r) for r in wafers.values())} dies, {len(wafers)} wafer(s))')

    print(f'\nDone — {total_files} files written to {out_dir}/')


if __name__ == '__main__':
    main()
