#!/usr/bin/env python3
"""Generate a synthetic two-state switching lot, with the definitions files that
turn it into a sweeps + derived-tests demo.

Produces, next to the output path (default sample_data/SWEEP-LOT-06.stdf):

  SWEEP-LOT-06.stdf           6 wafers, ~220 dies each, 54 PTR tests + 4 FTR
  SWEEP-LOT-06_testdefs.csv   readable names for every test, plus 7 DERIVED
                              tests (rows with an expression)
  SWEEP-LOT-06_plots.json     2 sweeps, as plots for Insights → Plot

Load the .stdf; in the test selector, Load definitions → the _testdefs.csv;
import; then open Insights → Plot → Import plots… → the _plots.json
(or launch with --plots).

THE SWEEPS
----------
1. Up / down switching (tests 5000-5020 and 5100-5120, -2 V to +2 V in 0.2 V
   steps). Two series of read current, one per direction:

     down — high on the left, curving over, then falling steeply at the down
            threshold (about -0.9 V) to a small leakage floor;
     up   — the mirror: a small floor, rising steeply at the up threshold
            (about +0.9 V), curving off into a plateau on the right.

   Each is strictly monotonic (a leakage term keeps even the floor sloping),
   so the pair traces a V: they cross once, near the bottom, and the V's width
   at 10 µA and 50 µA is the voltage window between the two thresholds. The
   thresholds vary die to die, so the p10-p90 band is widest on the steep
   parts — the spread of switching voltages across the population.

2. Endurance (tests 5200-5205 and 5300-5305): the high-state and low-state
   read current after 10^0 .. 10^5 cycles. They converge; the crossing is where
   the median read window closes. The cycle count is read from each test's
   name ("{x}*cyc": the number before "cyc", in `Ihigh_1e3cyc` and in
   `High-state I after 1e3 cycles` alike) and plotted on a log axis, so the
   axis reads cycles, not log10.

Both sweeps name their tests as ranges ("5000..5020"), the syntax a derived
test's expression uses.

THE DERIVED TESTS (numbers 900001+)
-----------------------------------
Up plateau / Down plateau (range means), Plateau mismatch (reads the two
derived plateaus — nesting), State separation in decades (log10 of a derived
over a measured test), Endurance high-state loss (%), Endurance window at 1e4
cycles, and Sweep OK — a functional (pass/fail) test from a recorded verdict
and two comparisons. Each has limits, so they colour maps and feed capability.

Die-level physics is loose and deliberately so: this is a demo of the charts,
not a device model. What is kept honest is the shape the charts are for.
"""

import json
import math
import random
import sys
from pathlib import Path

# Record builders: the corner lot's single-head wrappers over stdf_spec.py (the one spec-conformant set). Its module-level
# random.seed runs on import, so ours is set after.
import stdf_spec as S
from generate_stdf_corner_lot import far, wcr, sdr, hbr, sbr, wir, wrr, pir, ftr_rec, wafer_dies

random.seed(2026)

LOT = 'SWEEP-LOT-06'
SITES = [1, 2, 3, 4]
WAFERS = ['W01', 'W02', 'W03', 'W04', 'W05', 'W06']
# A slow drift in the up threshold across the lot — visible when Insights is
# grouped by wafer, and in the wafer-to-wafer trend of the derived tests.
WAFER_VUP_SHIFT = {'W01': -0.03, 'W02': -0.01, 'W03': 0.0, 'W04': 0.02, 'W05': 0.04, 'W06': 0.06}

VOLTS = [round(-2.0 + 0.2 * i, 1) for i in range(21)]
DOWN = [5000 + i for i in range(21)]
UP = [5100 + i for i in range(21)]
CYCLES_LOG = list(range(6))                      # 10^0 .. 10^5
HIGH_END = [5200 + i for i in range(6)]
LOW_END = [5300 + i for i in range(6)]
INIT_NUM = 2001
# More functional tests, drawn from their own stream so the sweeps keep their values; any one failing is an init fail.
EXTRA_FTR = [(2002, 'contact_check', 0.004), (2003, 'ramp_monotonic', 0.003), (2004, 'readback_crc', 0.002)]
ftr_rng = random.Random(23)

# (test, stdf name, readable name, units, lo, hi) — limits only on the tests
# that decide the bin, so the map's pass/fail means "did it switch".
TESTS: list[tuple[int, str, str, str, float | None, float | None]] = []
for v, t in zip(VOLTS, DOWN):
    TESTS.append((t, f'Idown_{v:+.1f}V', f'Down-sweep I @ {v:+.1f} V', 'uA', None, None))
for v, t in zip(VOLTS, UP):
    TESTS.append((t, f'Iup_{v:+.1f}V', f'Up-sweep I @ {v:+.1f} V', 'uA', None, None))
for n, t in zip(CYCLES_LOG, HIGH_END):
    TESTS.append((t, f'Ihigh_1e{n}cyc', f'High-state I after 1e{n} cycles', 'uA', None, None))
