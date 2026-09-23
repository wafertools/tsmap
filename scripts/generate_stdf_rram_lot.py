#!/usr/bin/env python3
"""Generate a synthetic resistive-memory (ReRAM) characterisation lot, with the
definitions files that turn it into a sweeps + derived-tests demo.

Produces, next to the output path (default sample_data/RRAM-LOT-06.stdf):

  RRAM-LOT-06.stdf           6 wafers, ~220 dies each, 76 PTR tests + 1 FTR
  RRAM-LOT-06_testdefs.csv   readable names for every test, plus 7 DERIVED
                             tests (rows with an expression)
  RRAM-LOT-06_sweeps.json    2 sweeps for Insights → Sweeps

Load the .stdf; in the test selector, Load definitions → the _testdefs.csv;
import; then Setup ▾ → Sweeps… → Load… → the _sweeps.json, and open Insights.

THE SWEEPS
----------
1. Set / reset switching (tests 3000-3030 and 3100-3130, -1.5 V to +1.5 V in
   0.1 V steps). Two series of read current, one per operation:

     reset — high on the left, curving over, then falling steeply at the reset
             voltage (about -0.5 V) to a small leakage floor;
     set   — the mirror: a small floor, rising steeply at the set voltage
             (about +0.5 V), curving off into a compliance plateau on the right.

   Each is strictly monotonic (a leakage term keeps even the floor sloping),
   so the pair traces a V: they cross once, near the bottom, and the V's width
   at 10 µA and 50 µA is the voltage window between set and reset. Set/reset
   voltages vary die to die, so the p10-p90 band is widest on the steep parts —
   the spread of switching voltages across the population.

2. Endurance (tests 3200-3206 and 3300-3306): LRS and HRS read current after
   10^0 .. 10^6 cycles. They converge; the crossing is where the median read
   window closes. The cycle count is read from each test's name ("{x}*cyc":
   the number before "cyc", in `Ilrs_1e3cyc` and in `LRS read I @ 1e3 cycles`
   alike) and plotted on a log axis, so the axis reads cycles, not log10.

Both sweeps name their tests as ranges ("3000..3030"), the syntax a derived
test's expression uses.

THE DERIVED TESTS (numbers 900001+)
-----------------------------------
Set plateau / Reset plateau (range means), Plateau mismatch (reads the two
derived plateaus — nesting), Memory window in decades (log10 of a derived
over a measured test), Endurance LRS loss (%), Endurance window at 1e5 cycles,
and Switching OK — a functional (pass/fail) test from a recorded verdict and
two comparisons. Each has limits, so they colour maps and feed capability.

Die-level physics is loose and deliberately so: this is a demo of the charts,
not a device model. What is kept honest is the shape the charts are for.
"""

import json
import math
import random
import sys
from pathlib import Path

# Record encoders shared with the corner-lot generator. Its module-level
# random.seed runs on import, so ours is set after.
from generate_stdf_corner_lot import (
    cn, u1, u2, u4, i2, r4, b1, c1, record,
    FAR, MIR, PIR, PRR, PTR,
    far, wcr, sdr, hbr, sbr, wir, wrr, pir, ftr_rec, wafer_dies,
)

random.seed(2026)

LOT = 'RRAM-LOT-06'
SITES = [1, 2, 3, 4]
WAFERS = ['W01', 'W02', 'W03', 'W04', 'W05', 'W06']
# A slow drift in the set voltage across the lot — visible when Insights is
# grouped by wafer, and in the wafer-to-wafer trend of the derived tests.
WAFER_VSET_SHIFT = {'W01': -0.03, 'W02': -0.01, 'W03': 0.0, 'W04': 0.02, 'W05': 0.04, 'W06': 0.06}

VOLTS = [round(-1.5 + 0.1 * i, 1) for i in range(31)]
RESET = [3000 + i for i in range(31)]
SET = [3100 + i for i in range(31)]
CYCLES_LOG = list(range(7))                      # 10^0 .. 10^6
LRS_END = [3200 + i for i in range(7)]
HRS_END = [3300 + i for i in range(7)]
FORM_NUM = 2001

