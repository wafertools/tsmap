#!/usr/bin/env python3
"""Generate sample STDF and ATDF files from the wmap demo CSV data.

Cuts the four scenario lots with wafermap's demo generator (../wafermap/docs/examples/data/generate-demos.js, run for each lot's
own wafer size, see GEOMETRY) and reads their CSVs and `.meta.json` (wafer geometry, bin names, test definitions). Produces:
  - One STDF per scenario holding the lot assembled from its probe sessions (each session a whole sequence with its own MIR/SDR)
  - One STDF and ATDF per probe session (`<LOT>_S1`, ...), the way a tester writes them
  - The merged CSV (`<LOT>.csv`, every field as a column) and, where the lot has a fab split, splits CSVs
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
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
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
        self.wafer_fields = {}      # per wafer: the equipment and fab columns the wafermap CSV carries (see WAFER_FIELDS)
        with open(path) as f:
            for row in csv.DictReader(f):
                self.wafers[row['wafer']].append(row)
                self.wafer_fields.setdefault(row['wafer'], {k: row[k] for k in WAFER_FIELDS if k in row})
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


# What a tester writes into one probe session's file is fixed for that session and changes between sessions: the tester, handler,
# probe card, operator and test date. A lot is probed in several sessions, each its own file (`<LOT>_S1`, `_S2`, ...); the
# wafermap CSV carries the same fields as columns, as an export assembled from the sessions would. `split` is the fab's: it
# reaches tsmap through a splits CSV, never from the tester.
WAFER_FIELDS = ['tester', 'handler', 'probe_card', 'operator', 'test_program', 'test_date', 'split']
HANDLER_IDS = {'PRB-200': 'P-100', 'PRB-300': 'P-200'}
CARD_IDS = {'PC-A': 'C-1001', 'PC-B': 'C-1002'}
SESSION_START_HOUR = 9
WAFER_MINUTES = 40  # probe slot per wafer; the wafers of a session run back to back from its start

LOT_META = {
    'EDGE-LOT-01':  dict(scenario='edge-ring',  node='node-01'),
    'HY-LOT-04':    dict(scenario='high-yield', node='node-02'),
    'CLUST-LOT-03': dict(scenario='cluster',    node='node-02'),
    'PARAM-LOT-02': dict(scenario='parametric', node='node-03'),
}

SCENARIOS = [
    ('edge-ring.csv',  'EDGE-LOT-01', 'CHIP-A'),
    ('high-yield.csv', 'HY-LOT-04',   'CHIP-A'),
    ('cluster.csv',    'CLUST-LOT-03', 'CHIP-B'),
    ('parametric.csv', 'PARAM-LOT-02', 'CHIP-B'),
]


class Session:
    """One probe session: the equipment, operator and date shared by its wafers, and the wafers in the order they ran."""

    def __init__(self, number, fields):
        self.number, self.fields, self.wafer_ids = number, fields, []
        y, m, d = (int(x) for x in fields['test_date'].split('-'))
        self.start_t = int(datetime(y, m, d, SESSION_START_HOUR, tzinfo=timezone.utc).timestamp())

    @property
    def name(self):
        return f'S{self.number}'

    @property
    def tester(self):
        return self.fields['tester']

    @property
    def operator(self):
        return self.fields['operator']

    @property
    def program(self):
        return self.fields['test_program']

    @property
    def equipment(self):
        """(handler type, handler id, card type, card id), as an SDR names them."""
        h, c = self.fields['handler'], self.fields['probe_card']
        return (h, HANDLER_IDS.get(h, ''), c, CARD_IDS.get(c, ''))

    def wafer_times(self, wafer_id):
        """(start_t, finish_t) epochs: the wafer's slot in the session, so the Tested column of the file-filter dialog has times."""
        t = self.start_t + self.wafer_ids.index(wafer_id) * WAFER_MINUTES * 60
        return t, t + (WAFER_MINUTES - 5) * 60


def sessions_of(sc: Scenario) -> list:
    """The lot's probe sessions, in the order their first wafer appears. Wafers share a session when the file-level fields agree."""
    keys, out = {}, []
    for wafer_id in sc.wafers:
        f = sc.wafer_fields[wafer_id]
        key = (f['test_date'], f['tester'], f['handler'], f['probe_card'], f['operator'])
        if key not in keys:
            keys[key] = Session(len(out) + 1, f)
            out.append(keys[key])
        keys[key].wafer_ids.append(wafer_id)
    return out


def mir_args(lot_id, ses: Session):
    """A session's MIR: its own start, operator and temperature."""
    return dict(setup_t=ses.start_t - 600, start_t=ses.start_t, tst_temp='25', oper_nam=ses.operator)


# ── Files ─────────────────────────────────────────────────────────────────────


def build_stdf(sc: Scenario, lot_id, part_typ, wafers: dict, sessions: list) -> bytes:
    """A file for `sessions`. A lot assembled from several is their files written one after another, each a whole sequence
    (FAR to MRR) with its own MIR and SDR, the way a lot probed over several days arrives; a session's own file is one sequence."""
    return b''.join(stdf_sequence(sc, lot_id, part_typ, {w: wafers[w] for w in ses.wafer_ids if w in wafers}, ses) for ses in sessions)


