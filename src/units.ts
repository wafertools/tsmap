// Test units that differ only by an SI prefix — the same measurement written in
// mV by one file and V by another.
//
// Values stay as each file wrote them (wmap and the parser convert nothing), so
// when files meet in one load, a test they record in different prefixes would be
// a units collision and withheld from every cross-wafer view. It is not a
// different measurement, so this converts the later file's values and limits to
// the unit the first file states, and says so in the log.
//
// Only an exact prefix difference on the same recognised base unit qualifies:
// `mV`/`V`, `nA`/`µA`, `kHz`/`MHz`. Anything else — `V`/`A`, `dB`/`B`, an
// unknown unit, a difference of letter case — stays a collision, because a wrong
// guess rescales real data.

import type { TestDef } from './types';

/** SI prefixes, as powers of ten. Micro accepts the three ways it is written. */
const PREFIX_EXP: Record<string, number> = {
  f: -15, p: -12, n: -9, u: -6, 'µ': -6, 'μ': -6, m: -3, k: 3, M: 6, G: 9, T: 12,
};

/**
 * Base units a prefix may be taken off. A closed list, so `Pa`, `min` or `mil`
 * are never read as a prefix on `a`, `in` or `il`. Case-sensitive: `mV` is
 * milli-volt and `MV` mega-volt.
 */
const BASE_UNITS = new Set(['V', 'A', 's', 'Hz', 'Ω', 'ohm', 'Ohm', 'F', 'H', 'W', 'S', 'm', 'g', 'C', 'J']);

/**
 * Mega and up only on the units that use them in wafer test (MHz, MΩ, GΩ).
 * Some tools upper-case every unit, so `MA` or `MV` next to `A` or `V` is far
 * more likely a mangled `mA`/`mV` than a megaamp — read as mega, it would
 * rescale the data a millionfold.
 */
const LARGE_PREFIX_BASES = new Set(['Hz', 'Ω', 'ohm', 'Ohm']);

/** The readings of a unit string as (power of ten, base unit). */
function readings(unit: string): Array<{ exp: number; base: string }> {
  const out: Array<{ exp: number; base: string }> = [];
  if (BASE_UNITS.has(unit)) out.push({ exp: 0, base: unit });
  const [first, ...rest] = [...unit];
  const base = rest.join('');
  const exp = PREFIX_EXP[first];
  if (exp !== undefined && BASE_UNITS.has(base) && (exp < 6 || LARGE_PREFIX_BASES.has(base))) {
    out.push({ exp, base });
  }
  return out;
}

/**
 * The power of ten that converts a value in `from` to `to` (see `shiftUnit`),
 * when the two differ only by an SI prefix on the same base unit; otherwise
 * `undefined`. Identical strings give 0.
 */
export function unitShift(from: string, to: string): number | undefined {
  const a = from.trim(), b = to.trim();
  if (a === b) return 0;
  // Letter case alone (`mV`/`MV`, `ma`/`mA`) is ambiguous for the same reason.
  if (a.toLowerCase() === b.toLowerCase()) return undefined;
  for (const ra of readings(a)) {
    for (const rb of readings(b)) {
      if (ra.base === rb.base) return ra.exp - rb.exp;
    }
  }
  return undefined;
}

/**
 * `value × 10^shift`, dividing for a negative shift: powers of ten up to 10²²
 * are exact, and division by one is correctly rounded, so 350 mV becomes
 * exactly 0.35 V rather than the 0.35000000000000003 that × 0.001 gives.
 */
export function shiftUnit(value: number, shift: number): number {
  return shift >= 0 ? value * 10 ** shift : value / 10 ** -shift;
}

export interface UnitConversion {
  testNumber: string;
  fileName: string;
  from: string;
  to: string;
}

/**
 * Converts each file's tests to the unit the first file (or `reference`, the
 * already-loaded lot) states, where the two differ only by an SI prefix: every
 * die's value, the test and spec limits, and the unit itself. Changes the files
 * in place — they are this load's own parsed data — and returns what it
 * converted, for the log.
 */
export function harmoniseTestUnits(
  files: Array<{ fileName: string; parsed: { testDefs: Record<string, TestDef>; wafers: Array<{ results: Array<{ testValues?: Record<number, number> }> }> } }>,
  reference: Record<string, TestDef> = {},
): UnitConversion[] {
  const stated = (u: string | undefined) => (u?.trim() ? u.trim() : undefined);
  const unitOf = new Map<string, string>();
  for (const [key, def] of Object.entries(reference)) {
    const u = stated(def.units);
    if (u) unitOf.set(key, u);
  }
  const conversions: UnitConversion[] = [];
  for (const file of files) {
    const scales = new Map<number, number>();
    for (const [key, def] of Object.entries(file.parsed.testDefs)) {
      const unit = stated(def.units);
      if (!unit) continue;
      const target = unitOf.get(key);
      if (target === undefined) { unitOf.set(key, unit); continue; }
      if (unit === target) continue;
      const k = unitShift(unit, target);
      if (k === undefined) continue;   // a real collision — left for unionTestDefs to report
      // Value and limit are scaled by the same operation, so a value exactly on
      // a limit stays exactly on it and inclusive limits judge it the same.
      for (const f of ['loLimit', 'hiLimit', 'loSpec', 'hiSpec'] as const) {
        if (def[f] !== undefined) def[f] = shiftUnit(def[f]!, k);
      }
      def.units = target;
      scales.set(Number(key), k);
      conversions.push({ testNumber: key, fileName: file.fileName, from: unit, to: target });
    }
    if (scales.size === 0) continue;
    for (const wafer of file.parsed.wafers) {
      for (const die of wafer.results) {
        const tv = die.testValues;
        if (!tv) continue;
        for (const [n, k] of scales) {
          const v = tv[n];
          if (v !== undefined) tv[n] = shiftUnit(v, k);
        }
      }
    }
  }
  return conversions;
}