# (test, stdf name, readable name, units, lo, hi) — limits only on the tests
# that decide the bin, so the map's pass/fail means "did it switch".
TESTS: list[tuple[int, str, str, str, float | None, float | None]] = []
for v, t in zip(VOLTS, RESET):
    TESTS.append((t, f'Ireset_{v:+.1f}V', f'Reset I @ {v:+.1f} V', 'uA', None, None))
for v, t in zip(VOLTS, SET):
    TESTS.append((t, f'Iset_{v:+.1f}V', f'Set I @ {v:+.1f} V', 'uA', None, None))
for n, t in zip(CYCLES_LOG, LRS_END):
    TESTS.append((t, f'Ilrs_1e{n}cyc', f'LRS read I @ 1e{n} cycles', 'uA', None, None))
for n, t in zip(CYCLES_LOG, HRS_END):
    TESTS.append((t, f'Ihrs_1e{n}cyc', f'HRS read I @ 1e{n} cycles', 'uA', None, None))
BIN_LIMITS = {SET[-1]: (50.0, None), RESET[0]: (50.0, None), RESET[-1]: (None, 20.0)}
NUM_TESTS = len(TESTS) + 1


def mir(lot_id: str) -> bytes:
    body = (
        u4(0) + u4(0) + u1(1) + c1('P') + c1(' ') + c1(' ') +
        u2(0xFFFF) + c1(' ') +
        cn(lot_id) + cn('RRAM-1T1R') + cn('node-02') + cn('UltraTester-9000') +
        cn('rram_char') + cn('1.0') +
        cn('') * 18
    )
    return record(*MIR, body)


def prr(site: int, x: int, y: int, hbin: int, part_id: int, passed: bool) -> bytes:
    body = (
        u1(1) + u1(site) + b1(0x00 if passed else 0x08) + u2(NUM_TESTS) +
        u2(hbin) + u2(hbin) + i2(x) + i2(y) + u4(100) +
        cn(str(part_id)) + cn('') + b'\x00'
    )
    return record(*PRR, body)


def ptr(test_num: int, site: int, value: float, passed: bool, name: str,
        lo: float | None, hi: float | None, units: str, first: bool) -> bytes:
    """A PTR whose first occurrence always carries units, limits or not — the
    corner-lot helper writes units only for tests with limits."""
    optional = b''
    if first:
        opt_flag = (0x40 if lo is None else 0) | (0x80 if hi is None else 0)
        optional = (
            b1(opt_flag) + b1(0) + b1(0) + b1(0) +
            r4(lo if lo is not None else 0.0) + r4(hi if hi is not None else 0.0) +
            cn(units) + cn('') + cn('') + cn('')
        )
    body = (
        u4(test_num) + u1(1) + u1(site) + b1(0x00 if passed else 0x80) + b1(0x00) +
        r4(value) + cn(name) + cn('') + optional
    )
    return record(*PTR, body)


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))


