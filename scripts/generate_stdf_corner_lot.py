#!/usr/bin/env python3
"""Generate a synthetic STDF file for a typical PVT process-corner lot, plus a
matching wafer-splits CSV (tsmap's "Splits…" import format: `waferId,split`).

Produces: 13 wafers, ~220 dies each, 4-site parallel test, 6 PTR tests
(NMOS/PMOS Vth, NMOS/PMOS Idsat, Ioff leakage, Fmax) + 1 FTR scan test.

Wafer IDs deliberately do NOT encode the corner (W01, W02, ...) — that's the
whole point of the splits feature: corner membership comes from a lot
traveler / fab tracking sheet, not the STDF itself, so it has to be defined
and applied in tsmap rather than parsed. The five classic digital-CMOS
corners are represented, weighted like a real corner-monitor lot (mostly
nominal wafers, a couple of wafers held out per skew corner):

  TT (typical-typical): 5 wafers — nominal Vth/Idsat/Fmax, best yield.
  FF (fast-fast):        2 wafers — low Vth, high Idsat, high Fmax, elevated
                          leakage (some Ioff spec fails).
  SS (slow-slow):        2 wafers — high Vth, low Idsat, low Fmax (some
                          dies fail the min-frequency spec), low leakage.
  FS (N fast / P slow):  2 wafers — skewed NMOS/PMOS, moderate degradation.
  SF (N slow / P fast):  2 wafers — opposite skew, moderate degradation.

Every test is driven by a shared per-die latent "process speed" variable (see
gen_die_values), not independent per-test noise — a locally fast die really
does have lower Vth, higher Idsat, higher leakage, AND higher Fmax all at
once, same as real silicon. This gives the whole lot strong die-level Pearson
correlations (~0.7-0.85) between leakage and Fmax, between NMOS and PMOS
Idsat, etc. — visible in the Charts view's correlation matrix and scatter,
on top of the coarser between-corner separation from CORNER_CENTRES.

Load the .stdf normally, then use the "Splits…" toolbar button → "Load
splits…" to apply the companion _splits.csv and compare corners via the
Charts view's Group-by dropdown.
"""

import math
import random
import sys
from pathlib import Path
from fixture_paths import fixture_path

random.seed(7)

# ── STDF records ──────────────────────────────────────────────────────────────
# One head, as every file here: thin wrappers over the one spec-conformant set of record builders, stdf_spec.py.
import stdf_spec as S

def far() -> bytes: return S.far()
def mir(lot_id: str) -> bytes: return S.mir(lot_id, 'CHIP-PVT', 'corner_test', 'UltraTester-9000', 'node-01', job_rev='1.0')
def sdr(sites: list[int]) -> bytes: return S.sdr(1, 1, sites)
def wir(wafer_id: str) -> bytes: return S.wir(1, wafer_id, site_grp=1)
def wrr(wafer_id: str, part_cnt: int, good_cnt: int) -> bytes: return S.wrr(1, wafer_id, part_cnt, good_cnt, site_grp=1)
def pir(site: int) -> bytes: return S.pir(1, site)
def prr(site: int, x: int, y: int, hbin: int, sbin: int, part_id: int, passed: bool) -> bytes:
    return S.prr(1, site, x, y, hbin, sbin, part_id, passed, num_test=NUM_TESTS)
def ptr_rec(test_num: int, site: int, value: float, passed: bool, test_txt: str,
            lo: float | None, hi: float | None, units: str, first: bool) -> bytes:
    return S.ptr(test_num, 1, site, value, passed, test_txt, lo, hi, units, first)
def ftr_rec(test_num: int, site: int, passed: bool, test_txt: str) -> bytes: return S.ftr(test_num, 1, site, passed, test_txt)
def wcr(wafr_siz: float, die_ht: float, die_wid: float, wf_units: int, wf_flat: str,
        center_x: int, center_y: int, pos_x: str, pos_y: str) -> bytes:
    return S.wcr(wafr_siz, die_ht, die_wid, wf_units, wf_flat, center_x, center_y, pos_x, pos_y)
def hbr(bin_num: int, cnt: int, pf: str, name: str) -> bytes: return S.hbr(bin_num, cnt, pf, name)
def sbr(bin_num: int, cnt: int, pf: str, name: str) -> bytes: return S.sbr(bin_num, cnt, pf, name)

# ── Wafer geometry ──────────────────────────────────────────────────────────

def wafer_dies(radius: int = 8) -> list[tuple[int, int]]:
    return [
        (x, y)
        for y in range(-radius, radius + 1)
        for x in range(-radius, radius + 1)
        if x * x + y * y <= radius * radius * 1.1
    ]

# ── Test definitions ─────────────────────────────────────────────────────────
# (test_num, name, units, lsl, usl, sigma_TT) — spec limits are corner-agnostic
# (a real test program doesn't know which corner it's testing); the corner
# only shifts the underlying distribution, same as silicon does.

