// Wafer geometry supplied by a file's own columns (CSV, JSON, Parquet), turned into the STDF Wafer Configuration Record
// form that `wcrGeometryFrom` (lib.ts) already reads, so one rule builds the map from either source.
//
// A wafer-map die-list export carries the wafer's geometry as ordinary columns: diameter, die width and height, centre
// die, flat, and which way X and Y increase. They arrive as display info (one value per wafer) and used to do nothing.
// A column is taken as geometry only when its header names the field (the labels tsmap and wafermap use, or the STDF
// WCR names) and its cell can be read without guessing:
//
//   - a size needs its unit ("300 mm", "12 in"); a bare number has no unit and is left alone, because acting on an
//     unlabelled measurement is how a map comes out 25 times too large;
//   - a side or direction is a word or its code ("Bottom" or "D").
//
// The first wafer to state a field supplies it; if a later wafer states a different value, the log says so rather than
// the maps quietly using one wafer's geometry for another's.

import type { MetaField } from './types';
import { WCR_FLAT_SIDE, WCR_POS_X, WCR_POS_Y, WCR_UNITS } from './wcr';
import { normalizeHeaderKey } from './headerKey';

type WcrKey = 'wafrSiz' | 'dieWid' | 'dieHt' | 'centerX' | 'centerY' | 'wfFlat' | 'posX' | 'posY';

/**
 * Normalised header → the WCR field it carries. Only the full labels and the STDF names: a bare "Diameter", "Flat" or
 * "Notch" could be about anything in a measurement file (a probe pad, a test structure), and a wrong wafer size redraws
 * every map.
 */
const HEADERS: Readonly<Record<string, WcrKey>> = {
  waferdiameter: 'wafrSiz', wafrsiz: 'wafrSiz',
  diewidth: 'dieWid', diewid: 'dieWid',
  dieheight: 'dieHt', dieht: 'dieHt',
  centrediex: 'centerX', centerdiex: 'centerX', centerx: 'centerX',
  centrediey: 'centerY', centerdiey: 'centerY', centery: 'centerY',
  waferflat: 'wfFlat', wfflat: 'wfFlat',
  xincreases: 'posX', posx: 'posX',
  yincreases: 'posY', posy: 'posY',
};

const SIZE_KEYS: readonly WcrKey[] = ['wafrSiz', 'dieWid', 'dieHt'];

const UNIT_MM: Readonly<Record<string, number>> = {
  mm: 1, millimetre: 1, millimeter: 1, millimetres: 1, millimeters: 1,
  cm: 10, centimetre: 10, centimeter: 10,
  in: 25.4, inch: 25.4, inches: 25.4, '"': 25.4,
  mil: 0.0254,
};

/** The WCR code for a word or code in a side/direction column, or undefined. */
function codeFor(table: Readonly<Record<string, string>>, text: string): string | undefined {
  const t = text.trim().toLowerCase();
  const words: Record<string, string> = { top: 'U', up: 'U', bottom: 'D', down: 'D', left: 'L', right: 'R' };
  const code = words[t] ?? (t.length === 1 ? t.toUpperCase() : undefined);
  return code !== undefined && Object.prototype.hasOwnProperty.call(table, code) ? code : undefined;
}

/** A size cell as millimetres, or undefined when it has no usable number or no unit. */
function sizeMm(text: string): number | undefined {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*([a-z"]+)\s*$/i.exec(text);
  if (!m) return undefined;
  const scale = UNIT_MM[m[2].toLowerCase()];
  const value = Number(m[1]) * (scale ?? NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Read one cell for a field into the raw WCR value, or undefined when it cannot be read without guessing. */
function readCell(key: WcrKey, text: string): string | undefined {
  if (SIZE_KEYS.includes(key)) { const mm = sizeMm(text); return mm === undefined ? undefined : String(mm); }
  if (key === 'centerX' || key === 'centerY') { const n = Number(text); return text.trim() !== '' && Number.isFinite(n) ? String(n) : undefined; }
  if (key === 'wfFlat') return codeFor(WCR_FLAT_SIDE, text);
  if (key === 'posX') return codeFor(WCR_POS_X, text);
  return codeFor(WCR_POS_Y, text);
}

/** The geometry a set of wafers' own columns state, in WCR form (sizes in millimetres), and what disagreed or was skipped. */
export function geometryFromColumns(
  wafers: ReadonlyArray<{ fields?: MetaField[] }>,
  /** The file's lot-level fields: a column with one value for the whole file lands there, not on each wafer. */
  lotFields: readonly MetaField[] = [],
): { fields: MetaField[]; notes: string[] } {
  const taken = new Map<WcrKey, string>();
  const disagreed = new Set<WcrKey>();
  const skipped = new Set<string>();
  for (const wafer of [{ fields: [...lotFields] }, ...wafers]) {
    for (const f of wafer.fields ?? []) {
      const key = HEADERS[normalizeHeaderKey(f.key)];
      if (!key) continue;
      const value = readCell(key, f.value);
      if (value === undefined) { if (f.value.trim() !== '') skipped.add(f.key); continue; }
      const earlier = taken.get(key);
      if (earlier === undefined) taken.set(key, value);
      else if (earlier !== value) disagreed.add(key);
    }
  }
  const notes: string[] = [];
  if (skipped.size) notes.push(`Column${skipped.size > 1 ? 's' : ''} ${[...skipped].map(s => `“${s}”`).join(', ')} not used as wafer geometry: a size needs its unit (“300 mm”), a side or direction a word such as “Bottom”.`);
  if (disagreed.size) notes.push(`Wafers state different values for ${[...disagreed].join(', ')}; the first wafer's value is used for all of them.`);
  const fields: MetaField[] = [...taken].map(([key, value]) => ({ key, value }));
  // Sizes are in millimetres whatever unit the cell used: say so in the one field that names the unit.
  if (SIZE_KEYS.some(k => taken.has(k))) fields.push({ key: 'wfUnits', value: Object.keys(WCR_UNITS).find(c => WCR_UNITS[c]?.symbol === 'mm')! });
  return { fields, notes };
}

/** Whether a file's own fields already state the wafer's geometry: an STDF/ATDF wafer configuration record, which is then never overridden by columns. */
export function hasOwnWcr(fields: readonly MetaField[] | undefined): boolean {
  return !!fields?.some(f => f.key === 'wafrSiz' || f.key === 'dieWid' || f.key === 'dieHt');
}