def die_values(wafer: str, r: float) -> tuple[dict[int, float], str | None]:
    """Values for one die, and a failure mode or None. `r` is radius 0..1."""
    vset = random.gauss(0.50 + WAFER_VSET_SHIFT[wafer] + 0.08 * r * r, 0.05)
    vreset = random.gauss(-0.48 - 0.06 * r * r, 0.05)
    width = random.uniform(0.035, 0.06)
    isat = min(random.gauss(100.0, 6.0), 115.0)      # compliance-limited plateau
    leak = math.exp(random.gauss(0.0, 0.3))          # µA at 0 V
    v0 = 0.28

    mode = None
    u = random.random()
    edge_risk = 0.02 + 0.08 * max(0.0, r - 0.75)
    if u < edge_risk:
        mode = 'no-set'
    elif u < edge_risk + 0.015:
        mode = 'no-reset'

    def floor(v: float) -> float:
        # Leakage: exponential in voltage near 0 V, so the floor still slopes and
        # each series stays strictly monotonic, but saturating at a few µA so it
        # never lifts the compliance plateau.
        e = leak * math.exp(v / v0)
        return e / (1 + e / 5.0)

    vals: dict[int, float] = {}
    noise = lambda x: x * (1 + random.gauss(0, 0.012)) + random.gauss(0, 0.03)
    for v, t in zip(VOLTS, RESET):
        hi = isat * (1 - sigmoid((v - vreset) / width))
        if mode == 'no-reset':
            hi = isat * 0.95
        vals[t] = noise(hi + floor(-v))
    for v, t in zip(VOLTS, SET):
        hi = 0.0 if mode == 'no-set' else isat * sigmoid((v - vset) / width)
        vals[t] = noise(hi + floor(v))

    # Endurance: LRS decays and HRS rises with log cycles, at a rate that
    # varies by die and worsens toward the edge.
    rate = random.gauss(1.0, 0.18) * (1 + 0.35 * r * r)
    lrs0, hrs0 = random.gauss(82.0, 4.0), random.gauss(2.0, 0.4)
    for n, t in zip(CYCLES_LOG, LRS_END):
        vals[t] = noise(lrs0 - rate * 1.3 * n * n)
    for n, t in zip(CYCLES_LOG, HRS_END):
        vals[t] = noise(hrs0 + rate * 1.15 * n * n)
    if mode == 'no-set':
        for t in LRS_END:
            vals[t] = noise(hrs0)
    return vals, mode


def generate(stdf_path: Path) -> None:
    buf = bytearray()
    buf += far()
    buf += mir(LOT)
    # Same grid and die pitch as the corner lot: 16.9 mm fits radius 8 in 300 mm.
    buf += wcr(wafr_siz=300.0, die_ht=16.9, die_wid=16.9, wf_units=3, wf_flat='D',
               center_x=0, center_y=0, pos_x='R', pos_y='U')
    buf += sdr(SITES)

    dies = wafer_dies(8)
    part = 1
    bins = {1: 0, 2: 0, 3: 0, 4: 0}
    for wafer in WAFERS:
        buf += wir(wafer)
        part_cnt = good_cnt = 0
        for start in range(0, len(dies), len(SITES)):
            batch = dies[start:start + len(SITES)]
            for i, _ in enumerate(batch):
                buf += pir(SITES[i])
            for i, (x, y) in enumerate(batch):
                site = SITES[i]
                first = start == 0 and i == 0 and wafer == WAFERS[0]
                vals, mode = die_values(wafer, math.hypot(x, y) / 8.0)
                failed = False
                for t, name, _readable, units, _lo, _hi in TESTS:
                    lo, hi = BIN_LIMITS.get(t, (None, None))
                    v = vals[t]
                    ok = (lo is None or v >= lo) and (hi is None or v <= hi)
                    failed |= not ok
                    buf += ptr(t, site, v, ok, name, lo, hi, units, first)
                formed = random.random() > 0.01
                buf += ftr_rec(FORM_NUM, site, formed, 'forming_check')

                if not formed:
                    hbin = 2
                elif mode == 'no-set' or (failed and vals[SET[-1]] < 50):
                    hbin = 3
                elif mode == 'no-reset' or failed:
                    hbin = 4
                else:
                    hbin = 1
                buf += prr(site, x, y, hbin, part, hbin == 1)
                bins[hbin] += 1
                part += 1
                part_cnt += 1
                good_cnt += hbin == 1
        buf += wrr(wafer, part_cnt, good_cnt)

    names = {1: ('P', 'Pass'), 2: ('F', 'Forming fail'), 3: ('F', 'No set'), 4: ('F', 'No reset')}
    for b, (pf, name) in names.items():
        buf += hbr(b, bins[b], pf, name)
    for b, (pf, name) in names.items():
        buf += sbr(b, bins[b], pf, name)
    stdf_path.write_bytes(buf)

    write_testdefs(stdf_path.with_name(f'{LOT}_testdefs.csv'))
    write_sweeps(stdf_path.with_name(f'{LOT}_sweeps.json'))
    print(f'Written {len(buf):,} bytes → {stdf_path}')
    print(f'  {len(WAFERS)} wafers × {len(dies)} dies, {len(TESTS)} PTR + 1 FTR; bins {bins}')


