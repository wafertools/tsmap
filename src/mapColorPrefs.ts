// The user's wafer-map colour choices — the bin colour scheme, the value
// colour scheme, whether that gradient is reversed, and whether colours from a
// bin definitions file are used — remembered across loads and restarts.
//
// wmap keeps bin and value colours as separate preferences (`binColorScheme`,
// `valueColorScheme`), each reported through `onViewOptionsChange`, so this is
// a plain save-on-change / restore-on-mount. It used to be impossible to do
// honestly: wmap had ONE `colorScheme` and reset it to 'default' whenever a bin
// mode was entered, so a saved choice would only ever have described whichever
// mode the user touched last. See WMAP_ISSUES.md #52.

import { listBinColorSchemes, listValueColorSchemes } from '@wafertools/wafermap';
import type { WaferViewOptions } from '@wafertools/wafermap/render';
import { storageKey } from './storageKeys';

const KEY = storageKey('tsmap:map-colors');

export type MapColorPrefs = Pick<
  WaferViewOptions,
  'binColorScheme' | 'valueColorScheme' | 'reverseValueScheme' | 'useDefinedBinColors'
>;

// `reverseValueScheme` belongs here and not with the view state because it sits
// in the same Colour scheme menu as the gradient it flips: persisting the
// gradient but not its direction would restore half of one choice.
const PREF_KEYS: readonly (keyof MapColorPrefs)[] = [
  'binColorScheme', 'valueColorScheme', 'reverseValueScheme', 'useDefinedBinColors',
];

/**
 * The saved choices, to spread into `viewOptions` at mount. Empty when nothing
 * is saved or storage is unavailable, so wmap's own defaults apply.
 *
 * A saved scheme name that is no longer registered is dropped rather than
 * passed through: wmap would quietly draw its default palette while the Colour
 * scheme menu showed nothing ticked — a display that disagrees with its own
 * control.
 */
export function loadMapColorPrefs(): MapColorPrefs {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object') return {};
  const saved = raw as Record<string, unknown>;
  const prefs: MapColorPrefs = {};
  const bin = saved.binColorScheme;
  if (typeof bin === 'string' && listBinColorSchemes().some(s => s.name === bin)) prefs.binColorScheme = bin;
  const value = saved.valueColorScheme;
  if (typeof value === 'string' && listValueColorSchemes().some(s => s.name === value)) prefs.valueColorScheme = value;
  if (typeof saved.reverseValueScheme === 'boolean') prefs.reverseValueScheme = saved.reverseValueScheme;
  if (typeof saved.useDefinedBinColors === 'boolean') prefs.useDefinedBinColors = saved.useDefinedBinColors;
  return prefs;
}

/**
 * `onViewOptionsChange` handler for both the single map and the gallery.
 * Writes only when a colour choice is among the changed keys — every other
 * toolbar change (plot mode, overlays, zoom-adjacent state) passes through
 * without touching storage.
 */
export function saveMapColorPrefs(opts: WaferViewOptions, changed: readonly (keyof WaferViewOptions)[]): void {
  if (!changed.some(k => (PREF_KEYS as readonly string[]).includes(k))) return;
  const prefs: MapColorPrefs = {};
  if (opts.binColorScheme !== undefined) prefs.binColorScheme = opts.binColorScheme;
  if (opts.valueColorScheme !== undefined) prefs.valueColorScheme = opts.valueColorScheme;
  if (opts.reverseValueScheme !== undefined) prefs.reverseValueScheme = opts.reverseValueScheme;
  if (opts.useDefinedBinColors !== undefined) prefs.useDefinedBinColors = opts.useDefinedBinColors;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Unavailable or full — the choice still applies for this session.
  }
}