def stdf_sequence(sc: Scenario, lot_id, part_typ, wafers: dict, ses: Session) -> bytes:
    m = LOT_META[lot_id]
    group = {w: 1 for w in wafers}
    session_of = {w: ses for w in wafers}
    buf = bytearray()
    buf += S.far()
    buf += S.mir(lot_id, part_typ, ses.program, ses.tester, m['node'], **mir_args(lot_id, ses))
    h_typ, h_id, c_typ, c_id = ses.equipment
    buf += S.sdr(1, 1, SITES, hand_typ=h_typ, hand_id=h_id, card_typ=c_typ, card_id=c_id)
    if sc.diameter_mm:
        buf += S.wcr(sc.diameter_mm, sc.die_h or 0, sc.die_w or 0, 3, sc.flat or ' ', S.MISSING_I2, S.MISSING_I2, ' ', ' ')
    part_id, first, last_finish = 1, True, S.TS_BASE
    hbins, sbins, all_rows = Counter(), Counter(), []
    for index, (wafer_id, rows) in enumerate(wafers.items()):
        start_t, finish_t = session_of[wafer_id].wafer_times(wafer_id)
        last_finish = max(last_finish, finish_t)
        buf += S.wir(1, wafer_id, site_grp=group[wafer_id], start_t=start_t)
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
        buf += S.wrr(1, wafer_id, len(rows), good, site_grp=group[wafer_id], finish_t=finish_t)
    for b in sorted(hbins):
        buf += S.hbr(b, hbins[b], 'P' if sc.hbin_passes(b) else 'F', sc.hbin_names.get(b, f'Bin {b}'))
    for b in sorted(sbins):
        buf += S.sbr(b, sbins[b], 'P' if sc.sbin_passes(b, all_rows) else 'F', sc.sbin_names.get(b, f'Bin {b}'))
    buf += S.file_end(part_id - 1, sum(n for b, n in hbins.items() if sc.hbin_passes(b)), finish_t=last_finish)
    return bytes(buf)


def build_atdf(sc: Scenario, lot_id, part_typ, wafers: dict, sessions: list) -> str:
    """The ATDF twin of {@link build_stdf}."""
    return ''.join(atdf_sequence(sc, lot_id, part_typ, {w: wafers[w] for w in ses.wafer_ids if w in wafers}, ses) for ses in sessions)


def atdf_sequence(sc: Scenario, lot_id, part_typ, wafers: dict, ses: Session) -> str:
    m = LOT_META[lot_id]
    group = {w: 1 for w in wafers}
    session_of = {w: ses for w in wafers}
    lines = [A.far(), A.mir(lot_id, part_typ, ses.program, m['node'], ses.tester, **mir_args(lot_id, ses))]
    lines += [A.sdr(1, 1, SITES, *ses.equipment)]
    if sc.diameter_mm:
        lines.append(A.wcr(sc.diameter_mm, sc.die_h or '', sc.die_w or '', 3, sc.flat, '', '', '', ''))
    part_id, first, last_finish = 1, True, S.TS_BASE
    hbins, sbins, all_rows = Counter(), Counter(), []
    for index, (wafer_id, rows) in enumerate(wafers.items()):
        start_t, finish_t = session_of[wafer_id].wafer_times(wafer_id)
        last_finish = max(last_finish, finish_t)
        lines.append(A.wir(1, wafer_id, start_t=start_t, site_grp=group[wafer_id]))
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
        lines.append(A.wrr(1, wafer_id, len(rows), good, finish_t=finish_t, site_grp=group[wafer_id]))
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

            sessions = sessions_of(sc)
            session_of = {w: ses for ses in sessions for w in ses.wafer_ids}
            print(f'  {len(sessions)} probe sessions: ' + '; '.join(
                f"{ses.name} {ses.tester}/{ses.fields['handler']}/{ses.fields['probe_card']}/{ses.operator} {ses.fields['test_date']} ({len(ses.wafer_ids)} wafers)"
                for ses in sessions))

            # The lot assembled from its sessions, one file per session, then one file per wafer.
            sets = [(lot_id, sc.wafers, sessions)]
            sets += [(f'{lot_id}_{ses.name}', {w: sc.wafers[w] for w in ses.wafer_ids}, [ses]) for ses in sessions]
            sets += [(f'{lot_id}_{w}', {w: sc.wafers[w]}, [session_of[w]]) for w in wafer_ids]
            for stem, wafers, ses_list in sets:
                (out_dir / f'{stem}.stdf').write_bytes(build_stdf(sc, lot_id, part_typ, wafers, ses_list))
                total_files += 1
                # An ATDF file holds exactly one MIR (the spec), so a lot of several sessions is an ATDF per session, not one file.
                if len(ses_list) == 1:
                    (out_dir / f'{stem}.atdf').write_text(build_atdf(sc, lot_id, part_typ, wafers, ses_list))
                    total_files += 1
                print(f'  {stem}.stdf{"/.atdf" if len(ses_list) == 1 else ""}  ({sum(len(r) for r in wafers.values())} dies, {len(wafers)} wafer(s))')

            # The merged export, and the fab's split where the lot has one.
            shutil.copyfile(Path(tmp) / csv_name, out_dir / f'{lot_id}.csv')
            total_files += 1
            if 'split' in sc.wafer_fields[wafer_ids[0]]:
                header = ['# tsmap wafer splits', f'# Fab split of each wafer of {lot_id}']
                for suffix, key in (('', lambda w: w), ('_sessions', lambda w: f'{lot_id} \u00b7 {w}')):
                    note = ([] if not suffix else ['# Keys use the "{lotId} \u00b7 {waferId}" form a wafer ID takes when the session files are opened together'])
                    rows = [f'{key(w)},{sc.wafer_fields[w]["split"]}' for w in wafer_ids]
                    (out_dir / f'{lot_id}{suffix}_splits.csv').write_text('\n'.join(header + note + ['waferId,split'] + rows) + '\n')
                    total_files += 1

    print(f'\nDone — {total_files} files written to {out_dir}/')


if __name__ == '__main__':
    main()