DERIVED = [
    # (num, name, lo, hi, units, type, expression)
    (900001, 'Set plateau',          60,   None, 'uA',  'P', 'mean(t[3126..3130])'),
    (900002, 'Reset plateau',        60,   None, 'uA',  'P', 'mean(t[3000..3004])'),
    (900003, 'Plateau mismatch',     None, 15,   'uA',  'P', 'abs(t[900001] - t[900002])'),
    (900004, 'Memory window',        1.5,  None, 'dec', 'P', 'log10(t[900001] / max(t[3115], 0.01))'),
    (900005, 'Endurance LRS loss',   None, 65,   '%',   'P', '100 * (1 - t[3206] / t[3200])'),
    (900006, 'Window at 1e5 cycles', 5,    None, 'uA',  'P', 't[3205] - t[3305]'),
    (900007, 'Switching OK',         None, None, '',    'F', 'testPass[2001] and t[900001] > 50 and t[3115] < 5'),
]


def write_testdefs(path: Path) -> None:
    def cell(v: object) -> str:
        s = '' if v is None else str(v)
        return f'"{s}"' if ',' in s else s
    lines = [
        f'# tsmap test definitions — {LOT}',
        '# Readable names for the sweep tests, then derived tests: rows with an',
        '# expression are computed per die from the tests they read (t[n] = value,',
        '# testPass[n] = recorded verdict, 3126..3130 = every test in that range).',
        '# 900003 and 900004 read other derived tests. Numbers 900001+ are unused',
        '# by the tester, as a derived test must not reuse a measured number.',
        'num,name,loLimit,hiLimit,units,testType,expression',
    ]
    for t, _stdf, readable, units, _lo, _hi in TESTS:
        lo, hi = BIN_LIMITS.get(t, (None, None))
        lines.append(','.join(cell(v) for v in (t, readable, lo, hi, units, 'P', None)))
    lines.append(f'{FORM_NUM},Forming check,,,,F,')
    for num, name, lo, hi, units, typ, expr in DERIVED:
        lines.append(','.join(cell(v) for v in (num, name, lo, hi, units, typ, expr)))
    path.write_text('\n'.join(lines) + '\n')
    print(f'Written test definitions → {path}')


def write_sweeps(path: Path) -> None:
    doc = {
        'format': 'tsmap-sweeps',
        'version': 1,
        'sweeps': [
            {
                'id': 'set-reset',
                'title': 'Set / reset switching',
                'xLabel': 'Voltage (V)',
                'yLabel': 'Read current',
                'separationAt': [10, 50],
                'series': [
                    {'label': 'Reset', 'tests': ['3000..3030'], 'xValues': VOLTS},
                    {'label': 'Set', 'tests': ['3100..3130'], 'xValues': VOLTS},
                ],
            },
            {
                'id': 'endurance',
                'title': 'Endurance — read window vs cycling',
                'xLabel': 'Cycles',
                'xScale': 'log',
                'yLabel': 'Read current',
                'separationAt': [30],
                'series': [
                    {'label': 'LRS', 'tests': ['3200..3206'], 'xFromName': '{x}*cyc'},
                    {'label': 'HRS', 'tests': ['3300..3306'], 'xFromName': '{x}*cyc'},
                ],
            },
        ],
    }
    # One series per line, as tsmap's own Save writes it.
    text = json.dumps(doc, indent=2)
    for sweep in doc['sweeps']:
        for s in sweep['series']:
            text = text.replace(json.dumps(s, indent=2).replace('\n', '\n' + ' ' * 8), json.dumps(s))
    path.write_text(text + '\n')
    print(f'Written sweeps → {path}')


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / 'sample_data' / f'{LOT}.stdf'
    generate(out)