for n, t in zip(CYCLES_LOG, LOW_END):
    TESTS.append((t, f'Ilow_1e{n}cyc', f'Low-state I after 1e{n} cycles', 'uA', None, None))
BIN_LIMITS = {UP[-1]: (50.0, None), DOWN[0]: (50.0, None), DOWN[-1]: (None, 20.0)}
NUM_TESTS = len(TESTS) + 1 + len(EXTRA_FTR)


def mir(lot_id: str) -> bytes:
    return S.mir(lot_id, 'SWITCH-2S', 'sweep_char', 'UltraTester-9000', 'node-02', job_rev='1.0')


def prr(site: int, x: int, y: int, hbin: int, part_id: int, passed: bool) -> bytes:
    return S.prr(1, site, x, y, hbin, hbin, part_id, passed, num_test=NUM_TESTS)


def ptr(test_num: int, site: int, value: float, passed: bool, name: str,
        lo: float | None, hi: float | None, units: str, first: bool) -> bytes:
    """A PTR whose first occurrence always carries units, limits or not."""
    return S.ptr(test_num, 1, site, value, passed, name, lo, hi, units, first)


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))


def die_values(wafer: str, r: float) -> tuple[dict[int, float], str | None]:
    """Values for one die, and a failure mode or None. `r` is radius 0..1."""
    vup = random.gauss(0.90 + WAFER_VUP_SHIFT[wafer] + 0.14 * r * r, 0.09)
    vdown = random.gauss(-0.86 - 0.11 * r * r, 0.09)
    width = random.uniform(0.07, 0.11)
    isat = min(random.gauss(84.0, 5.0), 96.0)        # plateau
    leak = math.exp(random.gauss(0.0, 0.3))          # µA at 0 V
    v0 = 0.5

    mode = None
    u = random.random()
    edge_risk = 0.02 + 0.08 * max(0.0, r - 0.75)
    if u < edge_risk:
        mode = 'no-up'
    elif u < edge_risk + 0.015:
        mode = 'no-down'

    def floor(v: float) -> float:
        # Leakage: exponential in voltage near 0 V, so the floor still slopes and
        # each series stays strictly monotonic, but saturating at a few µA so it
        # never lifts the compliance plateau.
        e = leak * math.exp(v / v0)
        return e / (1 + e / 5.0)

    vals: dict[int, float] = {}
    noise = lambda x: x * (1 + random.gauss(0, 0.012)) + random.gauss(0, 0.03)
    for v, t in zip(VOLTS, DOWN):
        hi = isat * (1 - sigmoid((v - vdown) / width))
        if mode == 'no-down':
            hi = isat * 0.95
        vals[t] = noise(hi + floor(-v))
    for v, t in zip(VOLTS, UP):
        hi = 0.0 if mode == 'no-up' else isat * sigmoid((v - vup) / width)
        vals[t] = noise(hi + floor(v))

    # Endurance: the high state decays and the low state rises with log cycles, at a rate that
    # varies by die and worsens toward the edge.
    rate = random.gauss(1.0, 0.18) * (1 + 0.35 * r * r)
    hi0, lo0 = random.gauss(70.0, 3.5), random.gauss(2.0, 0.4)
    for n, t in zip(CYCLES_LOG, HIGH_END):
        vals[t] = noise(hi0 - rate * 1.6 * n * n)
    for n, t in zip(CYCLES_LOG, LOW_END):
        vals[t] = noise(lo0 + rate * 1.4 * n * n)
    if mode == 'no-up':
        for t in HIGH_END:
            vals[t] = noise(lo0)
    return vals, mode


def generate(stdf_path: Path) -> None:
    buf = bytearray()
    buf += far()
    buf += mir(LOT)
    # Same grid and die pitch as the corner lot: 16.9 mm fits radius 8 in 300 mm.
    buf += sdr(SITES)      # SDRs follow the MIR directly
    buf += wcr(wafr_siz=300.0, die_ht=16.9, die_wid=16.9, wf_units=3, wf_flat='D',
               center_x=0, center_y=0, pos_x='R', pos_y='U')

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
                buf += ftr_rec(INIT_NUM, site, formed, 'init_check')
                for ft_num, ft_name, p_fail in EXTRA_FTR:
                    ok = ftr_rng.random() >= p_fail
                    formed = formed and ok
                    buf += ftr_rec(ft_num, site, ok, ft_name)

                if not formed:
                    hbin = 2
                elif mode == 'no-up' or (failed and vals[UP[-1]] < 50):
                    hbin = 3
                elif mode == 'no-down' or failed:
                    hbin = 4
                else:
                    hbin = 1
                buf += prr(site, x, y, hbin, part, hbin == 1)
                bins[hbin] += 1
                part += 1
                part_cnt += 1
                good_cnt += hbin == 1
        buf += wrr(wafer, part_cnt, good_cnt)

    names = {1: ('P', 'Pass'), 2: ('F', 'Init fail'), 3: ('F', 'No up-switch'), 4: ('F', 'No down-switch')}
    for b, (pf, name) in names.items():
        buf += hbr(b, bins[b], pf, name)
    for b, (pf, name) in names.items():
        buf += sbr(b, bins[b], pf, name)
    buf += S.file_end(part - 1, bins[1])
    stdf_path.write_bytes(buf)

    write_testdefs(stdf_path.with_name(f'{LOT}_testdefs.csv'))
    write_plots(stdf_path.with_name(f'{LOT}_plots.json'))
    print(f'Written {len(buf):,} bytes → {stdf_path}')
    print(f'  {len(WAFERS)} wafers × {len(dies)} dies, {len(TESTS)} PTR + {1 + len(EXTRA_FTR)} FTR; bins {bins}')


