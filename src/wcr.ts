// STDF V4 Wafer Configuration Record (WCR) code tables — the one copy of what
// the record's codes mean. `wcrGeometryFrom` (lib.ts) reads them to build the
// map's geometry; the metadata curation (metadata.ts) reads them to show the
// record in plain language. A second copy of "3 means millimetres" is how the
// panel and the map it describes come to disagree.

/**
 * WF_UNITS → the units WAFR_SIZ/DIE_HT/DIE_WID are in. `'0'` ("unknown") maps
 * to `null`: acting on an unlabelled measurement is worse than not using it at
 * all (mirrors the diameter dialog's own "never silently misapply an
 * unconfirmed value" rule). A code absent from this table is outside the spec,
 * which means the record was misread.
 */
export const WCR_UNITS: Readonly<Record<string, { symbol: string; mmPerUnit: number } | null>> = {
  '0': null,
  '1': { symbol: 'in', mmPerUnit: 25.4 },
  '2': { symbol: 'cm', mmPerUnit: 10 },
  '3': { symbol: 'mm', mmPerUnit: 1 },
  '4': { symbol: 'mil', mmPerUnit: 0.0254 },
};

/** WF_FLAT → the side of the wafer the flat/notch is on (U = up, D = down …). */
export const WCR_FLAT_SIDE: Readonly<Record<string, 'top' | 'bottom' | 'left' | 'right'>> = {
  U: 'top', D: 'bottom', L: 'left', R: 'right',
};

/** POS_X → the direction die X coordinates increase in. */
export const WCR_POS_X: Readonly<Record<string, 'left' | 'right'>> = { L: 'left', R: 'right' };

/** POS_Y → the direction die Y coordinates increase in. */
export const WCR_POS_Y: Readonly<Record<string, 'up' | 'down'>> = { U: 'up', D: 'down' };

/**
 * Look a code up in one of the tables above. `undefined` means "not a code
 * the spec defines" (or no code at all) — distinct from `WCR_UNITS`'s `null`,
 * which is the spec's own "unknown". Own-property only, so a stray
 * `toString` in a misread record is not mistaken for a code.
 */
export function wcrCode<T>(table: Readonly<Record<string, T>>, code: string | undefined): T | undefined {
  return code !== undefined && Object.prototype.hasOwnProperty.call(table, code) ? table[code] : undefined;
}