# Each die draws latent process variables (see gen_die_values below) and every
# test below is DRIVEN by one of them, not independent gaussian noise — a
# locally fast die really does have lower Vth, higher Idsat, higher leakage,
# AND higher Fmax all at once, same as real silicon. `drive` selects which
# latent variable; `direction` is the sign of that test's response to it;
# `signal` and `noise` are the driven-signal and independent-measurement-noise
# magnitudes (signal:noise ~1.5-2:1 throughout, giving Pearson r ~0.7-0.85
# between same-drive tests — see the module docstring).
TESTS = [
    # (test_num, name, units, lsl, usl, drive, direction, signal, noise)
    (1001, 'vth_n_mV',   'mV', 260.0,  380.0, 'n', -1.0, 12.0,  8.0),
    (1002, 'vth_p_mV',   'mV', 260.0,  380.0, 'p', -1.0, 12.0,  8.0),
    (1003, 'idsat_n_uA', 'uA', 500.0,  900.0, 'n', +1.0, 32.0, 20.0),
    (1004, 'idsat_p_uA', 'uA', 460.0,  840.0, 'p', +1.0, 32.0, 20.0),
    (1005, 'ioff_nA',    'nA',   0.0,   12.0, 'g', +1.0,  1.3,  0.7),
    (1006, 'fmax_MHz',   'MHz', 1600.0, 2200.0, 'g', +1.0, 48.0, 30.0),
]
NUM_TESTS = len(TESTS) + 1  # + the FTR scan test
FT_NUM, FT_NAME = 2001, 'scan_chain'

# Per-corner test centre (overrides the TT centre below) and a sigma
# multiplier — corner wafers run a bit noisier than the nominal baseline.
CORNER_CENTRES: dict[str, dict[int, float]] = {
    'TT': {1001: 320.0, 1002: 320.0, 1003: 700.0, 1004: 650.0, 1005: 5.0, 1006: 1800.0},
    'FF': {1001: 280.0, 1002: 280.0, 1003: 826.0, 1004: 767.0, 1005: 9.0, 1006: 1980.0},
    'SS': {1001: 360.0, 1002: 360.0, 1003: 574.0, 1004: 533.0, 1005: 1.5, 1006: 1638.0},
    'FS': {1001: 285.0, 1002: 355.0, 1003: 805.0, 1004: 552.0, 1005: 6.5, 1006: 1728.0},
    'SF': {1001: 355.0, 1002: 285.0, 1003: 595.0, 1004: 747.0, 1005: 6.5, 1006: 1728.0},
}
CORNER_SIGMA_MULT = {'TT': 1.0, 'FF': 1.2, 'SS': 1.2, 'FS': 1.25, 'SF': 1.25}
# Scan-test fail probability rises with corner skew (setup/hold sensitivity).
CORNER_FT_FAIL_P = {'TT': 0.01, 'FF': 0.02, 'SS': 0.03, 'FS': 0.05, 'SF': 0.05}

SITES = [1, 2, 3, 4]

# Wafer → corner assignment. IDs are plain and sequential — corner membership
# is deliberately NOT recoverable from the STDF, only from the splits CSV.
WAFER_CORNERS: list[tuple[str, str]] = [
    ('W01', 'TT'), ('W02', 'FF'), ('W03', 'TT'), ('W04', 'SS'), ('W05', 'TT'),
    ('W06', 'FS'), ('W07', 'TT'), ('W08', 'SF'), ('W09', 'TT'),
    ('W10', 'FF'), ('W11', 'SS'), ('W12', 'FS'), ('W13', 'SF'),
]

# ── Value generation ─────────────────────────────────────────────────────────

def gen_die_values(corner: str, edge: bool, site: int) -> dict[int, tuple[float, bool]]:
    centres = CORNER_CENTRES[corner]
    sigma_mult = CORNER_SIGMA_MULT[corner]

    # One global latent "die speed" variable (drives leakage + Fmax together,
    # since both respond to the same effective channel-length/oxide variation),
    # plus NMOS/PMOS-side variables that mostly track the global one (shared
    # process factor) with a bit of independent device-side jitter — this is
    # what lets FS/SF's NMOS/PMOS skew coexist with a still-strong global
    # leakage/Fmax correlation.
    z_g = random.gauss(0, 1)
    z_n = z_g + random.gauss(0, 0.3)
    z_p = z_g + random.gauss(0, 0.3)
    z_by_drive = {'g': z_g, 'n': z_n, 'p': z_p}

    result = {}
    for tnum, name, units, lsl, usl, drive, direction, signal, noise in TESTS:
        z = z_by_drive[drive]
        centre = centres[tnum]
        val = centre + direction * signal * z + random.gauss(0, noise * sigma_mult)
        # Mild radial edge degradation, same shape for every corner.
        if edge and random.random() < 0.12:
            val += (usl - lsl) * random.choice([-1, 1]) * 0.35
        passed = lsl <= val <= usl
        result[tnum] = (val, passed)
    return result