DERIVED = [
    # (num, name, lo, hi, units, type, expression)
    (910001, 'Up plateau',           50,   None, 'uA',  'P', 'mean(t[5116..5120])'),
    (910002, 'Down plateau',         50,   None, 'uA',  'P', 'mean(t[5000..5004])'),
    (910003, 'Plateau mismatch',     None, 15,   'uA',  'P', 'abs(t[910001] - t[910002])'),
    (910004, 'State separation',     1.5,  None, 'dec', 'P', 'log10(t[910001] / max(t[5110], 0.01))'),
    (910005, 'Endurance high-state loss', None, 65, '%', 'P', '100 * (1 - t[5205] / t[5200])'),
    (910006, 'Window at 1e4 cycles', 5,    None, 'uA',  'P', 't[5204] - t[5304]'),
    (910007, 'Sweep OK',             None, None, '',    'F', 'testPass[2001] and t[910001] > 50 and t[5110] < 5'),
]


def write_testdefs(path: Path) -> None:
    def cell(v: object) -> str:
        s = '' if v is None else str(v)
        return f'"{s}"' if ',' in s else s
    lines = [
        f'# tsmap test definitions — {LOT}',
        '# Readable names for the sweep tests, then derived tests: rows with an',
        '# expression are computed per die from the tests they read (t[n] = value,',
        '# testPass[n] = recorded verdict, 5116..5120 = every test in that range).',
        '# 910003 and 910004 read other derived tests. Numbers 910001+ are unused',
        '# by the tester, as a derived test must not reuse a measured number.',
        'num,name,loLimit,hiLimit,units,testType,expression',
    ]
    for t, _stdf, readable, units, _lo, _hi in TESTS:
        lo, hi = BIN_LIMITS.get(t, (None, None))
        lines.append(','.join(cell(v) for v in (t, readable, lo, hi, units, 'P', None)))
    lines.append(f'{INIT_NUM},Init check,,,,F,')
    for ft_num, ft_name, _p in EXTRA_FTR:
        lines.append(f'{ft_num},{ft_name.replace("_", " ").capitalize()},,,,F,')
    for num, name, lo, hi, units, typ, expr in DERIVED:
        lines.append(','.join(cell(v) for v in (num, name, lo, hi, units, typ, expr)))
    path.write_text('\n'.join(lines) + '\n')
    print(f'Written test definitions → {path}')


def write_plots(path: Path) -> None:
    """The two sweeps as a wmap plots file: each is a plot with chart "sweep" and its settings under "sweep"."""
    doc = {
        'format': 'wafermap-plots',
        'version': 1,
        'plots': [
            {
                'id': 'up-down',
                'title': 'Up / down switching',
                'chart': 'sweep',
                'sweep': {
                    'xLabel': 'Voltage (V)',
                    'yLabel': 'Read current',
                    'separationAt': [10, 50],
                    'series': [
                        {'label': 'Down', 'tests': ['5000..5020'], 'xValues': VOLTS},
                        {'label': 'Up', 'tests': ['5100..5120'], 'xValues': VOLTS},
                    ],
                },
            },
            {
                'id': 'endurance',
                'title': 'Endurance — read window vs cycling',
                'chart': 'sweep',
                'sweep': {
                    'xLabel': 'Cycles',
                    'xScale': 'log',
                    'yLabel': 'Read current',
                    'separationAt': [30],
                    'series': [
                        {'label': 'High state', 'tests': ['5200..5205'], 'xFromName': '{x}*cyc'},
                        {'label': 'Low state', 'tests': ['5300..5305'], 'xFromName': '{x}*cyc'},
                    ],
                },
            },
        ],
    }
    # One series per line, so a file reads as a table of curves rather than a column of numbers.
    text = json.dumps(doc, indent=2)
    for plot in doc['plots']:
        for s in plot['sweep']['series']:
            text = text.replace(json.dumps(s, indent=2).replace('\n', '\n' + ' ' * 10), json.dumps(s))
    path.write_text(text + '\n')
    print(f'Written plots → {path}')


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / 'sample_data' / f'{LOT}.stdf'
    generate(out)