# ── Main ──────────────────────────────────────────────────────────────────────

def generate(output_path: Path) -> None:
    buf = bytearray()
    buf += far()
    buf += mir(output_path.stem)
    buf += sdr(SITES)
    # Die pitch must actually contain every die's grid position (radius=8
    # steps, see wafer_dies below) within the 300mm wafer, or wmap correctly
    # rejects it as a geometry-conflict warning (a probed die is always a
    # real, fully-on-wafer position — see buildWaferMap.ts's own
    # `requiredRadius` doc). 16.9mm is the largest pitch that fits this exact
    # grid inside 300mm with a small margin (16.930mm is the maximum before
    # the farthest die's corner clears the boundary — coincidentally almost
    # exactly what wmap's own pitch inference already computed for this
    # fixture pre-WCR, confirming the two are solving the same containment
    # constraint).
    buf += wcr(wafr_siz=300.0, die_ht=16.9, die_wid=16.9, wf_units=3, wf_flat='D',
               center_x=0, center_y=0, pos_x='R', pos_y='U')

    dies = wafer_dies(8)
    part_counter = 1
    lot_good = 0
    bin_counts = {1: 0, 2: 0, 3: 0}

    for wafer_id, corner in WAFER_CORNERS:
        buf += wir(wafer_id)
        part_cnt = good_cnt = 0

        for batch_start in range(0, len(dies), len(SITES)):
            batch = dies[batch_start: batch_start + len(SITES)]

            for site_idx, _ in enumerate(batch):
                buf += pir(SITES[site_idx])

            for site_idx, (x, y) in enumerate(batch):
                site = SITES[site_idx]
                edge = math.sqrt(x * x + y * y) > 6.5
                is_first = (batch_start == 0 and site_idx == 0)

                values = gen_die_values(corner, edge, site)
                failed_tests = [t for t, (_, p) in values.items() if not p]

                for tnum, tname, units, lsl, usl, _drive, _dir, _sig, _noise in TESTS:
                    val, passed = values[tnum]
                    buf += ptr_rec(tnum, site, val, passed, tname, lsl, usl, units, first=is_first)

                ft_passed = random.random() >= CORNER_FT_FAIL_P[corner]
                if not ft_passed:
                    failed_tests.append(FT_NUM)
                buf += ftr_rec(FT_NUM, site, ft_passed, FT_NAME)

                die_passed = len(failed_tests) == 0
                hbin = 1 if die_passed else (2 if len(failed_tests) <= 1 else 3)
                buf += prr(site, x, y, hbin, hbin, part_counter, die_passed)
                bin_counts[hbin] += 1
                part_counter += 1
                part_cnt += 1
                if die_passed:
                    good_cnt += 1
                    lot_good += 1

        buf += wrr(wafer_id, part_cnt, good_cnt)

    # HBR/SBR — hard/soft bin names (hbin and sbin are assigned identically
    # above, so the two catalogs share bin numbers here; a real file's soft
    # bins would usually be more finely split than hard bins).
    buf += hbr(1, bin_counts[1], 'P', 'Pass')
    buf += hbr(2, bin_counts[2], 'F', 'Fail (1 test)')
    buf += hbr(3, bin_counts[3], 'F', 'Fail (multi)')
    buf += sbr(1, bin_counts[1], 'P', 'Pass')
    buf += sbr(2, bin_counts[2], 'F', 'Fail (1 test)')
    buf += sbr(3, bin_counts[3], 'F', 'Fail (multi)')
    buf += S.file_end(part_counter - 1, lot_good)

    output_path.write_bytes(buf)

    splits_path = output_path.with_name(output_path.stem + '_splits.csv')
    lines = [
        '# tsmap wafer splits',
        '# Process-corner assignment for ' + output_path.name,
        'waferId,split',
        *[f'{wid},{corner}' for wid, corner in WAFER_CORNERS],
    ]
    splits_path.write_text('\n'.join(lines) + '\n')

    total_dies = len(WAFER_CORNERS) * len(dies)
    corner_counts = {c: sum(1 for _, cc in WAFER_CORNERS if cc == c) for c in CORNER_CENTRES}
    print(f"Written {len(buf):,} bytes → {output_path}")
    print(f"  {len(WAFER_CORNERS)} wafers × ~{len(dies)} dies = ~{total_dies} die results")
    print(f"  {len(TESTS)} PTR tests + 1 FTR scan test")
    print(f"  Corners: " + ', '.join(f'{c}×{n}' for c, n in corner_counts.items()))
    print(f"Written splits definition → {splits_path}")
    print()
    print("  Load the .stdf, select all tests, then use the toolbar's")
    print("  \"Splits…\" button → \"Load splits…\" to apply the CSV, then set")
    print("  Charts → Group by → Split to compare corners.")


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else fixture_path('corner_lot.stdf')
    generate(out)
